import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().optional(),
  OPENAI_API_KEY: z.string().min(10),
  OPENAI_IMAGE_SIZE: z.string().default('1024x1024'),
  GREEN_API_BASE_URL: z.string().url(),
  GREEN_API_ID_INSTANCE: z.string().min(1),
  GREEN_API_API_TOKEN: z.string().min(10),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  PUBLIC_WEBHOOK_URL: z.string().url().optional(),
  FACE_DETECT_DISABLED: z.string().optional() // '1' to disable
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_IMAGE_SIZE: process.env.OPENAI_IMAGE_SIZE,
  GREEN_API_BASE_URL: process.env.GREEN_API_BASE_URL,
  GREEN_API_ID_INSTANCE: process.env.GREEN_API_ID_INSTANCE,
  GREEN_API_API_TOKEN: process.env.GREEN_API_API_TOKEN,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  PUBLIC_WEBHOOK_URL: process.env.PUBLIC_WEBHOOK_URL,
  FACE_DETECT_DISABLED: process.env.FACE_DETECT_DISABLED
});









