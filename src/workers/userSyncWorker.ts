import { Job } from "bullmq";
import { BaseWorker } from "./baseWorker";
import { Queues } from "../config/queues";
import logger from "../utils/logger";
import { redis } from "../config/redis";
import { db } from "../config/database";
import { ca } from "zod/v4/locales";
import { CachedUser } from "../types/auth";
import bcrypt from 'bcrypt';
import { authService } from "../services/authService";
import { PhoneUtils } from "../utils/phoneUtils";

export class UserSyncWorker extends BaseWorker<any> {
    constructor() {
        super(Queues.USER_SYNC, { concurrency: 1 });
    }

    protected async processJob(job: Job<any>): Promise<void> {
        logger.info(`Processing user sync job at ${new Date().toISOString()}`);

        try {
            await this.syncPendingUsersToDb();


            await this.syncPendingSessionsToDb();
            logger.info(`✅ Data sync job completed successfully at ${new Date().toISOString()}`);
        } catch (error) {
            logger.error(`❌ Failed to process user sync job:`, error);
            throw error;
        }
    }

    private async syncPendingUsersToDb(): Promise<void> {
        try {
            //get all pending users
            const pendingUsers = await this.getPendingUsers();

            if (pendingUsers.length === 0) {
                logger.info(`No pending users found for sync top database`);
                return;
            }
            logger.info(`Found ${pendingUsers.length} pending users for sync to database`);

            //process each user
            for (const phoneNumber of pendingUsers) {
                await this.syncSingleUser(phoneNumber);
            }
        } catch (error) {
            logger.error(`Error in sync Pending Users To Database`, error);
            throw error;
        }
    }

    private async getPendingUsers(): Promise<string[]> {
        try {
            const pattern = 'pending_users_list_for_dbWrite:*';

            //scan  and get keys safely
            const keys = await redis.keys(pattern);
            return keys.map(key => {
                const phoneNumber = key.replace('pending_users_list_for_dbWrite:', '');
                return PhoneUtils.normalize(phoneNumber);
            });
        } catch (error) {
            logger.error(`Error getting pending users from Redis:`, error);
            return [];
        }
    }

    private async syncSingleUser(phoneNumber: string): Promise<void> {
        const normalizedPhone = PhoneUtils.normalize(phoneNumber);
        try {
            //get user from cache
            const userCacheKey = `user_cache:${normalizedPhone}`;
            const cachedUser = await redis.hgetObject<CachedUser>(userCacheKey);

            if (!cachedUser) {
                logger.warn(`No cached user found for ${normalizedPhone}`);
                return;
            }

            //check if user already exists in db
            const existingUser = await db.user.findFirst({
                where: { phoneNumber: normalizedPhone }
            });

            if (existingUser) {
                logger.info(`User ${normalizedPhone} already exists in database, cleaning up cache`);
                await this.cleanupUserCache(normalizedPhone);
                return;
            }

            //create user in database
            const newUser = await db.user.create({
                data: {
                    phoneNumber: cachedUser.phoneNumber,
                    username: cachedUser.username,
                    fullName: cachedUser.fullName,
                    organization: cachedUser.organization || null,
                    passwordHash: cachedUser.password, // Note: In production, this should be hashed
                    createdAt: new Date(cachedUser.registeredAt),
                    updatedAt: new Date(cachedUser.lastLoginAt)
                }
            });
            logger.info(`✅ User ${normalizedPhone} written to database successfully with ID ${newUser.id}`);

            //update cache with DB ID and status
            await redis.hsetObject(userCacheKey, {
                ...cachedUser,
                id: newUser.id,
                status: 'synced_to_db'
            });
            await redis.expire(userCacheKey, 3600); //expire in 1 hour

            //update all dependent entities with new user id
            await this.updateSessionsUserId(normalizedPhone, newUser.id);

            //remove the user from pending list
            await redis.delete(`pending_users_list_for_dbWrite:${normalizedPhone}`);
        } catch (error) {
            logger.error(`Error syncing user ${normalizedPhone}:`, error);
        }
    }

    private async updateSessionsUserId(phoneNumber: string, newUserId: string): Promise<void> {
        const normalizedPhone = PhoneUtils.normalize(phoneNumber);
        try {
            //get the actual cache id
            const userCacheKey = `user_cache:${normalizedPhone}`;
            const cachedUser = await redis.hgetObject<any>(userCacheKey);

            if (!cachedUser || !cachedUser.id) {
                logger.warn(`No cached user or ID found for ${normalizedPhone}, during session update`);
                return;
            }
            const oldUserId = cachedUser.id;  // Use the actual cached ID
            const sessionKeys = await redis.keys(`session:*`);

            for (const sessionKey of sessionKeys) {
                const session = await redis.getObject<any>(sessionKey);
                if (session && session.userId === oldUserId) {
                    session.userId = newUserId;
                    await redis.setObject(sessionKey, session, 30 * 24 * 60 * 60);
                    logger.info(`✅ Updated session ${session.id} with new user ID ${newUserId}`);
                }
            }
            logger.info(`Updated all sessions for user ${normalizedPhone} from cache ID ${oldUserId} to DB ID ${newUserId}`);
        } catch (error) {
            logger.error(`Error updating sessions for user ${normalizedPhone}:`, error);
        }
    }



