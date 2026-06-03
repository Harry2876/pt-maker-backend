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
  GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-pro-vision',
  GEMINI_TEXT_MODEL: process.env.GEMINI_TEXT_MODEL || 'gemini-pro',
  ADVANCED_ENGINE_ENABLED: process.env.ADVANCED_ENGINE_ENABLED === 'true',
  ADVANCED_ENGINE_MAX_IMAGES_PER_BATCH: parseInt(process.env.ADVANCED_ENGINE_MAX_IMAGES_PER_BATCH || '10'),
  ADVANCED_ENGINE_TIMEOUT: parseInt(process.env.ADVANCED_ENGINE_TIMEOUT || '30000'),
  PYTHON_AI_API_URL: process.env.PYTHON_AI_API_URL || 'http://localhost:8000',
  PYTHON_AI_API_KEY: process.env.PYTHON_AI_API_KEY,
  PYTHON_AI_TIMEOUT: parseInt(process.env.PYTHON_AI_TIMEOUT || '300000', 10),
  ENABLE_GEMINI_FALLBACK: process.env.ENABLE_GEMINI_FALLBACK === 'true',
  AI_PROCESSING_MAX_RETRIES: parseInt(process.env.AI_PROCESSING_MAX_RETRIES || '2', 10),
  // WhatsApp Business API Configuration  
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN!,
  WHATSAPP_BUSINESS_PHONE_NUMBER_ID: process.env.WHATSAPP_BUSINESS_PHONE_NUMBER_ID!,
  WHATSAPP_API_VERSION: process.env.WHATSAPP_API_VERSION || 'v22.0',
  WHATSAPP_API_BASE_URL: process.env.WHATSAPP_API_BASE_URL || 'https://graph.facebook.com',
};

export default env;