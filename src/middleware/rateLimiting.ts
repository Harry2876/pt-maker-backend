import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import logger from '../utils/logger';
import { ResponseHelper } from '../utils/responseHelper';

// General API rate limit
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn(`Rate limit hit: general | ip=${req.ip} | ${req.method} ${req.path}`);
    res.status(429).json(ResponseHelper.error('Please try again after 15 minutes', 'RATE_LIMIT'));
  },
});

// Strict rate limit for OTP requests
export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn(`Rate limit hit: OTP | ip=${req.ip} | phone=${req.body?.phoneNumber ?? '-'}`);
    res.status(429).json(ResponseHelper.error('Please wait 10 minutes before requesting another OTP', 'RATE_LIMIT'));
  },
});

// Auth rate limit for login attempts
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn(`Rate limit hit: auth | ip=${req.ip} | phone=${req.body?.phoneNumber ?? '-'}`);
    res.status(429).json(ResponseHelper.error('Account temporarily locked. Please try again after 15 minutes', 'RATE_LIMIT'));
  },
});