import { env } from './env';
import { logger } from './logger';
import path from 'path';

let faceapi: any;
let tf: any;
let canvasLib: any;

let initialized = false;

export const initFaceModels = async () => {
  if (initialized) return;
  if (env.FACE_DETECT_DISABLED === '1') {
    initialized = true;
    logger.warn('face detection disabled via FACE_DETECT_DISABLED=1');
    return;
  }
  const [{ default: face }, tfpkg, canv] = await Promise.all([
    import('@vladmandic/face-api'),
    import('@tensorflow/tfjs'),
    import('canvas')
  ]);
  faceapi = face;
  tf = tfpkg;
  canvasLib = canv;
  await tf.setBackend('wasm');
  await tf.ready();
  const modelsDir = path.join(process.cwd(), 'models');
  await faceapi.nets.tinyFaceDetector.loadFromDisk(modelsDir);
  initialized = true;
  logger.info({ modelsDir }, 'face-api models loaded');
};

export const hasHumanFace = async (imageBuffer: Buffer) => {
  if (!initialized) await initFaceModels();
  if (env.FACE_DETECT_DISABLED === '1') return true;
  const { createCanvas, loadImage } = canvasLib;
  const img = await loadImage(imageBuffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const detections = await faceapi.detectAllFaces(canvas as any, new faceapi.TinyFaceDetectorOptions());
  return detections.length > 0;
};




