export interface CachedUser {
  phoneNumber: string;
  username: string;
  fullName: string;
  organization?: string;
  password: string;
  isPhoneVerified: boolean;
  registeredAt: string;
  lastLoginAt: string;
  status: 'pending_db_write' | 'synced_to_db';
  cacheTimeStamp: number;
}

export interface AuthData {
  phoneNumber: string;
  username: string;
  fullName: string;
  organization?: string;
  password: string;
}

export interface OTPVerificationData {
  phoneNumber: string;
  otp: string;
  password?: string;
}