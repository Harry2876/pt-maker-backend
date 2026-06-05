import winston from 'winston';
import path from 'path';
import { SentryTransport } from './sentryTransport';

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

winston.addColors(colors);

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)
);

// In production: console/file show info+, Sentry gets everything (debug+)
// In development: console shows debug+, Sentry gets everything (debug+)
const isProd = process.env.NODE_ENV !== 'development';

const transports: any[] = [
  new winston.transports.Console({
    level: isProd ? 'info' : 'debug',
    format: format,
  }),
  new winston.transports.File({
    filename: path.join(logsDir, 'all.log'),
    level: isProd ? 'info' : 'debug',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  }),
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  }),
];

// Sentry transport receives ALL levels — filtered independently
if (process.env.SENTRY_DSN) {
  transports.push(new SentryTransport());
}

// Global level must be 'debug' so all logs reach transports
// Each transport applies its own level filter above
const logger = winston.createLogger({
  level: 'debug',
  levels,
  format,
  transports,
});

export default logger;
