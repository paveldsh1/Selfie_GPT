import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { env } from './env';

export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export const moderateText = async (input: string) => {
  const res = await openai.moderations.create({ model: 'omni-moderation-latest', input });
  const flagged = res.results?.[0]?.flagged ?? false;
  return { flagged };
};

export const imageEdit = async (opts: { imagePath: string; prompt: string; size?: string }) => {
  const size = opts.size ?? env.OPENAI_IMAGE_SIZE;
  const stream = fs.createReadStream(opts.imagePath);
  // SDK provides unified images API; specify model explicitly
  const res = await openai.images.edits({ model: 'gpt-image-1', image: [stream as any], prompt: opts.prompt, size });
  const b64 = res.data[0].b64_json!;
  return Buffer.from(b64, 'base64');
};

export const imageVariation = async (opts: { imagePath: string; prompt?: string; size?: string }) => {
  const size = opts.size ?? env.OPENAI_IMAGE_SIZE;
  const stream = fs.createReadStream(opts.imagePath);
  const res = await openai.images.edits({ model: 'gpt-image-1', image: [stream as any], prompt: opts.prompt ?? '', size });
  const b64 = res.data[0].b64_json!;
  return Buffer.from(b64, 'base64');
};


