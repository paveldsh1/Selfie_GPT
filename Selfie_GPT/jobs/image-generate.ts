import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { imageEdit } from '../lib/openai';
import { saveVariant } from '../lib/storage';
import { sendImageFile, sendText } from '../lib/greenapi';
import { logger } from '../lib/logger';
import { prisma } from '../lib/db';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

export type ImageJob = {
  phoneId: string;
  indexNumber: number;
  mode: number; // 1,2,3
  basePath: string; // can be original or last result
  prompt: string;
};

export const queue = new Queue<ImageJob>('image-generate', { connection });

new Worker<ImageJob>(
  'image-generate',
  async (job) => {
    const { phoneId, indexNumber, mode, basePath, prompt } = job.data;
    // Send original/base file directly to OpenAI without creating normalized temp files
    const buf = await imageEdit({ imagePath: basePath, prompt });
    const saved = await saveVariant(phoneId, indexNumber, mode, buf);
    // Persist Variant in DB
    const photo = await prisma.photo.findUnique({ where: { userId_indexNumber: { userId: phoneId, indexNumber } } });
    if (photo) {
      await prisma.variant.create({ data: { photoId: photo.id, mode, resultPath: saved.fullPath, promptText: prompt } });
    }
    await sendImageFile(phoneId, saved.fullPath, 'Here is the result.');
    // After result, set RESULT_MENU state with index tag
    try {
      const session = await prisma.session.update({ where: { userId: phoneId }, data: { state: 'RESULT_MENU', submenu: `IDX:${String(indexNumber).padStart(4,'0')}` } });
    } catch {}
    await sendText(phoneId, 'Here is the result. Do you want to change anything else?\n1. Add another effect to the result\n2. Add an effect to the original photo\n3. Finish');
    await sendText(phoneId, 'See all previous photos, write LIST');
  },
  { connection }
).on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: String(err) }, 'image-generate failed');
});


