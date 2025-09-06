import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
  DISCORD_LOG_LEVEL: process.env.DISCORD_LOG_LEVEL || 'error',
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  R2_ENDPOINT: process.env.R2_ENDPOINT,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
  SWAGGER_USERNAME: process.env.SWAGGER_USERNAME ,
  SWAGGER_PASSWORD: process.env.SWAGGER_PASSWORD ,
  ENABLE_SWAGGER: process.env.ENABLE_SWAGGER === 'true',
};

export default env;