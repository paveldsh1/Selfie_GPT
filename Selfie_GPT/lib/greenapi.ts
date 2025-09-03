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
  logger.info({
    phoneId,
    messageLength: message.length,
    messagePreview: message.substring(0, 100)
  }, 'sendText called');
  
  // Убрана блокировка дублей в памяти (30 секунд)
  // const now = Date.now();
  // const prev = recentText.get(phoneId);
  // if (prev && prev.text === message && now - prev.ts < 30000) {
  //   logger.warn({ phoneId }, 'skip duplicate text within 30s');
  //   return;
  // }
  // recentText.set(phoneId, { text: message, ts: now });

  // Убрана блокировка дублей на уровне БД
  // const ok = await shouldSendText(phoneId, hashText(message), 30000);
  // if (!ok) {
  //   logger.warn({ phoneId }, 'db dedup: skip duplicate text within window');
  //   return;
  // }
  
  logger.info({
    phoneId,
    apiInstance: instance,
    chatId: `${phoneId}@c.us`,
    messageHash: hashText(message).substring(0, 8)
  }, 'sending text via Green API');
  
  const url = `/waInstance${instance}/sendMessage/${token}`;
  const data = { chatId: `${phoneId}@c.us`, message };
  
  try {
    const response = await api.post(url, data);
    logger.info({
      phoneId,
      responseStatus: response.status,
      responseData: response.data
    }, 'sendText success');
  } catch (e) {
    logger.error({ 
      phoneId,
      error: String(e),
      url,
      data
    }, 'greenapi.sendText failed');
    throw e;
  }
};

export const sendImageFile = async (phoneId: string, filePath: string, caption?: string) => {
  logger.info({
    phoneId,
    filePath,
    fileExists: fs.existsSync(filePath),
    caption: caption || 'no caption'
  }, 'sendImageFile called');
  
  if (!fs.existsSync(filePath)) {
    logger.error({ phoneId, filePath }, 'sendImageFile: file does not exist');
    throw new Error(`File not found: ${filePath}`);
  }
  
  const url = `/waInstance${instance}/sendFileByUpload/${token}`;
  const form = new FormData();
  form.append('chatId', `${phoneId}@c.us`);
  form.append('caption', caption ?? '');
  form.append('file', fs.createReadStream(filePath), path.basename(filePath));
  
  try {
    const response = await api.post(url, form, { headers: form.getHeaders() });
    logger.info({
      phoneId,
      filePath,
      responseStatus: response.status,
      responseData: response.data
    }, 'sendImageFile success');
  } catch (e) {
    logger.error({ 
      phoneId,
      filePath,
      error: String(e)
    }, 'greenapi.sendImageFile failed');
    throw e;
  }
};

export const downloadFile = async (downloadUrl: string): Promise<Buffer> => {
  const res = await axios.get<ArrayBuffer>(downloadUrl, { responseType: 'arraybuffer' });
  return Buffer.from(res.data);
};





