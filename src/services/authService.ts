import { BaseService } from "./baseService";
import { QueueService } from "./queueService";
import redis from "../config/redis";
import jwt from "jsonwebtoken";
import { AuthData, OTPVerificationData, CachedUser, AuthUser, AuthResponse } from '../types/auth';
import { PasswordService } from "./passwordService";
import { success } from "zod";
import { stat } from "fs";
import { isMapIterator } from "util/types";

export class AuthService extends BaseService {

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

    // Generate session token with cache info
    generateSessionToken(userId: string, phoneNumber: string, fromCache: boolean = false): string {
        const payload = {
            userId,
            phoneNumber,
            fromCache,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
        };

        return jwt.sign(payload, process.env.JWT_SECRET || 'your-secret-key');
    }

    // Verify session token
    verifySessionToken(token: string): any {
        try {
            return jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        } catch (error) {
            throw new Error('Invalid or expired token');
        }
    }
}
export const authService = new AuthService();