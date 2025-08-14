import { BaseService } from "./baseService";
import { QueueService } from "./queueService";
import redis from "../config/redis";
import jwt from "jsonwebtoken";
import { AuthData, OTPVerificationData, CachedUser, AuthUser, AuthResponse, TokenPair, AccessTokenPayload, RefreshTokenPayload, SessionData, SuspiciousLoginData } from '../types/auth';
import { PasswordService } from "./passwordService";
import bcrypt from 'bcrypt';
import crypto from 'crypto'
import { success } from "zod";
import { stat } from "fs";
import { isMapIterator } from "util/types";
import { create } from "domain";
import { createDecipheriv } from "crypto";
import { Session } from "inspector/promises";
import { ref } from "process";

export class AuthService extends BaseService {

    private generateSecureOTP(): string {
    // Use crypto.randomInt for cryptographically secure random numbers
    const otp = crypto.randomInt(100000, 999999).toString();
    return otp;
}

    //generate otp and send via queue
    async sendOTP(phoneNumber: string, type: 'registration' | 'login' = 'registration') {

        try {
            //generate 6 digit otp
            const otp = Math.floor(100000 + Math.random() * 900000).toString();

            //generate temp user id for tracking
            const tempUserId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

            //add to queue for processing
            await QueueService.sendOTP({
                phoneNumber,
                otp,
                type,
                userId: tempUserId
            });

            this.logger.info(`OTP Generation Requested to ${phoneNumber} for ${type} with temp user ID ${tempUserId}`);

            return {
                success: true,
                message: `OTP sent successfully to ${phoneNumber}`,
                expiresIn: 300
            };
        } catch (error) {
            this.handleError(error, 'Send OTP');
            throw error;
        }
    }

    //verify otp from redis
    async verifyOTPFromRedis(phoneNumber: string, otp: string): Promise<boolean> {
        try {
            const key = `phone_otp:${phoneNumber}`;
            const storedOTP = await redis.get(key);

            if (!storedOTP) {
                this.logger.warn(`No OTP found in Redis for ${phoneNumber}`);
                return false;
            }

            if (storedOTP == otp) {
                //delete the otp after successfull verification
                await redis.delete(key);
                this.logger.info(`OTP verified successfully for ${phoneNumber}`);
                return true;
            }

            this.logger.warn(`OTP verification failed for ${phoneNumber}. Incorrect OTP provided.`);
            return false;
        } catch (error) {
            this.logger.error(`Error verifying OTP for ${phoneNumber}:`, error);
            return false;
        }
    }

    //verify the otp and register or login user
    async verifyOTPAndAuth(verificationData: OTPVerificationData, userData?: AuthData) {
        try {
            const isValidOTP = await this.verifyOTPFromRedis(verificationData.phoneNumber, verificationData.otp);

            if (!isValidOTP) {
                throw new Error("Invalid or OTP Expired");
            }
            //check if the user exists
            let dbUser = await this.db.user.findFirst({
                where: {
                    phoneNumber: verificationData.phoneNumber
                },
                include: {
                    subscription: true
                }
            });

            if (dbUser) {
                //existing user, just update the last login time
                await this.db.user.update({
                    where: { id: dbUser.id },
                    data: {
                        updatedAt: new Date()
                    }
                });

                this.logger.info(`User ${dbUser.id} logged in with phone ${verificationData.phoneNumber}`);

                // Return consistent AuthUser format
                const authUser: AuthUser = {
                    id: dbUser.id,
                    phoneNumber: dbUser.phoneNumber,
                    username: dbUser.username,
                    fullName: dbUser.fullName || '',
                    organization: dbUser.organization || undefined,
                    fromCache: false,
                    subscription: dbUser.subscription
                };
                return {
                    type: 'login',
                    user: authUser,
                    message: 'Login successful'
                };
            } else {
                //register new user
                if (!userData || !userData.password) {
                    throw new Error("User data is required for registration");
                }

                //checking username availibility in both cache and db
                const existingCachedUser = await redis.getObject(`user_cache_by_username:${userData.username}`);
                const existingDbUser = await this.db.user.findFirst({
                    where: {
                        username: userData.username
                    }
                });

                if (existingCachedUser || existingDbUser) {
                    throw new Error("Username already exists, Please try Different one");
                }

                //store user in Redis Cache
                const newUserCache = await this.storeNewUserData(userData, verificationData.phoneNumber);

                // Also cache by username for quick lookup
                await redis.setObject(`user_cache_by_username:${userData.username}`, { phoneNumber: verificationData.phoneNumber }, 3600);

                this.logger.info(`New user ${userData.username} registered and cached for phone ${verificationData.phoneNumber}`);

                const authUser: AuthUser = {
                    id: `cache_${verificationData.phoneNumber}`, // Temporary cache ID
                    phoneNumber: newUserCache.phoneNumber,
                    username: newUserCache.username,
                    fullName: newUserCache.fullName,
                    organization: newUserCache.organization,
                    fromCache: true
                };

                return {
                    type: 'registration',
                    user: authUser,
                    message: 'Registration successful'
                };
            }
        } catch (error) {
            this.handleError(error, 'Verify OTP and Auth');
            throw error;
        }
    }

