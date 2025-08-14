import { Job } from "bullmq";
import { BaseWorker } from "./baseWorker";
import { Queues } from "../config/queues";
import logger from "../utils/logger";
import {redis}  from "../config/redis";
import { db } from "../config/database";
import { ca } from "zod/v4/locales";
import { CachedUser } from "@/types/auth";

export class UserSyncWorker extends BaseWorker<any> {
    constructor() {
        super(Queues.USER_SYNC, {concurrency:1});
    }

    protected async processJob(job:Job<any>):Promise<void> {
        logger.info(`Processing user sync job at ${new Date().toISOString()}`);

        try {
            await this.syncPendingUsersToDb();
            logger.info(`✅ User sync job completed successfully at ${new Date().toISOString()}`);
        }catch(error){
            logger.error(`❌ Failed to process user sync job:`, error);
            throw error;
        }
    }

    private async syncPendingUsersToDb(): Promise<void> {
        try {
            //get all pending users
            const pendingUsers = await this.getPendingUsers();

            if(pendingUsers.length ===0) {
                logger.info(`No pending users found for sync top database`);
                return;
            }
            logger.info(`Found ${pendingUsers.length} pending users for sync to database`);

            //process each user
            for (const phoneNumber of pendingUsers) {
                await this.syncSingleUser(phoneNumber);
            }
        }catch(error){
            logger.error(`Error in sync Pending Users To Database`, error);
            throw error;
        }
    }

    private async getPendingUsers(): Promise<string[]> {
        try{
            const pattern = 'pending_users_list_for_dbWrite:*';

            //scan  and get keys safely
            const keys = await redis.keys(pattern);
            return keys.map(key => key.replace('pending_users_list_for_dbWrite:',''));
        }catch(error) {
            logger.error(`Error getting pending users from Redis:`, error);
            return [];
        }
    }

    private async syncSingleUser(phoneNumber:string): Promise<void> {
        try{
            //get user from cache
            const userCacheKey = `user_cache:${phoneNumber}`;
            const cachedUser = await redis.getObject<CachedUser>(userCacheKey);

            if(!cachedUser){
                logger.warn(`No cached user found for ${phoneNumber}`);
                return;
            }

            //check if user already exists in db
            const existingUser = await db.user.findFirst({
                where :{phoneNumber}
            });

            if(existingUser){
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
            },3600);

            //remove the user from pending list
            await redis.delete(`pending_users_list_for_dbWrite:${phoneNumber}`);
        }catch(error) {
            logger.error(`Error syncing user ${phoneNumber}:`, error);
        }
    }
    private async cleanupUserCache(phoneNumber:string): Promise<void> {
        try{
            await redis.delete(`user_cache:${phoneNumber}`);
            await redis.delete(`pending_users_list_for_dbWrite:${phoneNumber}`);
            logger.info(`✅ Cleaned up cache for user ${phoneNumber}`);
        }catch(error){
            logger.error(`Error cleaning up cache for user ${phoneNumber}:`, error);
        }
    }

    private async syncPendingSessionsToDb() : Promise<void> {}
}