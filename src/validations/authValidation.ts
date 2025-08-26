import { z } from 'zod';

export const sendOTPSchema = z.object({
  phoneNumber: z.string()
    .min(10, 'Phone number must be at least 10 digits')
    .max(15, 'Phone number must be at most 15 digits')
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
  type: z.enum(['registration', 'login']).optional().default('registration')
});

export const verifyOTPSchema = z.object({
  phoneNumber: z.string()
    .min(10, 'Phone number must be at least 10 digits')
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
  otp: z.string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d{6}$/, 'OTP must contain only numbers'),

  // For registration
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .optional(),
  fullName: z.string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be at most 100 characters')
    .optional(),
  organization: z.string()
    .max(100, 'Organization name must be at most 100 characters')
    .optional(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1,'Refresh token is required')
});

export const loginSchema = z.object({
  phoneNumber: z.string()
  .min(10,'Phone Number Must be at least 10 Digits')
  .max(15,'Phone Number Must be at most 15 Digits')
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
  password: z.string()
  .min(1,'Password is Required')
  .max(128,'Password Must be at most 128 Digits')
});

export type LoginRequest = z.infer<typeof loginSchema>;

export type SendOTPRequest = z.infer<typeof sendOTPSchema>;
export type VerifyOTPRequest = z.infer<typeof verifyOTPSchema>;