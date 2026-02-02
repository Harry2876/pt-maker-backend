import { z } from 'zod';
import logger from '../utils/logger';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)),

  // Database
  DATABASE_URL: z.string().url('Invalid DATABASE_URL'),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

  // Redis
  REDIS_HOST: z.string().min(1, 'REDIS_HOST is required'),
  REDIS_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)),
  REDIS_PASSWORD: z.string().optional(),
  // Discord (optional)
  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  DISCORD_LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).optional(),
  DISCORD_DEV_WEBHOOK_URL: z.string().url().optional(),
  DISCORD_DEV_LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).optional(),

  // Discord OAuth Configuration
  DISCORD_CLIENT_ID: z.string().min(10, 'DISCORD_CLIENT_ID is required'),
  DISCORD_CLIENT_SECRET: z.string().min(10, 'DISCORD_CLIENT_SECRET is required'),
  DISCORD_REDIRECT_URI: z.string().url('Invalid DISCORD_REDIRECT_URI'),
  FRONTEND_URL: z.string().url('Invalid FRONTEND_URL'),

  // Encryption
  LOG_ENCRYPTION_KEY: z.string().min(16, 'LOG_ENCRYPTION_KEY must be at least 16 characters'),

  // Cloudflare R2 Configuration
  R2_ENDPOINT: z.string().url('Invalid R2_ENDPOINT URL'),
  R2_BUCKET_NAME: z.string().min(1, 'R2_BUCKET_NAME is required'),
  R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID is required'),
  R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY is required'),
  R2_PUBLIC_URL: z.string().url('Invalid R2_PUBLIC_URL'),

  // Swagger Security (add after existing fields)
  SWAGGER_USERNAME: z.string().min(3, 'SWAGGER_USERNAME must be at least 3 characters').optional(),
  SWAGGER_PASSWORD: z.string().min(8, 'SWAGGER_PASSWORD must be at least 8 characters').optional(),
  ENABLE_SWAGGER: z.string().transform(val => val === 'true').optional().default(false),

  PRODUCTION_DOMAIN: z.string().optional(),

  // Advanced Engine (Gemini) Configuration
  GOOGLE_GEMINI_API_KEY: z.string().min(1, 'GOOGLE_GEMINI_API_KEY is required for Advanced Engine').optional(),
  GEMINI_MODEL: z.string().optional().default('gemini-pro-vision'),
  GEMINI_TEXT_MODEL: z.string().optional().default('gemini-pro'),
  ADVANCED_ENGINE_ENABLED: z.string().transform(val => val === 'true').optional().default(false),
  ADVANCED_ENGINE_MAX_IMAGES_PER_BATCH: z.string().transform(Number).pipe(z.number().min(1).max(50)).optional().default(10),
  ADVANCED_ENGINE_TIMEOUT: z.string().transform(Number).pipe(z.number().min(5000).max(120000)).optional().default(30000),

  PYTHON_AI_API_URL: z.string().url('Invalid PYTHON_AI_API_URL').optional().default('http://localhost:8000'),
  PYTHON_AI_API_KEY: z.string().min(10, 'PYTHON_AI_API_KEY must be at least 10 characters').optional(),
  PYTHON_AI_TIMEOUT: z.string().transform(Number).pipe(z.number().min(10000).max(300000)).optional().default(300000),
  ENABLE_GEMINI_FALLBACK: z.string().transform(val => val === 'true').optional().default(true),
  AI_PROCESSING_MAX_RETRIES: z.string().transform(Number).pipe(z.number().min(1).max(5)).optional().default(2),

  // Security settings
  ALLOWED_ORIGINS: z.string().optional(),
  PRODUCTION_ORIGINS: z.string().optional(),
  ENABLE_CSRF_PROTECTION: z.string().optional().default('true'),
  SESSION_SECURE_COOKIES: z.string().optional().default('false'),
  // WhatsApp Business API Configuration
  WHATSAPP_ACCESS_TOKEN: z.string().min(50, 'WHATSAPP_ACCESS_TOKEN must be a valid Meta access token'),
  WHATSAPP_BUSINESS_PHONE_NUMBER_ID: z.string().min(10, 'WHATSAPP_BUSINESS_PHONE_NUMBER_ID is required'),
  WHATSAPP_API_VERSION: z.string().optional().default('v22.0'),
  WHATSAPP_API_BASE_URL: z.string().url('Invalid WHATSAPP_API_BASE_URL').optional().default('https://graph.facebook.com'),
});

export function validateEnvironment() {
  try {
    const validatedEnv = envSchema.parse(process.env);
    logger.info('✅ Environment validation passed');
    return validatedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('❌ Environment validation failed:');
      error.issues.forEach(err => {
        logger.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    logger.error('💥 Server startup aborted due to environment validation failure');
    process.exit(1);
  }
}

export type ValidatedEnv = z.infer<typeof envSchema>;