    private async cleanupUserCache(phoneNumber: string): Promise<void> {
        const normalizedPhone = PhoneUtils.normalize(phoneNumber);
        try {
            await redis.delete(`user_cache:${normalizedPhone}`);
            await redis.delete(`pending_users_list_for_dbWrite:${normalizedPhone}`);
            logger.info(`✅ Cleaned up cache for user ${normalizedPhone}`);
        } catch (error) {
            logger.error(`Error cleaning up cache for user ${normalizedPhone}:`, error);
        }
    }

    private async getPendingSessions(): Promise<string[]> {
        try {
            const pattern = 'pending_sessions_list_for_dbWrite:*';
            const keys = await redis.keys(pattern);
            logger.info(`Found ${keys.length} pending sessions for sync to database`);
            return keys.map(key => key.replace('pending_sessions_list_for_dbWrite:', ''));
        } catch (error) {
            logger.error(`Error getting pending sessions from Redis:`, error);
            return [];
        }
    }

    private async syncPendingSessionsToDb(): Promise<void> {
        try {
            //get all pending sessions
            const pendingSessions = await this.getPendingSessions();

            if (pendingSessions.length === 0) {
                logger.info(`No pending sessions found for sync to database`);
                return;
            }

            logger.info(`Found ${pendingSessions.length} pending sessions for sync to database`);

            //process each session
            for (const sessionId of pendingSessions) {
                await this.syncSingleSession(sessionId);
            }
        } catch (error) {
            logger.error(`Error in sync Pending Sessions To Database`, error);
            throw error;
        }
    }

    private async syncSingleSession(sessionId: string): Promise<void> {
        try {
            //get sessionm frrom the cahce 
            const sessionCacheKey = `session:${sessionId}`;
            const cachedSession = await redis.getObject<any>(sessionCacheKey);

            if (!cachedSession) {
                logger.warn(`No cached session found for ${sessionId}`);
                return;
            }

            //check if the sessiom already exists in the db
            const existingSession = await db.session.findFirst({
                where: { id: sessionId }
            });

            if (existingSession) {
                logger.info(`Session ${sessionId} already exists in database, cleaning up cache`);
                await this.cleanupSessionCache(sessionId);
                return;
            }

                       //Validate user exists before creating session
            let finalUserId = cachedSession.userId;
            let userExists = await db.user.findFirst({
                where: { id: cachedSession.userId }
            });

            // If user not found and it's a cache ID, try to find by phone number
            if (!userExists && cachedSession.userId.startsWith('cache_user_')) {
                logger.info(`Cache user ID ${cachedSession.userId} not found, searching by phone number ${cachedSession.phoneNumber}`);
                
                const realUser = await db.user.findFirst({
                    where: { phoneNumber: cachedSession.phoneNumber }
                });
                
                if (realUser) {
                    finalUserId = realUser.id;
                    userExists = realUser;
                    
                    // Update the session with the real user ID in Redis
                    cachedSession.userId = realUser.id;
                    await redis.setObject(`session:${sessionId}`, cachedSession, 2592000);
                    
                    logger.info(`✅ Updated session ${sessionId} from cache user ID to real user ID ${realUser.id}`);
                } else {
                    logger.warn(`No user found with phone number ${cachedSession.phoneNumber} for session ${sessionId}, delaying sync`);
                }
            }

            if (!userExists) {
                logger.warn(`User ${finalUserId} not found in database for session ${sessionId}, delaying sync`);
                // Re-queue this session for later processing
                await redis.setObject(`pending_sessions_list_for_dbWrite:${sessionId}`, {
                    sessionId,
                    addedAt: Date.now(),
                    retryCount: (cachedSession.retryCount || 0) + 1
                }, 3600); // 1 hour
                
                // If too many retries, log warning but don't fail
                if ((cachedSession.retryCount || 0) > 5) {
                    logger.error(`Session ${sessionId} exceeded retry limit, user ${finalUserId} still not found`);
                }
                return;
            }

            //convert redis session into db format
            const sessionForDb = {
                id: cachedSession.id,
                userId: finalUserId,
                refreshTokenHash: await authService.hashRefreshToken(cachedSession.refreshToken),
                refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                deviceInfo: cachedSession.deviceInfo,
                ipAddress: cachedSession.ipAddress,
                lastUsedAt: new Date(cachedSession.lastUsedAt),
                createdAt: new Date(cachedSession.createdAt),
                isActive: cachedSession.isActive
            };

            //save to database
            await db.session.create({
                data: sessionForDb
            });
            logger.info(`✅ Synced session ${sessionId} to database`);

            //cleanup cache
            await this.cleanupSessionCache(sessionId);
        } catch (error) {
            logger.error(`Failed syncing session ${sessionId}:`, error);
        }
    }

    private async cleanupSessionCache(sessionId: string): Promise<void> {
        try {
            //LRU system will take care of actual session data deletion from cache

            //remove from the pending list
            await redis.delete(`pending_sessions_list_for_dbWrite:${sessionId}`);

            //mark session as synced to the database
            const sessionData = await redis.getObject<any>(`session:${sessionId}`);
            if (sessionData) {
                sessionData.dbSynced = true;
                sessionData.dbSyncedAt = new Date().toISOString();
                await redis.setObject(`session:${sessionId}`, sessionData, 2592000); // Keep TTL
            }

            logger.info(`Session:${sessionId} marked as DB Synced, kept in redis for LRU Management`);
        } catch (error) {
            logger.error(`Failed cleaning up cache for session ${sessionId}:`, error);
        }
    }
}