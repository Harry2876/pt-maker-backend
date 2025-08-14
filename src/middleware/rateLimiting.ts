import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// General API rate limit
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests',
    message: 'Please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limit for OTP requests
export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 3, // Only 3 OTP requests per 10 minutes per IP
  message: {
    success: false,
    error: 'Too many OTP requests',
    message: 'Please wait 10 minutes before requesting another OTP'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth rate limit for login attempts
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Only 5 auth attempts per 15 minutes per IP
  message: {
    success: false,
    error: 'Too many authentication attempts',
    message: 'Account temporarily locked. Please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});