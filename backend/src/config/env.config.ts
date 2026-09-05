import { getEnv } from '../utils/get-env.util';

export const envConfig = {
  NODE_ENV: getEnv('NODE_ENV'),
  PORT: getEnv('PORT'),
  DATABASE_URL: getEnv('DATABASE_URL'),

  JWT_SECRET: getEnv('JWT_SECRET'),
  JWT_EXPIRES_IN: getEnv('JWT_EXPIRES_IN'),

  STRIPE_SECRET_KEY: getEnv('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: getEnv('STRIPE_WEBHOOK_SECRET'),

  CLOUDINARY_CLOUD_NAME: getEnv('CLOUDINARY_CLOUD_NAME'),
  CLOUDINARY_API_KEY: getEnv('CLOUDINARY_API_KEY'),
  CLOUDINARY_API_SECRET: getEnv('CLOUDINARY_API_SECRET'),

  FRONTEND_ORIGIN: getEnv('FRONTEND_ORIGIN'),

  AI_ENABLED: process.env.AI_ENABLED === 'true',
  AI_PROVIDER: process.env.AI_PROVIDER || 'groq',
  AI_MODEL: process.env.AI_MODEL || 'openai/gpt-oss-120b',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
};