    async storeNewUserData(userData: AuthData, phoneNumber: string) {
        try {
            const userCacheKey = `user_cache:${phoneNumber}`;
            const hashedPassword = await PasswordService.hashPassword(userData.password);
            const userObject = {
                phoneNumber: userData.phoneNumber,
                username: userData.username,
                fullName: userData.fullName,
                organization: userData.organization,
                password: hashedPassword,
                isPhoneVerified: true,
                registeredAt: new Date().toISOString(),
                lastLoginAt: new Date().toISOString(),
                status: 'pending_db_write',
                cacheTimeStamp: Date.now()
            };

            //store user in redis with 1 hour expiry
            const success = await redis.setObject(userCacheKey, userObject, 3600);

            if (success) {
                this.logger.info(`User data stored in Redis cache successfully for ${phoneNumber}`);

                //add to pending users list for batch db write
                await this.addToPendingNewUsersList(phoneNumber);
                return userObject;
            } else {
                throw new Error(`Failed to store user data in Redis for ${phoneNumber}`);
            }
        } catch (error) {
            this.logger.error(`Failed to store user in Redis for ${phoneNumber}:`, error);
            throw error;
        }
    }

    async addToPendingNewUsersList(phoneNumber: string) {
        try {
            const pendingUsersListKey = `pending_users_list_for_dbWrite`;
            const userData = {
                phoneNumber,
                addedAt: Date.now()
            };

            //add to redis list it will be processed by background job
            await redis.set(`${pendingUsersListKey}:${phoneNumber}`, JSON.stringify(userData), 7200); //2 hours expiry

            this.logger.info(`Added ${phoneNumber} to pending users list for DB write`);
        } catch (error) {
            this.logger.error(`Failed to add ${phoneNumber} to pending users list for DB write:`, error);
        }
    }

    //get user from redis cache then db
    async getUserByPhone(phoneNumber: string, checkCacheFirst: boolean = true): Promise<AuthUser | null> {
        try {
            if (checkCacheFirst) {
                const cacheKey = `user_cache:${phoneNumber}`;
                const cachedUser = await redis.getObject<CachedUser>(cacheKey);

                if (cachedUser) {
                    this.logger.info(`User ${phoneNumber} found in Redis cache`);
                    return {
                        id: `cache_${phoneNumber}`,
                        phoneNumber: cachedUser.phoneNumber,
                        username: cachedUser.username,
                        fullName: cachedUser.fullName,
                        organization: cachedUser.organization,
                        fromCache: true
                    };
                }
            }

            const dbUser = await this.db.user.findFirst({
                where: { phoneNumber },
                include: {
                    subscription: true,
                    _count: {
                        select: {
                            tournaments: true,
                            teams: true,
                            templates: true
                        }
                    }
                }
            });

            if (dbUser) {
                this.logger.info(`User ${phoneNumber} found in database`);
                return {
                    id: dbUser.id,
                    phoneNumber: dbUser.phoneNumber,
                    username: dbUser.username,
                    fullName: dbUser.fullName || '',
                    organization: dbUser.organization || undefined,
                    fromCache: false,
                    subscription: dbUser.subscription
                };
            }
            return null;
        } catch (error) {
            this.logger.error(`Failed to get user ${phoneNumber}:`, error);
            return null;
        }
    }

