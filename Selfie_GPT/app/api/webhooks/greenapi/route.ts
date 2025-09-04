export const runtime = 'nodejs';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { sendText, sendImageFile, downloadFile } from '@/lib/greenapi';
import { hasHumanFace } from '@/lib/face-detect';
import { saveOriginal, listUserFiles, deleteAllUserData } from '@/lib/storage';
import { ui } from '@/lib/messages';
import { getOrCreateSession, setSessionState, recordPhoto, recordVariant, recordPromptLog, prisma } from '@/lib/db';
import { buildPrompt } from '@/lib/prompt';
import { queue as imageQueue } from '@/jobs/image-generate';
import { getLatestOriginal } from '@/lib/storage';
import { summarizeEdit, moderateText } from '@/lib/openai';
import mime from 'mime-types';

const webhookSchema = z.object({
  typeWebhook: z.string(),
  instanceData: z.any().optional(),
  senderData: z.object({ chatId: z.string(), sender: z.string().optional() }).optional(),
  messageData: z.any()
});

// Анти-дубль для входящих сообщений: запоминаем последний id на короткое время
const recentIncoming: Map<string, { id: string; ts: number }> = new Map();
// Анти-дубль ответов: если подряд приходит тот же текст от того же номера,
// отвечаем только один раз в течение 5000мс
const recentTextIn: Map<string, { text: string; ts: number }> = new Map();

