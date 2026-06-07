import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
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
  // WhatsApp Business API Configuration  
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN!,
  WHATSAPP_BUSINESS_PHONE_NUMBER_ID: process.env.WHATSAPP_BUSINESS_PHONE_NUMBER_ID!,
  WHATSAPP_API_VERSION: process.env.WHATSAPP_API_VERSION || 'v22.0',
  WHATSAPP_API_BASE_URL: process.env.WHATSAPP_API_BASE_URL || 'https://graph.facebook.com',
  // Dev / docs helpers
  DEV_SECRET: process.env.DEV_SECRET,
  DOCS_TEST_TOKEN: process.env.DOCS_TEST_TOKEN,
  ENABLE_DEV_ROUTES: process.env.ENABLE_DEV_ROUTES === 'true',
  // Sentry
  SENTRY_DSN: process.env.SENTRY_DSN,
};

export default env;