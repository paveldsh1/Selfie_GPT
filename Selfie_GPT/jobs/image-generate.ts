import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { imageEdit } from '../lib/openai';
import { saveVariant } from '../lib/storage';
import { sendImageFile, sendText } from '../lib/greenapi';
import { logger } from '../lib/logger';
import { normalizeToSquare } from '../lib/image';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

export type ImageJob = {
  phoneId: string;
  indexNumber: number;
  mode: number; // 1,2,3
  originalPath: string;
  prompt: string;
};

export const queue = new Queue<ImageJob>('image-generate', { connection });

new Worker<ImageJob>(
  'image-generate',
  async (job) => {
    const { phoneId, indexNumber, mode, originalPath, prompt } = job.data;
    // Normalize original to configured square before sending to OpenAI
    const fs = await import('fs/promises');
    const orig = await fs.readFile(originalPath);
    const normalized = await normalizeToSquare(orig);
    const tmp = `${originalPath}.normalized.png`;
    await fs.writeFile(tmp, normalized);
    const buf = await imageEdit({ imagePath: tmp, prompt });
    const saved = await saveVariant(phoneId, indexNumber, mode, buf);
    await sendImageFile(phoneId, saved.fullPath, 'Here is the result.');
    await sendText(
      phoneId,
      'Here is the result. Do you want to change anything else?\n1. Add another effect to the result\n2. Add an effect to the original photo\n3. Finish'
    );
  },
  { connection }
).on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: String(err) }, 'image-generate failed');
});


