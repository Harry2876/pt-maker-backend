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


  // Python AI Service
  PYTHON_AI_BASE_URL: z.string().url('Invalid PYTHON_AI_BASE_URL').optional().default('http://localhost:8000'),

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
  // Dev / docs helpers (optional)
  DEV_SECRET: z.string().min(16, 'DEV_SECRET must be at least 16 characters').optional(),
  DOCS_TEST_TOKEN: z.string().optional(),
  ENABLE_DEV_ROUTES: z.string().optional(),
  // Sentry
  SENTRY_DSN: z.string().url('Invalid SENTRY_DSN').optional(),

    // RevenueCat
    REVENUECAT_WEBHOOK_SECRET: z
    .string()
    .min(16, 'REVENUECAT_WEBHOOK_SECRET must be at least 16 characters')
    .optional(),
  REVENUECAT_PRO_ENTITLEMENT_IDS: z
    .string()
    .min(1, 'REVENUECAT_PRO_ENTITLEMENT_IDS is required')
    .default('Scrymz Pro'),
  REVENUECAT_SKIP_WEBHOOK_AUTH: z
    .string()
    .optional()
    .transform(val => val === 'true')
    .default(false),
});

export function validateEnvironment() {
  try {
    const validatedEnv = envSchema.parse(process.env);
    if (validatedEnv.NODE_ENV === 'production') {
      if (!validatedEnv.REVENUECAT_WEBHOOK_SECRET) {
        logger.error('REVENUECAT_WEBHOOK_SECRET is required in production');
        process.exit(1);
      }
      if (validatedEnv.REVENUECAT_SKIP_WEBHOOK_AUTH) {
        logger.error('REVENUECAT_SKIP_WEBHOOK_AUTH must not be true in production');
        process.exit(1);
      }
    }
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