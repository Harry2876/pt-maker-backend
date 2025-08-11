import Redis, { RedisOptions } from "ioredis";
import logger from "../utils/logger";
import { json, templateLiteral } from "zod";


class RedisManager {
    private static instance: RedisManager;
    private redisClient: Redis;
    private queueRedis: Redis;
    private isConnected = false;

    private constructor() {
        //creating singleton pattern
        this.redisClient = this.createRedisConnection('cache');
        this.queueRedis = this.createRedisConnection('queue');
        this.setupEventHandlers();
    }

    public static getInstance(): RedisManager {
        if (!RedisManager.instance) {
            RedisManager.instance = new RedisManager();
        }
        return RedisManager.instance;
    }

    private createRedisConnection(type: 'cache' | 'queue'): Redis {
        const config: RedisOptions = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined,
            db: type === 'cache' ? 0 : 1,
            lazyConnect: true,
            maxRetriesPerRequest: type === 'queue' ? null : 3, // BullMQ requires null for queue connections
            connectTimeout: 10000,
            commandTimeout: type === 'queue' ? 30000 : 5000, // 30 seconds for queue, 5 seconds for cache
            enableReadyCheck: false

        };
        return new Redis(config);
    }

    //setup redis connection event handlers
    private setupEventHandlers(): void {
        //cache redis events
        this.redisClient.on('connect', () => {
            logger.info('Redis cache connected successfully');
            this.isConnected = true;
        });
        this.redisClient.on('error', (err) => {
            logger.error('Redis cache connection error', err);
            this.isConnected = false;
        });

        //queue redis events
        this.queueRedis.on('connect', () => {
            logger.info('Redis queue connected successfully');
        });

        this.queueRedis.on('error', (err) => {
            // Only log if it's not a timeout error (to avoid spam)
            if (!err.message.includes('Command timed out')) {
                logger.error('Redis queue connection error', err);
            } else {
                logger.warn('Redis queue command timeout (this is normal during heavy load)');
            }
        });

        this.queueRedis.on('reconnecting', () => {
            logger.info('Redis queue reconnecting...');
        });

        this.queueRedis.on('ready', () => {
            logger.info('Redis queue ready for commands');
        });
    }

    //getting cached data by a key
    public async get(key: string): Promise<string | null> {
        try {
            const result = await this.redisClient.get(key);
            if (result) {
                logger.info(`Cache hit for key: ${key}`);
            }
            return result;
        } catch (error) {
            logger.error(`Error getting key ${key} for Redis`, error);
            return null;
        }
    }

    //set cached data with optional TTL
    public async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
        try {
            if (ttlSeconds) {
                logger.info(`Setting key ${key} with TTL of ${ttlSeconds} seconds`);
                await this.redisClient.setex(key, ttlSeconds, value);
            } else {
                logger.info(`Setting key ${key} without TTL`);
                await this.redisClient.set(key, value);
            }
            return true;
        } catch (error) {
            logger.error(`Error setting key ${key} for Redis`, error);
            return false;
        }
    }

    public async setObject(key: string, obj: any, ttlSeconds?: number): Promise<boolean> {
        try {
            const jsonString = JSON.stringify(obj);
            if (ttlSeconds) {
                logger.info(`Setting key ${key} with TTL of ${ttlSeconds} seconds`);
                await this.redisClient.setex(key, ttlSeconds, jsonString);
            } else {
                logger.info(`Setting object key ${key} without TTL`);
                await this.redisClient.set(key, jsonString);
            }
            return true;
        } catch (error) {
            logger.error(`Error setting key ${key} for Redis`, error);
            return false;
        }
    }

    public async getObject<T>(key: string): Promise<T | null> {
        try {
            const jsonString = await this.get(key);
            if (!jsonString) return null;
            return JSON.parse(jsonString) as T;
        } catch (error) {
            logger.error(`Error getting key ${key} for Redis`, error);
            return null;
        }
    }

    public async delete(key: string): Promise<boolean> {
        try {
            const result = await this.redisClient.del(key);
            return result > 0;
        } catch (error) {
            logger.error(`Error deleting key ${key} for Redis`, error);
            return false;
        }
    }

    public async exists(key: string): Promise<boolean> {
        try {
            const result = await this.redisClient.exists(key);
            return result === 1;
        } catch (error) {
            logger.error(`Error checking existence of key ${key} for Redis`, error);
            return false;
        }
    }
    public async expire(key: string, seconds: number): Promise<boolean> {
        try {
            const result = await this.redisClient.expire(key, seconds);
            return result === 1;
        } catch (error) {
            logger.error(`Error expiring key ${key} for Redis`, error);
            return false;
        }
    }
    //get time to live for key
    public async ttl(key: string): Promise<number> {
        try {
            const result = await this.redisClient.ttl(key);
            return result;
        } catch (error) {
            logger.error(`Error getting TTL for key ${key} for Redis`, error);
            return -1;
        }
    }

    //get queue redis connection for bull mq
    public getQueueConnection(): Redis {
        return this.queueRedis;
    }

    //close all redis connection
    public async disconnect(): Promise<void> {
        try {
            await this.redisClient.disconnect();
            await this.queueRedis.disconnect();
        } catch (error) {
            logger.error(`Error disconnecting Redis clients`, error);
        }
    }
    // Method to wait for Redis connection to be ready
    public async waitForConnection(timeoutMs: number = 10000): Promise<boolean> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            try {
                await this.queueRedis.ping();
                logger.info('✅ Redis queue connection verified');
                return true;
            } catch (error) {
                logger.warn('⏳ Waiting for Redis queue connection...');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        logger.error('❌ Redis queue connection timeout');
        return false;
    }
}

export const redis = RedisManager.getInstance();
export default redis;