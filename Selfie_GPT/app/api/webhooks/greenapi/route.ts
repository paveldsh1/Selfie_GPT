import { NextRequest } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { sendText, sendImageFile, downloadFile } from '@/lib/greenapi';
import { hasHumanFace } from '@/lib/face-detect';
import { saveOriginal, listUserFiles, deleteAllUserData } from '@/lib/storage';
import { ui } from '@/lib/messages';
import { getOrCreateSession, setSessionState } from '@/lib/db';
import mime from 'mime-types';

const webhookSchema = z.object({
  typeWebhook: z.string(),
  instanceData: z.any().optional(),
  senderData: z.object({ chatId: z.string(), sender: z.string().optional() }),
  messageData: z.any()
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ ok: false }, { status: 400 });

  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) return Response.json({ ok: false }, { status: 400 });

  const { senderData, messageData } = parsed.data;
  const phoneId = senderData.chatId.replace(/@c\.us$/, '');
  logger.info({ type: parsed.data.typeWebhook, phoneId, kind: messageData?.typeMessage }, 'incoming webhook');

  try {
    await getOrCreateSession(phoneId);
    if (messageData.typeMessage === 'imageMessage') {
      const url = messageData?.downloadUrl || messageData?.fileMessageData?.downloadUrl;
      logger.info({ phoneId, hasUrl: Boolean(url) }, 'imageMessage received');
      if (!url) {
        logger.warn({ phoneId }, 'no downloadUrl in imageMessage');
        await sendText(phoneId, 'Could not download the image. Please resend.');
        return Response.json({ ok: true });
      }
      const bin = await downloadFile(url);
      const faceOk = await hasHumanFace(bin).catch(() => false);
      if (!faceOk) {
        logger.warn({ phoneId }, 'no human face detected');
        await sendText(phoneId, ui.notHuman);
        return Response.json({ ok: true });
      }
      // Save original
      const ext = mime.extension(messageData?.fileMessageData?.mimeType || 'image/jpeg') || 'jpg';
      await saveOriginal(phoneId, bin, ext);
      logger.info({ phoneId, ext }, 'original saved, sending main menu');
      await sendText(phoneId, ui.mainMenu);
      return Response.json({ ok: true });
    }

    if (messageData.typeMessage === 'textMessage') {
      const text = (messageData?.textMessageData?.textMessage || '').trim();
      const t = text.toLowerCase();
      logger.info({ phoneId, text }, 'textMessage received');
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
      if (['menu', 'end'].includes(t)) {
        logger.info({ phoneId }, 'send main menu by command');
        await sendText(phoneId, ui.mainMenu);
        return Response.json({ ok: true });
      }
      // For now, echo the main menu for unrecognized text
      logger.info({ phoneId, t }, 'unrecognized text, send main menu');
      await sendText(phoneId, ui.mainMenu);
      return Response.json({ ok: true });
    }

    // Fallback
    await sendText(phoneId, ui.askUpload);
    return Response.json({ ok: true });
  } catch (e) {
    logger.error({ e: String(e), phoneId }, 'webhook error');
    return Response.json({ ok: false }, { status: 500 });
  }
}