    private getJWTSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        this.logger.error('❌ CRITICAL: JWT_SECRET environment variable is not set');
        throw new Error('JWT_SECRET environment variable is required');
    }
    if (secret.length < 32) {
        this.logger.error('❌ CRITICAL: JWT_SECRET must be at least 32 characters long');
        throw new Error('JWT_SECRET must be at least 32 characters long');
    }
    return secret;
}

    async hashRefreshToken(refreshToken: string): Promise<string> {
        try {
            const saltRounds = 12;
            const hash = await bcrypt.hash(refreshToken, saltRounds);
            this.logger.info(`Hashed refresh token successfully`);
            return hash;
        } catch (error) {
            this.logger.error(`Failed to hash refresh token:`, error);
            throw new Error('Token Hashing Failed');
        }
    }

    //verify refresh token against bcrypt hash
    private async verifyRefreshTokenHash(refreshToken: string, hash: string): Promise<boolean> {
        try {
            const isValid = await bcrypt.compare(refreshToken, hash);
            this.logger.info(`Refresh token verification result: ${isValid ? 'SUCCESS' : 'FAILED'}`);
            return isValid;
        } catch (error) {
            this.logger.error(`Failed to verify refresh token:`, error);
            throw new Error('Token Verification Failed');
        }
    }

    //generate unique session identifier
    private generateSecureSessionId(): string {
        const timestamp = Date.now();
        const randomBytes = crypto.randomBytes(16).toString('hex'); // Generate 16 bytes of random data
        return `session_${timestamp}_${randomBytes}`;
    }

    //gemerate unique JWT Id for token uniqueness
    private generateJTI(sessionId: string, tokenType: 'access' | 'refresh'): string {
        const randomBytes = crypto.randomBytes(8).toString('hex');
        return `${sessionId}_${tokenType}_${randomBytes}`;
    }


    // Generate session token with cache info
    generateSessionToken(userId: string, phoneNumber: string, fromCache: boolean = false): string {
        const payload = {
            userId,
            phoneNumber,
            fromCache,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
        };

        return jwt.sign(payload, this.getJWTSecret());
    }

    async generateTokenPair(userId: string,
        phoneNumber: string,
        fromCache: boolean = false,
        deviceInfo?: string,
        ipAddress?: string
    ): Promise<TokenPair> {
        try {
            const sessionId = this.generateSecureSessionId();

            //generate access token with unique JTI
            const accessTokenPayload: AccessTokenPayload = {
                userId,
                phoneNumber,
                sessionId,
                jti: this.generateJTI(sessionId, 'access'),
                type: 'access',
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + (30 * 60) //30 mins
            };

            //doing the same for the refresh token
            const refreshTokenPayload: RefreshTokenPayload = {
                userId,
                phoneNumber,
                sessionId,
                jti: this.generateJTI(sessionId, 'refresh'),
                type: 'refresh',
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) //30 days
            };

            const accessToken = jwt.sign(accessTokenPayload, this.getJWTSecret());
            const refreshToken = jwt.sign(refreshTokenPayload, this.getJWTSecret());

            //doing the hybrid approach
            //store access token in redis only
            await redis.setObject(`access_token:${accessToken}`, accessTokenPayload, 1800); //30 minn ttl

            //store refresh token both in db and redis with hashed
            await redis.setObject(`refresh_token:${refreshToken}`, refreshTokenPayload, 2592000); //30 days ttl

            //store sessiondata in redis
            const sessionData = {
                id: sessionId,
                userId,
                phoneNumber,
                deviceInfo, ipAddress,
                refreshToken,
                fromCache,
                lastUsedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                isActive: true
            };

            await redis.setObject(`session:${sessionId}`, sessionData, 2592000); // 30 days ttl

            await this.addSessionToPendingList(sessionId); //add to pending list for db sync

            this.logger.info(`Generated token pair for user ${userId} with session ${sessionId}`);

            return {
                accessToken,
                refreshToken,
                accessExpiresIn: 1800,
                refreshExpiresIn: 2952000
            };

        } catch (error) {
            this.logger.error(`Failed to generate token pair for user ${userId}:`, error);
            throw new Error('Failed to generate token pair');
        }
    }

    private async addSessionUpdateToPendingList(sessionId: string) {
        try {
            const pendingUpdatesKey = `pending_session_updates_for_dbWrite`;
            const updateData = {
                sessionId,
                action: 'update_last_used',
                addedAt: Date.now()
            };
            await redis.set(`${pendingUpdatesKey}:${sessionId}`, JSON.stringify(updateData), 3600); //1 hour expiry
            this.logger.info(`Added session ${sessionId} to pending session updates list for DB write`);
        } catch (error) {
            this.logger.error(`Failed to add session ${sessionId} to pending session updates list for DB write:`, error);
        }
    }

    //add session to pending list for db sync 
    private async addSessionToPendingList(sessionId: string) {
        try {
            const pendingSessionsKey = `pending_sessions_list_for_dbWrite`;
            const sessionsData = {
                sessionId,
                addedAt: Date.now()
            };
            await redis.set(`${pendingSessionsKey}:${sessionId}`, JSON.stringify(sessionsData), 7200); //2 hours expiry
            this.logger.info(`Added session ${sessionId} to pending sessions list for DB write`);
        } catch (error) {
            this.logger.error(`Failed to add session ${sessionId} to pending sessions list for DB write:`, error);
        }
    }

    // Verify session token
    async verifySessionToken(token: string): Promise<AccessTokenPayload> {
        try {
            //checking redis cache that is there any token data
            const cachedTokenData = await redis.getObject<AccessTokenPayload>(`access_token:${token}`);
            if (cachedTokenData) {
                if (cachedTokenData.exp > Math.floor(Date.now() / 1000)) {
                    this.logger.info(`Access Token verified from Redis Cache`);
                    return cachedTokenData;
                } else {
                    //token expired, remove from cache
                    await redis.delete(`access_token:${token}`);
                    this.logger.error(`Access Token expired and removed from Redis Cache`);
                    throw new Error('Access token expired');
                }
            }

            //fallback to JWT verification if not in cache
            const payload = jwt.verify(token, process.env.JWT_SECRET || `your-secret`) as AccessTokenPayload;

            if (payload.type !== 'access') {
                this.logger.error(`Invalid Access Token Type`);
                throw new Error('Invalid access token type');
            }
            return payload;
        } catch (error) {
            this.logger.error('Failed to verify access token:', error);
            throw error;
        }
    }

    async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
        try {
            //checking redis cache first
            const cachedTokenData = await redis.getObject<RefreshTokenPayload>(`refresh_token:${token}`);

            if (cachedTokenData) {
                if (cachedTokenData.exp > Math.floor(Date.now() / 1000)) {
                    this.logger.info(`Refresh Token verified from Redis Cache`);
                    return cachedTokenData;
                } else {
                    //token expired, remove from cache
                    await redis.delete(`refresh_token:${token}`);
                    this.logger.error(`Refresh Token expired and removed from Redis Cache`);
                }
            }

            //fallback to JWT verification
            const payload = jwt.verify(token, process.env.JWT_SECRET || `your-secret`) as RefreshTokenPayload;

            if (payload.type !== 'refresh') {
                this.logger.error(`Invalid Refresh Token Type`);
                throw new Error('Invalid refresh token type');
            }
            //get session from database
            const session = await this.db.session.findFirst({
                where: {
                    id: payload.sessionId,
                    isActive: true,
                    refreshTokenExpiresAt: { gt: new Date() }
                }
            });

            if (!session) {
                this.logger.error(`Session not found or inactive for session ID ${payload.sessionId}`);
                throw new Error('Session not found or inactive');
            }

            //verify the token against bcrypt hash
            const isValidHash = await this.verifyRefreshTokenHash(token, session.refreshTokenHash);
            if (!isValidHash) {
                this.logger.error(`Invalid Refresh Token Hash for session ID ${payload.sessionId}`);
                throw new Error('Invalid refresh token hash');
            }

            //restore to redis for future requests
            const ttl = payload.exp - Math.floor(Date.now() / 1000);
            if (ttl > 0) {
                await redis.setObject(`refresh_token:${token}`, payload, ttl);
            }

            return payload;
        } catch (error) {
            this.logger.error('Failed to verify refresh token:', error);
            throw error;
        }
    }

    async getActiveSessions(userId: string): Promise<SessionData[]> {
        try {
            //getting sessions from redis
            const pattern = `session:*`;
            const sessionKeys = await redis.keys(pattern);
            const activeSessions: SessionData[] = [];

            for (const key of sessionKeys) {
                const sessionData = await redis.getObject<any>(key);
                if (sessionData && sessionData.userId === userId && sessionData.isActive) {
                    activeSessions.push({
                        id: sessionData.id,
                        userId: sessionData.userId,
                        deviceInfo: sessionData.deviceInfo,
                        ipAddress: sessionData.ipAddress,
                        lastUsedAt: sessionData.lastUsedAt,
                        createdAt: sessionData.createdAt,
                        isActive: sessionData.isActive
                    });
                }
            }
            return activeSessions;
        } catch (error) {
            this.logger.error(`Failed to get active sessions for user ${userId}:`, error);
            throw error;
        }
    }

    async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
        try {
            //verify refresh token using redis pattern
            const refreshPayload = await this.verifyRefreshToken(refreshToken);

            //check if the user is still active
            const sessionData = await redis.getObject<SessionData>(`session:${refreshPayload.sessionId}`);
            if (!sessionData || !sessionData.isActive) {
                this.logger.error(`User session not found or is not active`);
                throw new Error(`User session not found or is not active`);
            }

            //generate a new access token
            const newAccessTokenPayload: AccessTokenPayload = {
                userId: refreshPayload.userId,
                phoneNumber: refreshPayload.phoneNumber,
                sessionId: refreshPayload.sessionId,
                jti: this.generateJTI(refreshPayload.sessionId, 'access'),
                type: 'access',
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes expiration
            };

            const newAccessToken = jwt.sign(newAccessTokenPayload, process.env.JWT_SECRET || `your-secret`);

            //store new access token in the redis
            await redis.setObject(`access_token:${newAccessToken}`, newAccessTokenPayload, 1800); //30 min ttl

            //update session last used time
            sessionData.lastUsedAt = new Date();
            await redis.setObject(`session:${refreshPayload.sessionId}`, sessionData, 2592000); //30 days

            await this.addSessionUpdateToPendingList(refreshPayload.sessionId); //add to pending list for db sync

            this.logger.info(`✅ Refreshed access token for session ${refreshPayload.sessionId}`);
            return {
                accessToken: newAccessToken,
                expiresIn: 1800
            };
        } catch (error) {
            this.logger.error('Failed to refresh access token:', error);
            throw error;
        }
    }

    async checkSuspiciousLogin(userId: string, ipAddress: string, deviceInfo?: string): Promise<SuspiciousLoginData | null> {
        try {
            //get user recent sessions from redis
            const pattern = `session:*`;
            const sessionKeys = await redis.keys(pattern);
            const recentIpAddresses: string[] = [];

            for (const key of sessionKeys) {
                const sessionData = await redis.getObject<any>(key);
                if (sessionData && sessionData.userId === userId && sessionData.ipAddress) {
                    recentIpAddresses.push(sessionData.ipAddress);
                }
            }

            //check if this is a new ip address
            if (recentIpAddresses.length > 0 && !recentIpAddresses.includes(ipAddress)) {
                this.logger.warn(`Suspicious login attempt detected for user ${userId} from new IP address ${ipAddress}`);
                return {
                    userId,
                    newIpAddress: ipAddress,
                    deviceInfo,
                    timestamp: new Date()
                };
            }
            return null;
        } catch (error) {
            this.logger.error(`Failed to check suspicious login for user ${userId}:`, error);
            throw error;
        }
    }

    async revokeSession(sessionId: string): Promise<void> {
        let sessionData: any = null;
        try {
            // 1. Remove from Redis immediately (instant effect)
            sessionData = await redis.getObject<any>(`session:${sessionId}`);
            await redis.delete(`session:${sessionId}`);

            // 2. Update database (persistent effect)
            await this.db.session.update({
                where: { id: sessionId },
                data: {
                    isActive: false,
                    updatedAt: new Date() // Track when revocation happened
                }
            });
            this.logger.info(`Session ${sessionId} revoked - Redis first, DB updated`);
        } catch (error) {
            this.logger.error(`Failed to revoke session ${sessionId}:`, error);
            // Rollback: If DB update fails, restore Redis session
            if (sessionData) {
                await redis.setObject(`session:${sessionId}`, sessionData, 2592000);
                this.logger.warn(`Rolled back Redis deletion for session ${sessionId} due to DB error`);
            }

            throw error;
        }
    }

    //revoke all user sessions with secure cleanup
    async revokeAllUserSessions(userId: string): Promise<void> {
        try {
            // 1. Get all user sessions from Redis first
            const pattern = `session:*`;
            const sessionKeys = await redis.keys(pattern);
            const userSessionIds: string[] = [];
            const sessionBackups: { [key: string]: any } = {};

            // 2. Remove all user sessions from Redis immediately
            for (const key of sessionKeys) {
                const sessionData = await redis.getObject<any>(key);
                if (sessionData && sessionData.userId === userId) {
                    userSessionIds.push(sessionData.id);
                    sessionBackups[key] = sessionData; // Backup for rollback
                    await redis.delete(key);
                }
            }

            try {
                // 3. Update database
                await this.db.session.updateMany({
                    where: { userId, isActive: true },
                    data: {
                        isActive: false,
                        updatedAt: new Date()
                    }
                });

                this.logger.info(`Revoked all ${userSessionIds.length} sessions for user ${userId} - Redis first approach`);
            } catch (dbError) {
                // Rollback: Restore Redis sessions if DB update fails
                for (const [key, sessionData] of Object.entries(sessionBackups)) {
                    await redis.setObject(key, sessionData, 2592000);
                }
                this.logger.error(`DB update failed, restored ${Object.keys(sessionBackups).length} sessions to Redis`);
                throw dbError;
            }

        } catch (error) {
            this.logger.error(`Failed to revoke all sessions for user ${userId}:`, error);
            throw error;
        }
    }

    //check for suspicious refresh token usage
    async auditRefreshTokenUsage(sessionId: string, ipAddress?: string): Promise<void> {
        try {
            const sessionData = await redis.getObject<any>(`session:${sessionId}`);

            if (sessionData) {
                //check if ip address changed
                if (sessionData.ipAddress && ipAddress && sessionData.ipAddress !== ipAddress) {
                    this.logger.warn(`Suspicious refresh token usage detected for session ${sessionId}. IP address changed from ${sessionData.ipAddress} to ${ipAddress}`);

                    //add to suspicious activity queue
                    await this.addSuspiciousActivityToQueue(sessionId, ipAddress, sessionData.ipAddress);
                }
            }
        } catch (error) {
            this.logger.error(`Failed to audit refresh token usage for session ${sessionId}:`, error);
        }
    }

    //cleanup expired sessions from database (for cron job)
    async cleanupExpiredSessions(): Promise<number> {
        try {
            const result = await this.db.session.deleteMany({
                where: {
                    OR: [
                        { refreshTokenExpiresAt: { lt: new Date() } },
                        { isActive: false, updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } // 7 days
                    ]
                }
            });
            this.logger.info(`Expired sessions cleanup completed. Total sessions deleted: ${result.count}`);
            return result.count;
        } catch (error) {
            this.logger.error(`Failed to cleanup expired sessions:`, error);
            throw error;
        }
    }

    //add suspicious activity to queue for processing
    private async addSuspiciousActivityToQueue(sessionId: string, newIp: string, oldIp: string): Promise<void> {
        try {
            const suspiciousActivityKey = `suspicious_activity:${sessionId}:${Date.now()}`;
            const activityData = {
                sessionId,
                newIpAddress: newIp,
                oldIpAddress: oldIp,
                timestamp: new Date().toISOString(),
                processed: false
            };

            await redis.setObject(suspiciousActivityKey, activityData, 86400); // 24 hours
            this.logger.warn(`Suspicious activity logged for session ${sessionId}`);
        } catch (error) {
            this.logger.error('Failed to log suspicious activity:', error);
        }
    }
}
    export const authService = new AuthService();
