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
let faceapi: any;
let tf: any;
let createCanvas: any;
let loadImage: any;
async function init(model: 'tiny' | 'ssd') {
  if (initialized) return;
  // Dynamic imports AFTER polyfill
  const face = await import('@vladmandic/face-api/dist/face-api.esm.js');
  const tfpkg = await import('@tensorflow/tfjs');
  const canv = await import('canvas');
  faceapi = face as any;
  tf = tfpkg as any;
  createCanvas = (canv as any).createCanvas;
  loadImage = (canv as any).loadImage;
  try { await tf.setBackend('cpu'); } catch {}
  await tf.ready();
  const modelsDir = path.join(process.cwd(), 'models');
  if (model === 'ssd') await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsDir);
  else await faceapi.nets.tinyFaceDetector.loadFromDisk(modelsDir);
  initialized = true;
  logger.info({ modelsDir, model }, 'face worker models loaded');
}

type JobData = { filePath: string; model: 'tiny' | 'ssd'; threshold: number; inputSize: number };

new Worker<JobData>(
  'face-detect',
  async (job) => {
    const { filePath, model, threshold, inputSize } = job.data;
    await init(model);
    const img = await loadImage(await fs.readFile(filePath));
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    let hasFace = false;
    if (model === 'ssd') {
      const detections = await faceapi.detectAllFaces(canvas as any, new faceapi.SsdMobilenetv1Options({ minConfidence: threshold }));
      hasFace = detections.length > 0;
    } else {
      const detections = await faceapi.detectAllFaces(canvas as any, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: threshold }));
      hasFace = detections.length > 0;
    }
    return { hasFace };
  },
  { connection }
).on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: String(err) }, 'face-detect failed');
});


