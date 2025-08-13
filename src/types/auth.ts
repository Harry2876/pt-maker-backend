export interface CachedUser {
    id?: string;
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
    fromCache?: boolean;
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


// Add this interface for consistent user response
export interface AuthUser {
  id: string;
  phoneNumber: string;
  username: string;
  fullName: string;
  organization?: string;
  fromCache: boolean;
  subscription?: any;
}

export interface AuthResponse {
  type: 'login' | 'registration';
  user: AuthUser;
  message: string;
}