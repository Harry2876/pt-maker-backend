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
            return keys.map(key => key.replace('pending_users_list_for_dbWrite:', ''));
        } catch (error) {
            logger.error(`Error getting pending users from Redis:`, error);
            return [];
        }
    }

    private async syncSingleUser(phoneNumber: string): Promise<void> {
        try {
            //get user from cache
            const userCacheKey = `user_cache:${phoneNumber}`;
            const cachedUser = await redis.getObject<CachedUser>(userCacheKey);

            if (!cachedUser) {
                logger.warn(`No cached user found for ${phoneNumber}`);
                return;
            }

            //check if user already exists in db
            const existingUser = await db.user.findFirst({
                where: { phoneNumber }
            });

            if (existingUser) {
                logger.info(`User ${phoneNumber} already exists in database, cleaning up cache`);
                await this.cleanupUserCache(phoneNumber);
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
            logger.info(`✅ User ${phoneNumber} written to database successfully with ID ${newUser.id}`);

            //update cache with DB ID and status
            await redis.setObject(userCacheKey, {
                ...cachedUser,
                id: newUser.id,
                status: 'synced_to_db'
            }, 3600);

            //update all dependent entities with new user id
            await this.updateSessionsUserId(phoneNumber, newUser.id);

            //remove the user from pending list
            await redis.delete(`pending_users_list_for_dbWrite:${phoneNumber}`);
        } catch (error) {
            logger.error(`Error syncing user ${phoneNumber}:`, error);
        }
    }

    private async updateSessionsUserId(phoneNumber: string, newUserId: string): Promise<void> {
    try {
        const oldUserId = `cache_${phoneNumber}`;
        const sessionKeys = await redis.keys(`session:*`);
        
        for (const sessionKey of sessionKeys) {
            const session = await redis.getObject<any>(sessionKey);
            if (session && session.userId === oldUserId) {
                // Update session with new user ID
                await redis.setObject(sessionKey, {
                    ...session,
                    userId: newUserId
                }, 2592000); // Keep original 30-day TTL
                
                logger.info(`Updated session ${session.id} userId from ${oldUserId} to ${newUserId}`);
            }
        }
    } catch (error) {
        logger.error(`Error updating sessions for user ${phoneNumber}:`, error);
    }
}


    
    private async cleanupUserCache(phoneNumber: string): Promise<void> {
        try {
            await redis.delete(`user_cache:${phoneNumber}`);
            await redis.delete(`pending_users_list_for_dbWrite:${phoneNumber}`);
            logger.info(`✅ Cleaned up cache for user ${phoneNumber}`);
        } catch (error) {
            logger.error(`Error cleaning up cache for user ${phoneNumber}:`, error);
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

            //convert redis session into db format
            const sessionForDb = {
                id: cachedSession.id,
                userId: cachedSession.userId,
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
            //remove from, cache
            await redis.delete(`session:${sessionId}`);

            //remove from the pending list
            await redis.delete(`pending_sessions_list_for_dbWrite:${sessionId}`);
        } catch (error) {
            logger.error(`Failed cleaning up cache for session ${sessionId}:`, error);
        }
    }
}