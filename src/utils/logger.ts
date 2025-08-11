import winston from 'winston';
import path from 'path';
import DiscordTransport from './discordTransport';
import env from '../config/env';
import EnhancedDiscordTransport from './enhancedDiscordTransport';
import { validateEnvironment } from './loggerValidation';

let validatedEnv;
try {
  validatedEnv = validateEnvironment();
  console.log('✅ Environment validation passed for logging');
} catch (error) {
  console.error('❌ Environment validation failed:', error);
  validatedEnv = {
    DISCORD_WEBHOOK_URL: env.DISCORD_WEBHOOK_URL,
    DISCORD_LOG_LEVEL: env.DISCORD_LOG_LEVEL || 'info',
    NODE_ENV: process.env.NODE_ENV || 'development'
  };
}

// Create logs directory path
const logsDir = path.join(process.cwd(), 'logs');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Choose the aspect of your log customizing the log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)
);

// Define which transports the logger must use
const transports: any[] = [
  // Console transport
  new winston.transports.Console({
    format: format,
  }),
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(logsDir, 'all.log'),
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  }),
  // File transport for error logs
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  }),
];

// Add Discord transport if webhook URL is provided
if (validatedEnv.DISCORD_WEBHOOK_URL) {
  console.log('🎯 Adding Enhanced Discord transport with webhook URL');
  console.log('🎯 Discord log level:', validatedEnv.DISCORD_LOG_LEVEL);
  
  try {
    transports.push(
      new EnhancedDiscordTransport({
        level: validatedEnv.DISCORD_LOG_LEVEL,
        webhookUrl: validatedEnv.DISCORD_WEBHOOK_URL,
        username: '🎮 BGMI Tournament API Enhanced',
        enableSecurity: validatedEnv.NODE_ENV === 'production',
      })
    );
    console.log('✅ Enhanced Discord transport added successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Enhanced Discord transport:', error);
  }
} else {
  console.log('❌ No Discord webhook URL found in environment');
}

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'warn',
  levels,
  format,
  transports,
});

console.log('📊 Logger created with transports:', transports.length);

export default logger;