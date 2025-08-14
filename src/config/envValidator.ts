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
  
  // Encryption
  LOG_ENCRYPTION_KEY: z.string().min(16, 'LOG_ENCRYPTION_KEY must be at least 16 characters'),
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