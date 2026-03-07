import { z } from 'zod';
import { PhoneUtils } from '../utils/phoneUtils';

// Add custom phone validation
const phoneNumberSchema = z.string()
  .min(10, 'Phone number must be at least 10 digits')
  .max(15, 'Phone number must be at most 15 digits')
  .transform((phone) => {
    try {
      return PhoneUtils.normalize(phone);
    } catch (error) {
      throw new z.ZodError([{
        code: 'custom',
        message: 'Invalid phone number format. Use +919876543210, 919876543210, or 9876543210',
        path: ['phoneNumber']
      }]);
    }
  });

// Add app version schema
const appVersionSchema = z.string()
  .min(1, 'App version is required')
  .max(20, 'App version must be at most 20 characters')
  .regex(/^\d+\.\d+\.\d+$/, 'App version must be in format x.y.z')
  .optional(); // Optional for now, required later

export const checkUsernameSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must be at most 50 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
});

export const registrationSchema = z.object({
  phoneNumber: phoneNumberSchema,
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must be at most 50 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  fullName: z.string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be at most 100 characters'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  organization: z.string().max(100).optional(),
  appVersion: appVersionSchema
});

export const sendOTPSchema = z.object({
  phoneNumber: phoneNumberSchema,
});

export const verifyOTPSchema = z.object({
  phoneNumber: phoneNumberSchema,
  otp: z.string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d{6}$/, 'OTP must contain only numbers'),
  appVersion: appVersionSchema
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

export const loginSchema = z.object({
  phoneNumber: phoneNumberSchema,
  password: z.string()
    .min(1, 'Password is Required')
    .max(128, 'Password Must be at most 128 Digits')
});

export type LoginRequest = z.infer<typeof loginSchema>;
export type RegistrationRequest = z.infer<typeof registrationSchema>;
export type CheckUsernameRequest = z.infer<typeof checkUsernameSchema>;
export type SendOTPRequest = z.infer<typeof sendOTPSchema>;
export type VerifyOTPRequest = z.infer<typeof verifyOTPSchema>;