export async function POST(req: NextRequest) {
  // Read raw to tolerate non-standard content-types and odd payloads
  const raw = await req.text().catch(() => '');
  
  logger.info({ 
    hasBody: Boolean(raw),
    bodyLength: raw.length,
    contentType: req.headers.get('content-type'),
    userAgent: req.headers.get('user-agent')
  }, 'webhook incoming request');
  
  if (!raw) {
    logger.warn({ msg: 'webhook empty body' }, 'webhook empty');
    // Do not force retries on provider side
    return Response.json({ ok: true });
  }
  
  let body: unknown;
  try {
    body = JSON.parse(raw);
    logger.info({ 
      bodyKeys: Object.keys(body as object || {}),
      bodyType: typeof body 
    }, 'webhook body parsed successfully');
  } catch (e) {
    logger.warn({ e: String(e), raw: raw.slice(0, 500) }, 'webhook bad json');
    // Acknowledge to avoid retry storms; nothing we can do with non-JSON
    return Response.json({ ok: true });
  }

  // Детальное логирование структуры webhook перед валидацией
  logger.info({
    rawBody: body,
    typeWebhook: (body as any)?.typeWebhook,
    hasSenderData: Boolean((body as any)?.senderData),
    senderDataStructure: (body as any)?.senderData,
    hasMessageData: Boolean((body as any)?.messageData),
    messageDataKeys: Object.keys((body as any)?.messageData || {}),
    instanceData: (body as any)?.instanceData
  }, 'webhook structure before validation');

  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) {
    logger.error({ 
      issues: parsed.error.issues,
      fullBody: body,
      zodError: parsed.error.format()
    }, 'webhook schema validation failed - DETAILED');
    return Response.json({ ok: true });
  }

  logger.info({ 
    typeWebhook: parsed.data.typeWebhook,
    senderDataValid: Boolean(parsed.data.senderData),
    chatId: parsed.data.senderData?.chatId,
    sender: parsed.data.senderData?.sender,
    messageType: parsed.data.messageData?.typeMessage
  }, 'webhook schema validation passed');

  const { senderData, messageData, instanceData } = parsed.data;
  
  // Проверяем наличие senderData
  if (!senderData || !senderData.chatId) {
    logger.warn({
      typeWebhook: parsed.data.typeWebhook,
      hasSenderData: Boolean(senderData),
      senderData: senderData,
      messageDataKeys: Object.keys(messageData || {})
    }, 'webhook missing senderData or chatId - skipping');
    return Response.json({ ok: true });
  }
  
  const phoneId = senderData.chatId.replace(/@c\.us$/, '');
  logger.info({ type: parsed.data.typeWebhook, phoneId, kind: messageData?.typeMessage }, 'incoming webhook');

  // Обрабатываем входящие и только исходящие СООБЩЕНИЯ, отправленные через API
  const type = parsed.data.typeWebhook;
  
  logger.info({
    webhookType: type,
    willProcess: type === 'incomingMessageReceived',
    phoneId
  }, 'webhook type check');
  
  if (!(type === 'incomingMessageReceived')) {
    logger.info({ type, phoneId }, 'skipping non-incoming webhook');
    return Response.json({ ok: true });
  }

  try {
    // Дедуп входящих: некоторые провайдеры присылают одно и то же событие дважды
    if (type === 'incomingMessageReceived') {
      const incId = String(
        messageData?.idMessage ||
        messageData?.messageData?.idMessage ||
        messageData?.timestamp ||
        messageData?.textMessageData?.textMessage ||
        ''
      );
      if (incId) {
        const prev = recentIncoming.get(phoneId);
        const now = Date.now();
        if (prev && prev.id === incId && now - prev.ts < 10000) {
          return Response.json({ ok: true });
        }
        recentIncoming.set(phoneId, { id: incId, ts: now });
      }
    }

    // игнор исходящих событий больше не нужен — сюда уже не попадут, т.к. выше пропускаем всё, что не incoming

    const session0 = await getOrCreateSession(phoneId);
    if (messageData.typeMessage === 'imageMessage') {
      const url = messageData?.downloadUrl || messageData?.fileMessageData?.downloadUrl;
      logger.info({ phoneId, hasUrl: Boolean(url) }, 'imageMessage received');
      if (!url) {
        logger.warn({ phoneId }, 'no downloadUrl in imageMessage');
        await sendText(phoneId, 'Could not download the image. Please resend.');
        return Response.json({ ok: true });
      }
      const bin = await downloadFile(url);
      const faceOk = await hasHumanFace(bin).catch((e) => {
        logger.error({ e: String(e) }, 'face-detect failed');
        return false;
      });
      if (!faceOk) {
        logger.warn({ phoneId }, 'no human face detected');
        await sendText(phoneId, ui.notHuman);
        return Response.json({ ok: true });
      }
      // Save original
      const ext = mime.extension(messageData?.fileMessageData?.mimeType || 'image/jpeg') || 'jpg';
      const saved = await saveOriginal(phoneId, bin, ext);
      // persist in DB
      await recordPhoto(phoneId, saved.indexNumber, saved.fullPath, messageData?.fileMessageData?.mimeType || 'image/jpeg');
      logger.info({ phoneId, ext }, 'original saved, awaiting bot selection');
      await setSessionState(phoneId, 'TOP_MENU');
      await sendText(phoneId, ui.topMenu);
      await sendText(phoneId, ui.askSelectBot);
      return Response.json({ ok: true });
    }

    if (messageData.typeMessage === 'textMessage' || messageData.typeMessage === 'extendedTextMessage' || messageData.typeMessage === 'quotedMessage') {
      logger.info({
        phoneId,
        messageType: messageData.typeMessage,
        messageDataKeys: Object.keys(messageData || {}),
        textMessageData: messageData?.textMessageData,
        extendedTextMessageData: messageData?.extendedTextMessageData,
        quotedMessage: messageData?.quotedMessage
      }, 'processing text message - DETAILED');
      
      const rawText = (
        messageData?.textMessageData?.textMessage ??
        messageData?.extendedTextMessageData?.text ??
        messageData?.extendedTextMessageData?.textMessage ??
        messageData?.quotedMessage?.textMessage ??
        messageData?.message?.text ??
        ''
      );
      const text = String(rawText || '').trim();
      
      logger.info({
        phoneId,
        rawText,
        extractedText: text,
        textLength: text.length
      }, 'text extraction result');
      
      // Убрана блокировка дублей входящих сообщений (5 секунд)
      // const prevIn = recentTextIn.get(phoneId);
      // const nowIn = Date.now();
      // if (prevIn && prevIn.text === text && nowIn - prevIn.ts < 5000) {
      //   logger.info({ phoneId, text }, 'duplicate text message - skipping');
      //   return Response.json({ ok: true });
      // }
      // recentTextIn.set(phoneId, { text, ts: nowIn });
      let t = text.toLowerCase();
      
      // Нормализация команд: убираем точки, скобки, пробелы
      const normalizedCommand = t.replace(/[.\)\(\s]/g, '');
      
      // Проверяем является ли это простой командой (цифра или буква)
      if (/^[1-3]$/.test(normalizedCommand)) {
        t = normalizedCommand;
      } else if (/^[a-f]$/.test(normalizedCommand)) {
        t = normalizedCommand;
      }
      
      logger.info({ 
        phoneId, 
        originalText: text, 
        normalizedText: t,
        normalizedCommand,
        isSimpleCommand: /^[1-3a-f]$/.test(normalizedCommand)
      }, 'textMessage received and processed');

      // Top-level commands
      if (t === 'menu') {
        await setSessionState(phoneId, 'TOP_MENU', null, 0);
        await sendText(phoneId, ui.topMenu);
        await sendText(phoneId, ui.askSelectBot);
        return Response.json({ ok: true });
      }
      if (t === 'template') {
        await sendText(phoneId, ui.templateIntro);
        await sendText(phoneId, ui.templateFilled('RESULT', process.env.OPENAI_IMAGE_SIZE || '1024x1024'));
        return Response.json({ ok: true });
      }
      if (t === 'list') {
        logger.info({ phoneId }, 'processing list command');
        // По ТЗ: показываем первые 5 изображений с подсказкой
        const { files, total } = await listUserFiles(phoneId, 0, 5);
        
        logger.info({ 
          phoneId, 
          filesCount: files.length, 
          totalFiles: total,
          filesList: files 
        }, 'list command - files retrieved');
        
        if (files.length === 0) {
          logger.info({ phoneId }, 'no files found - sending message');
          await sendText(phoneId, 'No photos found. Upload a selfie first.');
          return Response.json({ ok: true });
        }
        
        for (let i = 0; i < files.length; i++) {
          const isLast = i === files.length - 1;
          logger.info({ 
            phoneId, 
            fileIndex: i, 
            fileName: files[i], 
            isLast 
          }, 'sending file from list');
          
          // По ТЗ: подсказка на последнем фото если есть еще фото (больше 5), иначе меню
          const caption = isLast ? (total > 5 ? ui.listHint(total) : ui.listEndHint) : undefined;
          await sendImageFile(phoneId, files[i], caption);
        }
        
        // Сохраняем offset = files.length для команды "+"
        const currentSession = await getOrCreateSession(phoneId);
        await setSessionState(phoneId, currentSession.state, currentSession.submenu, files.length);
        
        logger.info({ phoneId, sentFiles: files.length }, 'list command completed');
        return Response.json({ ok: true });
      }
      if (t === '+') {
        const sessionPlus = await getOrCreateSession(phoneId);
        const currentOffset = sessionPlus.paginationOffset ?? 0;
        const { files, total } = await listUserFiles(phoneId, currentOffset, 5);
        
        if (files.length === 0) {
          await sendText(phoneId, ui.listEndHint);
          return Response.json({ ok: true });
        }
        
        for (let i = 0; i < files.length; i++) {
          const isLast = i === files.length - 1;
          const newOffset = currentOffset + files.length;
          const caption = isLast ? (newOffset < total ? ui.listHint(total) : ui.listEndHint) : undefined;
          await sendImageFile(phoneId, files[i], caption);
        }
        await setSessionState(phoneId, sessionPlus.state, sessionPlus.submenu, currentOffset + files.length);
        return Response.json({ ok: true });
      }
      if (t === '-' || t === 'delete' || t === 'del') {
        logger.warn({ phoneId }, 'delete all requested');
        await deleteAllUserData(phoneId);
        await sendText(phoneId, 'All your data has been deleted.');
        return Response.json({ ok: true });
      }
      if (t === 'end') {
        logger.info({ phoneId }, 'requesting new photo upload');
        await setSessionState(phoneId, 'TOP_MENU', null, 0);
        await sendText(phoneId, ui.askUpload);
        return Response.json({ ok: true });
      }

      // Handle top menu bot selection FIRST (before checking for selfie)
      const sessionTop = await getOrCreateSession(phoneId);
      
      logger.info({
        phoneId,
        userInput: t,
        sessionState: sessionTop.state,
        isTopMenuSelection: sessionTop.state === 'TOP_MENU' && ['1','2','3'].includes(t),
        isResultMenuSelection: sessionTop.state === 'RESULT_MENU' && ['1','2','3'].includes(t)
      }, 'checking session state and command');
      
      // Result menu after a generated image (HIGHEST PRIORITY)
      if (sessionTop.state === 'RESULT_MENU' && ['1','2','3'].includes(t)) {
        const idxMatch = (sessionTop.submenu || '').match(/IDX:(\d{1,4})/);
        const idx = idxMatch ? Number(idxMatch[1]) : null;
        
        logger.info({ phoneId, resultMenuChoice: t, idx }, 'processing result menu selection');
        
        if (t === '3') {
          logger.info({ phoneId }, 'finishing session from result menu');
          await setSessionState(phoneId, 'MENU', null, 0);
          await sendText(phoneId, ui.finishOk);
          await sendText(phoneId, ui.mainMenu);
          return Response.json({ ok: true });
        }
        const base = t === '1' ? 'RESULT' : 'ORIGINAL';
        const baseTag = `BASE:${base}` + (idx ? `;IDX:${String(idx).padStart(4, '0')}` : '');
        
        logger.info({ phoneId, base, baseTag }, 'setting base for next generation');
        await setSessionState(phoneId, 'MENU', baseTag, 0);
        await sendText(phoneId, ui.mainMenu);
        return Response.json({ ok: true });
      }
      
      if (sessionTop.state === 'TOP_MENU' && ['1','2','3'].includes(t)) {
        logger.info({ phoneId, selectedBot: t }, 'processing top menu bot selection');
        
        if (t === '1') {
          logger.info({ phoneId }, 'selected Selfie bot - checking for selfie requirement');
          // Only check for selfie when user selects Selfie bot
          const latestOrig = await getLatestOriginal(phoneId);
          if (!latestOrig) {
            await sendText(phoneId, ui.askUpload);
            return Response.json({ ok: true });
          }
          logger.info({ phoneId }, 'selfie found - transitioning to main menu');
          await setSessionState(phoneId, 'MENU', null, 0);
          await sendText(phoneId, ui.mainMenu);
          return Response.json({ ok: true });
        }
        if (t === '2') {
          logger.info({ phoneId }, 'redirecting to YXO bot');
          await sendText(phoneId, ui.yxoRedirect);
          return Response.json({ ok: true });
        }
        if (t === '3') {
          logger.info({ phoneId }, 'redirecting to Bot3');
          await sendText(phoneId, ui.bot3Redirect);
          return Response.json({ ok: true });
        }
      }

      // If user has not uploaded any selfie yet, ask to upload (only for non-bot selection)
      const latestOrig = await getLatestOriginal(phoneId);
      if (!latestOrig) {
        await sendText(phoneId, ui.askUpload);
        return Response.json({ ok: true });
      }

      // Natural language mapping to main options (only when in MENU state)
      if (sessionTop.state === 'MENU' && !['list', '+', '-', 'delete', 'del'].includes(t) && !['1','2','3'].includes(t)) {
        if (/scene|effect/i.test(text)) t = '3';
        else if (/styliz|anime|cartoon|painting|art/i.test(text)) t = '2';
        else if (/edit|realism|glasses|makeup|hair|beard|mustache|clothes|background/i.test(text)) t = '1';
      }

      // Mode selection 1/2/3 → ask details
      if (['1', '2', '3'].includes(t)) {
        const map: Record<string, 'realism' | 'stylize' | 'scene'> = { '1': 'realism', '2': 'stylize', '3': 'scene' };
        const type = map[t];
        
        logger.info({
          phoneId,
          userInput: t,
          mappedType: type,
          currentSessionState: sessionTop.state
        }, 'processing mode selection 1/2/3');
        
        await setSessionState(phoneId, type, sessionTop.submenu);
        const ask = type === 'realism' ? ui.askRealismDetail : type === 'stylize' ? ui.askStylizeDetail : ui.askSceneDetail;
        
        logger.info({
          phoneId,
          newState: type,
          messageToSend: ask
        }, 'sending detail selection menu');
        
        await sendText(phoneId, ask);
        return Response.json({ ok: true });
      }



      // If we are in a mode, treat text as detail: build GPT prompt and enqueue image job
      if (['realism', 'stylize', 'scene'].includes(sessionTop.state)) {
        const type = sessionTop.state as 'realism' | 'stylize' | 'scene';
        // Submenu letters mapping
        if (['a','b','c','d','e','f'].includes(t)) {
          // Preserve BASE tag while adding submenu choice
          const currentSubmenu = sessionTop.submenu || '';
          const baseMatch = currentSubmenu.match(/BASE:(RESULT|ORIGINAL);IDX:\d{4}/);
          const newSubmenu = baseMatch ? `${baseMatch[0]};${t}` : t;
          await setSessionState(phoneId, sessionTop.state, newSubmenu);
          
          // Показываем примеры для выбранной категории
          let exampleText = '';
          if (type === 'realism' && ui.realismExamples[t as keyof typeof ui.realismExamples]) {
            exampleText = ui.realismExamples[t as keyof typeof ui.realismExamples];
          } else if (type === 'stylize' && ui.stylizeExamples[t as keyof typeof ui.stylizeExamples]) {
            exampleText = ui.stylizeExamples[t as keyof typeof ui.stylizeExamples];
          } else if (type === 'scene' && ui.sceneExamples[t as keyof typeof ui.sceneExamples]) {
            exampleText = ui.sceneExamples[t as keyof typeof ui.sceneExamples];
          }
          
          if (exampleText) {
            await sendText(phoneId, exampleText);
          }
          
          await sendText(phoneId, ui.askOwnOption);
          return Response.json({ ok: true });
        }
        // If submenu was f and user sends non-latin text, ask in English
        const isLatin = /^[\p{L}\p{N}\p{P}\p{Zs}]*$/u.test(text) && /[A-Za-z]/.test(text);
        const submenuChoice = (sessionTop.submenu || '').split(';').pop() || '';
        if ((submenuChoice === 'f' || submenuChoice === 'F') && !isLatin) {
          await sendText(phoneId, 'Please describe in English.');
          return Response.json({ ok: true });
        }
        const userText = text;
        if (!userText) {
          await sendText(phoneId, ui.askOwnOption);
          return Response.json({ ok: true });
        }
        // moderation
        const mod = await moderateText(userText);
        if (mod.flagged) {
          await sendText(phoneId, ui.indecent);
          return Response.json({ ok: true });
        }
        // GPT summarize  
        const summary = await summarizeEdit(type, userText, submenuChoice || undefined);
        await recordPromptLog(phoneId, type, userText, summary);
        const latest = await getLatestOriginal(phoneId);
        if (!latest) {
          await sendText(phoneId, 'Please upload a selfie first.');
          return Response.json({ ok: true });
        }
        const mode = type === 'realism' ? 1 : type === 'stylize' ? 2 : 3;

        // Select base path according to submenu BASE tag if any
        let basePath = latest.fullPath;
        let indexForSave = latest.indexNumber;
        const sub = sessionTop.submenu || '';
        
        logger.info({
          phoneId,
          submenu: sub,
          latestOriginalPath: latest.fullPath,
          latestIndexNumber: latest.indexNumber
        }, 'base path selection - initial values');
        
        const baseMatch = sub.match(/BASE:(RESULT|ORIGINAL)/i);
        if (baseMatch && baseMatch[1].toUpperCase() === 'RESULT') {
          const idxMatch = sub.match(/IDX:(\d{4})/);
          const idx = idxMatch ? Number(idxMatch[1]) : latest.indexNumber;
          indexForSave = idx;
          
          logger.info({
            phoneId,
            baseType: 'RESULT',
            indexToUse: idx,
            idxFromSubmenu: idxMatch?.[1]
          }, 'using RESULT as base - searching for last variant');
          
          const photo = await prisma.photo.findUnique({ where: { userId_indexNumber: { userId: phoneId, indexNumber: idx } } });
          if (photo) {
            const lastVar = await prisma.variant.findFirst({ where: { photoId: photo.id }, orderBy: { createdAt: 'desc' } });
            
            logger.info({
              phoneId,
              photoId: photo.id,
              lastVariantFound: Boolean(lastVar),
              lastVariantPath: lastVar?.resultPath,
              lastVariantMode: lastVar?.mode,
              lastVariantCreatedAt: lastVar?.createdAt
            }, 'last variant search result');
            
            if (lastVar?.resultPath) {
              basePath = lastVar.resultPath;
              logger.info({
                phoneId,
                oldBasePath: latest.fullPath,
                newBasePath: basePath
              }, 'base path updated to use last result');
            }
          } else {
            logger.warn({
              phoneId,
              indexNumber: idx
            }, 'photo not found for result base path');
          }
        }
        
        logger.info({
          phoneId,
          finalBasePath: basePath,
          finalIndexForSave: indexForSave,
          isUsingResult: baseMatch && baseMatch[1].toUpperCase() === 'RESULT'
        }, 'final base path selection result');

        const job = await imageQueue.add('gen', {
          phoneId,
          indexNumber: indexForSave,
          mode,
          basePath,
          prompt: summary
        });
        logger.info({ phoneId, jobId: job.id, mode }, 'image job enqueued');
        await sendText(phoneId, 'Processing… I will send the result soon.');
        await setSessionState(phoneId, 'MENU', null, 0);
        return Response.json({ ok: true });
      }

      // Default fallback: keep main menu if selfie exists (we checked above), otherwise ask upload
      logger.info({ phoneId }, 'fallback to askUpload');
      await sendText(phoneId, ui.askUpload);
      return Response.json({ ok: true });
    }

    // Fallback for non-text non-image: show menu
    await sendText(phoneId, ui.mainMenu);
    return Response.json({ ok: true });
  } catch (e) {
    logger.error({ e: String(e), phoneId }, 'webhook error');
    return Response.json({ ok: false }, { status: 500 });
  }
}


