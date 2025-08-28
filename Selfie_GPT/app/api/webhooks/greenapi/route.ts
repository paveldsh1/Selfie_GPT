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
  senderData: z.object({ chatId: z.string(), sender: z.string().optional() }),
  messageData: z.any()
});

export async function POST(req: NextRequest) {
  // Read raw to tolerate non-standard content-types and odd payloads
  const raw = await req.text().catch(() => '');
  if (!raw) {
    logger.warn({ msg: 'webhook empty body' }, 'webhook empty');
    // Do not force retries on provider side
    return Response.json({ ok: true });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch (e) {
    logger.warn({ e: String(e), raw: raw.slice(0, 500) }, 'webhook bad json');
    // Acknowledge to avoid retry storms; nothing we can do with non-JSON
    return Response.json({ ok: true });
  }

  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, 'webhook schema failed');
    return Response.json({ ok: true });
  }

  const { senderData, messageData, instanceData } = parsed.data;
  const phoneId = senderData.chatId.replace(/@c\.us$/, '');
  logger.info({ type: parsed.data.typeWebhook, phoneId, kind: messageData?.typeMessage }, 'incoming webhook');

  // Process incoming messages; also allow self-chat (outgoingMessageReceived where chatId === instance wid)
  const type = parsed.data.typeWebhook;
  const wid: string | undefined = (instanceData?.wid as string | undefined) || undefined;
  const isSelfChat = Boolean(wid && senderData.chatId === wid);
  if (!(type === 'incomingMessageReceived' || (type === 'outgoingMessageReceived' && isSelfChat))) {
    return Response.json({ ok: true });
  }

  try {
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
      const rawText = (
        messageData?.textMessageData?.textMessage ??
        messageData?.extendedTextMessageData?.text ??
        messageData?.extendedTextMessageData?.textMessage ??
        messageData?.quotedMessage?.textMessage ??
        messageData?.message?.text ??
        ''
      );
      const text = String(rawText || '').trim();
      let t = text.toLowerCase();
      logger.info({ phoneId, text }, 'textMessage received');

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
        const { files, total } = await listUserFiles(phoneId, 0, 5);
        for (const file of files) {
          logger.info({ phoneId, file }, 'send image from list');
          await sendImageFile(phoneId, file);
        }
        if (total > files.length) {
          await sendText(phoneId, ui.listHint(total));
        } else {
          await sendText(phoneId, ui.listEndHint);
        }
        return Response.json({ ok: true });
      }
      if (t === '+') {
        const session = await getOrCreateSession(phoneId);
        const next = (session.paginationOffset ?? 0) + 5;
        const { files, total } = await listUserFiles(phoneId, next, 5);
        for (const file of files) await sendImageFile(phoneId, file);
        await setSessionState(phoneId, session.state, session.submenu, next);
        if (next + files.length < total) await sendText(phoneId, ui.listHint(total));
        else await sendText(phoneId, ui.listEndHint);
        return Response.json({ ok: true });
      }
      if (t === '-' || t === 'delete' || t === 'del') {
        logger.warn({ phoneId }, 'delete all requested');
        await deleteAllUserData(phoneId);
        await sendText(phoneId, 'All your data has been deleted.');
        return Response.json({ ok: true });
      }
      if (t === 'end') {
        logger.info({ phoneId }, 'send main menu by command');
        await setSessionState(phoneId, 'MENU', null, 0);
        await sendText(phoneId, ui.mainMenu);
        return Response.json({ ok: true });
      }

      // If user has not uploaded any selfie yet, ask to upload
      const latestOrig = await getLatestOriginal(phoneId);
      if (!latestOrig) {
        await sendText(phoneId, ui.askUpload);
        return Response.json({ ok: true });
      }

      // Handle top menu bot selection
      const sessionTop = await getOrCreateSession(phoneId);
      if (sessionTop.state === 'TOP_MENU' && ['1','2','3'].includes(t)) {
        if (t === '1') {
          await setSessionState(phoneId, 'MENU', null, 0);
          await sendText(phoneId, ui.mainMenu);
          return Response.json({ ok: true });
        }
        // YXO or Bot3 placeholder/redirect
        await sendText(phoneId, ui.yxoRedirect);
        return Response.json({ ok: true });
      }

      // Natural language mapping to main options
      if (!['list', '+', '-', 'delete', 'del'].includes(t) && !['1','2','3'].includes(t)) {
        if (/scene|effect/i.test(text)) t = '3';
        else if (/styliz|anime|cartoon|painting|art/i.test(text)) t = '2';
        else if (/edit|realism|glasses|makeup|hair|beard|mustache|clothes|background/i.test(text)) t = '1';
      }

      // Mode selection 1/2/3 → ask details
      if (['1', '2', '3'].includes(t)) {
        const map: Record<string, 'realism' | 'stylize' | 'scene'> = { '1': 'realism', '2': 'stylize', '3': 'scene' };
        const type = map[t];
        await setSessionState(phoneId, type);
        const ask = type === 'realism' ? ui.askRealismDetail : type === 'stylize' ? ui.askStylizeDetail : ui.askSceneDetail;
        await sendText(phoneId, ask);
        return Response.json({ ok: true });
      }

      // Result menu after a generated image
      const session = await getOrCreateSession(phoneId);
      if (session.state === 'RESULT_MENU' && ['1','2','3'].includes(t)) {
        const idxMatch = (session.submenu || '').match(/IDX:(\d{1,4})/);
        const idx = idxMatch ? Number(idxMatch[1]) : null;
        if (t === '3') {
          await setSessionState(phoneId, 'MENU', null, 0);
          await sendText(phoneId, ui.finishOk);
          await sendText(phoneId, ui.mainMenu);
          return Response.json({ ok: true });
        }
        const base = t === '1' ? 'RESULT' : 'ORIGINAL';
        const baseTag = `BASE:${base}` + (idx ? `;IDX:${String(idx).padStart(4, '0')}` : '');
        await setSessionState(phoneId, 'MENU', baseTag, 0);
        await sendText(phoneId, ui.mainMenu);
        return Response.json({ ok: true });
      }

      // If we are in a mode, treat text as detail: build GPT prompt and enqueue image job
      if (['realism', 'stylize', 'scene'].includes(session.state)) {
        const type = session.state as 'realism' | 'stylize' | 'scene';
        // Submenu letters mapping
        if (['a','b','c','d','e','f'].includes(t)) {
          await setSessionState(phoneId, session.state, t);
          await sendText(phoneId, ui.askOwnOption);
          return Response.json({ ok: true });
        }
        // If submenu was f and user sends non-latin text, ask in English
        const isLatin = /^[\p{L}\p{N}\p{P}\p{Zs}]*$/u.test(text) && /[A-Za-z]/.test(text);
        if ((session.submenu === 'f' || session.submenu === 'F') && !isLatin) {
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
        const summary = await summarizeEdit(type, userText, session.submenu || undefined);
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
        const sub = session.submenu || '';
        const baseMatch = sub.match(/BASE:(RESULT|ORIGINAL)/i);
        if (baseMatch && baseMatch[1].toUpperCase() === 'RESULT') {
          const idxMatch = sub.match(/IDX:(\d{4})/);
          const idx = idxMatch ? Number(idxMatch[1]) : latest.indexNumber;
          indexForSave = idx;
          const photo = await prisma.photo.findUnique({ where: { userId_indexNumber: { userId: phoneId, indexNumber: idx } } });
          if (photo) {
            const lastVar = await prisma.variant.findFirst({ where: { photoId: photo.id }, orderBy: { createdAt: 'desc' } });
            if (lastVar?.resultPath) basePath = lastVar.resultPath;
          }
        }

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


