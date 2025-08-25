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
  type: 'login' | 'registration' | 'warning';
  user?: AuthUser;
  message: string;
  success?: boolean;
  errorCode?: string;
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    accessExpiresIn:number;
    refreshExpiresIn:number;
}

export interface AccessTokenPayload {
    userId: string;
    phoneNumber: string;
    sessionId: string;
    jti: string;  //adding jwt id for uniqueness
    type: 'access';
    iat: number;
    exp: number;
}

export interface RefreshTokenPayload {
    userId: string;
    phoneNumber: string;
    sessionId: string;
    jti: string;  //adding jwt id for uniqueness
    type: 'refresh';
    iat: number;
    exp: number;
}

export interface RefreshTokenVerification {
    isValid: boolean;
    sessionId?:string;
    userId?:string;
    phoneNumber?:string;
}

export interface SessionData {
    id:string;
    userId:string;
    deviceInfo?:string;
    ipAddress?:string;
    lastUsedAt: Date;
    createdAt: Date;
    isActive: boolean;
}

export interface SuspiciousLoginData {
    userId: string;
    newIpAddress:string;
    lastKnownIpAddress?: string;
    deviceInfo?: string;
    timestamp: Date; 
}