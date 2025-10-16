import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
  DISCORD_LOG_LEVEL: process.env.DISCORD_LOG_LEVEL || 'error',
  DISCORD_DEV_WEBHOOK_URL: process.env.DISCORD_DEV_WEBHOOK_URL,
  DISCORD_DEV_LOG_LEVEL: process.env.DISCORD_DEV_LOG_LEVEL || 'debug',
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  R2_ENDPOINT: process.env.R2_ENDPOINT,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
  SWAGGER_USERNAME: process.env.SWAGGER_USERNAME,
  SWAGGER_PASSWORD: process.env.SWAGGER_PASSWORD,
  ENABLE_SWAGGER: process.env.ENABLE_SWAGGER === 'true',
  PRODUCTION_DOMAIN: process.env.PRODUCTION_DOMAIN,
  GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-pro-vision',
  GEMINI_TEXT_MODEL: process.env.GEMINI_TEXT_MODEL || 'gemini-pro',
  ADVANCED_ENGINE_ENABLED: process.env.ADVANCED_ENGINE_ENABLED === 'true',
  ADVANCED_ENGINE_MAX_IMAGES_PER_BATCH: parseInt(process.env.ADVANCED_ENGINE_MAX_IMAGES_PER_BATCH || '10'),
  ADVANCED_ENGINE_TIMEOUT: parseInt(process.env.ADVANCED_ENGINE_TIMEOUT || '30000'),
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID!,
  DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET!,
  DISCORD_REDIRECT_URI: process.env.DISCORD_REDIRECT_URI!,
  FRONTEND_URL: process.env.FRONTEND_URL!,
};

export default env;