import sharp from 'sharp';
import { env } from './env';

export const normalizeToSquare = async (input: Buffer): Promise<Buffer> => {
  const [wStr, hStr] = env.OPENAI_IMAGE_SIZE.split('x');
  const size = Number(wStr || 1024);
  const img = sharp(input).rotate();
  const meta = await img.metadata();
  const bg = { r: 0, g: 0, b: 0, alpha: 0 } as const;

  if (env.IMAGE_FIT === 'contain') {
    return await img
      .resize({ width: size, height: size, fit: 'contain', background: bg })
      .png()
      .toBuffer();
  }

  if (env.IMAGE_FIT === 'cover-center') {
    return await img
      .resize({ width: size, height: size, fit: 'cover', position: 'centre' })
      .png()
      .toBuffer();
  }

  // cover-attention: approximate center of attention via entropy-based crop
  const stats = await img.stats();
  const position = 'attention' as const;
  return await img
    .resize({ width: size, height: size, fit: 'cover', position })
    .png()
    .toBuffer();
};


