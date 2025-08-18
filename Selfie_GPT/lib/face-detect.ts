import { env } from './env';
import { logger } from './logger';
import IORedis from 'ioredis';
import { Queue, QueueEvents } from 'bullmq';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});
const faceQueue = new Queue('face-detect', { connection });
const faceEvents = new QueueEvents('face-detect', { connection });
// Ensure events are ready
// eslint-disable-next-line @typescript-eslint/no-floating-promises
faceEvents.waitUntilReady();

export const hasHumanFace = async (imageBuffer: Buffer): Promise<boolean> => {
  if (env.FACE_DETECT_DISABLED === '1') return true;
  // Persist buffer to temp file for worker
  const tmpDir = path.join(os.tmpdir(), 'selfie-gpt');
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `${randomUUID()}.jpg`);
  await fs.writeFile(tmpFile, imageBuffer);
  try {
    const job = await faceQueue.add('detect', {
      filePath: tmpFile,
      model: env.FACE_DETECT_MODEL || 'ssd',
      threshold: Number(env.FACE_DETECT_THRESHOLD ?? '0.5'),
      inputSize: Number(env.FACE_DETECT_INPUT ?? '416')
    });
    const result = (await job.waitUntilFinished(faceEvents, 60000)) as { hasFace: boolean };
    return !!result?.hasFace;
  } catch (e) {
    logger.error({ e: String(e) }, 'face-detect worker error');
    return false;
  } finally {
    fs.unlink(tmpFile).catch(() => {});
  }
};




