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

  DD_API_KEY: z.string().min(1, 'DD_API_KEY is required when Datadog is enabled').optional(),
  DD_APP_KEY: z.string().min(1, 'DD_APP_KEY is required when Datadog is enabled').optional(),
  DD_SITE: z.string().optional().default('us5.datadoghq.com'),
  DD_ENV: z.string().optional().default('production'),
  DD_SERVICE: z.string().optional().default('Scrymz Backend'),
  DD_VERSION: z.string().optional().default('1.0.0'),
  ENABLE_DATADOG: z.string().transform(val => val === 'true').optional().default(false),
    DD_AGENT_HOST: z.string().optional().default('localhost'),
  DD_TRACE_AGENT_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).optional().default(8126),
  DD_DOGSTATSD_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).optional().default(8125),

  // Discord (optional)
  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  DISCORD_LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).optional(),
  DISCORD_DEV_WEBHOOK_URL: z.string().url().optional(),
  DISCORD_DEV_LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).optional(),

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

  // Security settings
  ALLOWED_ORIGINS: z.string().optional(),
  PRODUCTION_ORIGINS: z.string().optional(),
  ENABLE_CSRF_PROTECTION: z.string().optional().default('true'),
  SESSION_SECURE_COOKIES: z.string().optional().default('false'),
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