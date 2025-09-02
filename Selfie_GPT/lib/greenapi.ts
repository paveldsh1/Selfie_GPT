import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { env } from './env';
import { logger } from './logger';
import { shouldSendText } from './db';
import crypto from 'crypto';

const base = env.GREEN_API_BASE_URL.replace(/\/$/, '');
const instance = env.GREEN_API_ID_INSTANCE;
const token = env.GREEN_API_API_TOKEN;

const api = axios.create({ baseURL: base, timeout: 20000 });

// Простая защита от дублей текстов: не отправляем одно и то же сообщение
// одному и тому же пользователю чаще, чем раз в 30 секунд (память процесса)
const recentText: Map<string, { text: string; ts: number }> = new Map();

const hashText = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export const sendText = async (phoneId: string, message: string) => {
  const now = Date.now();
  const prev = recentText.get(phoneId);
  if (prev && prev.text === message && now - prev.ts < 30000) {
    logger.warn({ phoneId }, 'skip duplicate text within 30s');
    return;
  }
  recentText.set(phoneId, { text: message, ts: now });

  // Доп. защита от дублей на уровне БД (переживает рестарты/ретраи провайдера)
  const ok = await shouldSendText(phoneId, hashText(message), 30000);
  if (!ok) {
    logger.warn({ phoneId }, 'db dedup: skip duplicate text within window');
    return;
  }
  const url = `/waInstance${instance}/sendMessage/${token}`;
  const data = { chatId: `${phoneId}@c.us`, message };
  await api.post(url, data).catch((e) => {
    logger.error({ e: String(e) }, 'greenapi.sendText failed');
    throw e;
  });
};

export const sendImageFile = async (phoneId: string, filePath: string, caption?: string) => {
  const url = `/waInstance${instance}/sendFileByUpload/${token}`;
  const form = new FormData();
  form.append('chatId', `${phoneId}@c.us`);
  form.append('caption', caption ?? '');
  form.append('file', fs.createReadStream(filePath), path.basename(filePath));
  await api.post(url, form, { headers: form.getHeaders() }).catch((e) => {
    logger.error({ e: String(e) }, 'greenapi.sendImageFile failed');
    throw e;
  });
};

export const downloadFile = async (downloadUrl: string): Promise<Buffer> => {
  const res = await axios.get<ArrayBuffer>(downloadUrl, { responseType: 'arraybuffer' });
  return Buffer.from(res.data);
};





