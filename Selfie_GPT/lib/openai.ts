import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { env } from './env';

export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const ALLOWED_SIZES = ['256x256', '512x512', '1024x1024', '1024x1536', '1536x1024', 'auto'] as const;
type AllowedImageSize = (typeof ALLOWED_SIZES)[number];

export const moderateText = async (input: string) => {
  const res = await openai.moderations.create({ model: 'omni-moderation-latest', input });
  const flagged = res.results?.[0]?.flagged ?? false;
  return { flagged };
};

export const imageEdit = async (opts: { imagePath: string; prompt: string; size?: string }) => {
  const rawSize = opts.size ?? env.OPENAI_IMAGE_SIZE;
  const size: AllowedImageSize = (ALLOWED_SIZES as readonly string[]).includes(rawSize || '')
    ? (rawSize as AllowedImageSize)
    : '1024x1024';
  
  // Create File object with proper MIME type
  const buffer = fs.readFileSync(opts.imagePath);
  const ext = path.extname(opts.imagePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const fileName = path.basename(opts.imagePath);
  
  const file = new File([buffer], fileName, { type: mimeType });
  
  // SDK provides unified images API; specify model explicitly
  const res = await openai.images.edit({ model: 'gpt-image-1', image: file, prompt: opts.prompt, size });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI Images edit returned empty data');
  return Buffer.from(b64, 'base64');
};

export const imageVariation = async (opts: { imagePath: string; prompt?: string; size?: string }) => {
  const rawSize = opts.size ?? env.OPENAI_IMAGE_SIZE;
  const size: AllowedImageSize = (ALLOWED_SIZES as readonly string[]).includes(rawSize || '')
    ? (rawSize as AllowedImageSize)
    : '1024x1024';
  
  // Create File object with proper MIME type
  const buffer = fs.readFileSync(opts.imagePath);
  const ext = path.extname(opts.imagePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const fileName = path.basename(opts.imagePath);
  
  const file = new File([buffer], fileName, { type: mimeType });
  
  const res = await openai.images.edit({ model: 'gpt-image-1', image: file, prompt: opts.prompt ?? '', size });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI Images edit returned empty data');
  return Buffer.from(b64, 'base64');
};

export const summarizeEdit = async (
  type: 'realism' | 'stylize' | 'scene',
  userText: string,
  submenu?: string
) => {
  const sys =
    type === 'realism'
      ? 'You generate concise, realistic edit goals for a human selfie. Keep face identity.'
      : type === 'stylize'
      ? 'You generate concise, artistic style goals for a human selfie.'
      : 'You generate concise scene/effect goals while preserving the user face.';
  const hint = submenu ? `Category: ${submenu}. ` : '';
  const prompt = `${hint}User wrote: "${userText}". Reply with a short goal only.`;
  const chat = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 100
  });
  return chat.choices[0]?.message?.content?.trim() || userText.trim();
};


