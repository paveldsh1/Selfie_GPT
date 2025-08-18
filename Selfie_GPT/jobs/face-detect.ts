import 'dotenv/config';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../lib/logger';
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'util';

// Polyfill for libs expecting browser TextEncoder/TextDecoder
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g: any = globalThis as any;
if (!g.TextEncoder) g.TextEncoder = NodeTextEncoder;
if (!g.TextDecoder) g.TextDecoder = NodeTextDecoder as any;
g.util = g.util || {};
if (!g.util.TextEncoder) g.util.TextEncoder = NodeTextEncoder;
if (!g.util.TextDecoder) g.util.TextDecoder = NodeTextDecoder as any;

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

let initialized = false;
let blazeface: any;
let tf: any;
async function init(model: 'tiny' | 'ssd') {
  if (initialized) return;
  // Dynamic imports AFTER polyfill
  const blaze = await import('@tensorflow-models/blazeface');
  const tfpkg = await import('@tensorflow/tfjs');
  blazeface = blaze as any;
  tf = tfpkg as any;
  try { await tf.setBackend('cpu'); } catch {}
  await tf.ready();
  // blazeface loads its own weights
  initialized = true;
  logger.info({ model: 'blazeface' }, 'face worker models loaded');
}

type JobData = { filePath: string; model: 'tiny' | 'ssd'; threshold: number; inputSize: number };

new Worker<JobData>(
  'face-detect',
  async (job) => {
    const { filePath, model, threshold, inputSize } = job.data;
    await init(model);
    const buf = await fs.readFile(filePath);
    let img: any;
    if ((tf as any).node?.decodeImage) {
      img = (tf as any).node.decodeImage(buf, 3);
    } else {
      const jpeg = await import('jpeg-js');
      const raw = (jpeg as any).default ? (jpeg as any).default.decode(buf, { useTArray: true }) : (jpeg as any).decode(buf, { useTArray: true });
      // raw: { data: Uint8Array(RGBA), width, height }
      const rgb = tf.tensor3d(raw.data, [raw.height, raw.width, 4]).slice([0,0,0],[raw.height, raw.width, 3]);
      img = rgb;
    }
    const net = await blazeface.load();
    const preds = await net.estimateFaces(img as any, false);
    const hasFace = Array.isArray(preds) && preds.length > 0;
    img.dispose?.();
    return { hasFace };
  },
  { connection }
).on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: String(err) }, 'face-detect failed');
});


