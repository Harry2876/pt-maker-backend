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
  DD_API_KEY: process.env.DD_API_KEY,
  DD_APP_KEY: process.env.DD_APP_KEY,
  DD_SITE: process.env.DD_SITE || 'us5.datadoghq.com',
  DD_ENV: process.env.DD_ENV || 'production',
  DD_SERVICE: process.env.DD_SERVICE || 'Scrymz Backend',
  DD_VERSION: process.env.DD_VERSION || '1.0.0',
  ENABLE_DATADOG: process.env.ENABLE_DATADOG === 'true',
  DD_AGENT_HOST: process.env.DD_AGENT_HOST || 'localhost',
  DD_TRACE_AGENT_PORT: parseInt(process.env.DD_TRACE_AGENT_PORT || '8126', 10),
  DD_DOGSTATSD_PORT: parseInt(process.env.DD_DOGSTATSD_PORT || '8125', 10),
};

export default env;