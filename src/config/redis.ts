import Redis, { RedisOptions } from "ioredis";
import logger from "../utils/logger";
import { json, templateLiteral } from "zod";


class RedisManager {

    private sanitizeKeyForLogging(key: string): string {
        // Hide sensitive tokens but show pattern
        if (key.startsWith('access_token:')) {
            return `access_token:***[HIDDEN]***`;
        }
        if (key.startsWith('refresh_token:')) {
            return `refresh_token:***[HIDDEN]***`;
        }
        if (key.includes('session:session_')) {
            return key.replace(/session_\d+_[a-f0-9]+/, 'session_***[HIDDEN]***');
        }
        // Add other sensitive patterns as needed
        return key;
    }
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
                logger.info(`Setting key ${this.sanitizeKeyForLogging(key)} with TTL of ${ttlSeconds} seconds`);
                await this.redisClient.setex(key, ttlSeconds, value);
            } else {
                logger.info(`Setting key ${this.sanitizeKeyForLogging(key)} without TTL`);
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
                logger.info(`Setting key ${this.sanitizeKeyForLogging(key)} with TTL of ${ttlSeconds} seconds`);
                await this.redisClient.setex(key, ttlSeconds, jsonString);
            } else {
                logger.info(`Setting object key ${this.sanitizeKeyForLogging(key)} without TTL`);
                await this.redisClient.set(key, jsonString);
            }
            return true;
        } catch (error) {
            logger.error(`Error setting key ${this.sanitizeKeyForLogging(key)} for Redis`, error);
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
    // adding incr method for tracking increments
    public async incr(key: string): Promise<number> {
        try {
            const result = await this.redisClient.incr(key);
            logger.info(`Incremented key ${key}, new value: ${result}`);
            return result;
        } catch (error) {
            logger.error(`Error incrementing key ${key} for Redis`, error);
            throw error;
        }
    }

    // Add decr method as well for completeness
    public async decr(key: string): Promise<number> {
        try {
            const result = await this.redisClient.decr(key);
            logger.info(`Decremented key ${key}, new value: ${result}`);
            return result;
        } catch (error) {
            logger.error(`Error decrementing key ${key} for Redis`, error);
            throw error;
        }
    }

    //  Add incrby method for incrementing by specific amount
    public async incrBy(key: string, increment: number): Promise<number> {
        try {
            const result = await this.redisClient.incrby(key, increment);
            logger.info(`Incremented key ${key} by ${increment}, new value: ${result}`);
            return result;
        } catch (error) {
            logger.error(`Error incrementing key ${key} by ${increment} for Redis`, error);
            throw error;
        }
    }
    public async scan(cursor: number, ...args: any[]): Promise<[number, string[]]> {
        try {
            const result = await this.redisClient.scan(cursor, ...args);
            return [parseInt(result[0]), result[1]];
        } catch (error) {
            logger.error(`Error scanning Redis keys:`, error);
            return [0, []];
        }
    }

    //hash operations. with method overloading for storing objects efficiently
    public async hset(key: string, field: string, value: string): Promise<boolean>;
    public async hset(key: string, fieldValueMap: Record<string, string>): Promise<boolean>;

    // Implementation method - this is the actual code that runs
    public async hset(key: string, fieldOrMap: string | Record<string, string>, value?: string): Promise<boolean> {
        try {
            let result: number;

            if (typeof fieldOrMap === 'string' && value !== undefined) {
                // Case 1: Single field-value pair
                // Example: hset('user:123', 'name', 'John')
                result = await this.redisClient.hset(key, fieldOrMap, value);
                logger.info(`Hash set key ${key}, field ${fieldOrMap}`);

            } else if (typeof fieldOrMap === 'object') {
                // Case 2: Multiple field-value pairs
                // Example: hset('user:123', { name: 'John', age: '25' })
                result = await this.redisClient.hset(key, fieldOrMap);
                logger.info(`Hash set key ${key} with ${Object.keys(fieldOrMap).length} fields`);

            } else {
                throw new Error('Invalid arguments for hset');
            }

            return result >= 0;
        } catch (error) {
            logger.error(`Error setting hash ${key}:`, error);
            return false;
        }
    }

    public async hget(key: string, field: string): Promise<string | null> {
        try {
            const result = await this.redisClient.hget(key, field);
            return result;
        } catch (error) {
            logger.error(`Error getting hash field ${field} for key ${key} in Redis`, error);
            return null;
        }
    }

    public async hgetall(key: string): Promise<Record<string, string>> {
        try {
            const result = await this.redisClient.hgetall(key);
            return result;
        } catch (error) {
            logger.error(`Error getting all hash fields for key ${key} in Redis`, error);
            return {};
        }
    }

    public async hdel(key: string, ...fields: string[]): Promise<number> {
        try {
            const result = await this.redisClient.hdel(key, ...fields);
            logger.info(`Deleted hash fields ${fields.join(", ")} for key ${key} in Redis`, result);
            return result;
        } catch (error) {
            logger.error(`Error deleting hash fields ${fields.join(", ")} for key ${key} in Redis`, error);
            return 0;
        }
    }

    //adding set operations for managing lists or collections
    public async sadd(key: string, ...members: string[]): Promise<number> {
        try {
            const result = await this.redisClient.sadd(key, ...members);
            logger.info(`Added members ${members.join(", ")} to set ${key} in Redis`, result);
            return result;
        } catch (error) {
            logger.error(`Error adding members ${members.join(", ")} to set ${key} in Redis`, error);
            return 0;
        }
    }

    public async smembers(key: string): Promise<string[]> {
        try {
            const result = await this.redisClient.smembers(key);
            return result;
        } catch (error) {
            logger.error(`Error getting members of set ${key} in Redis`, error);
            return [];
        }
    }

    public async srem(key: string, ...members: string[]): Promise<number> {
        try {
            const result = await this.redisClient.srem(key, ...members);
            logger.info(`Removed members ${members.join(", ")} from set ${key} in Redis`, result);
            return result;
        } catch (error) {
            logger.error(`Error removing members ${members.join(", ")} from set ${key} in Redis`, error);
            return 0;
        }
    }

    public async lpush(key: string, ...values: string[]): Promise<number> {
        try {
            const result = await this.redisClient.lpush(key, ...values);
            logger.info(`Added values ${values.join(", ")} to list ${key} in Redis`, result);
            return result;
        } catch (error) {
            logger.error(`Error adding values ${values.join(", ")} to list ${key} in Redis`, error);
            return 0;
        }
    }

    public async rpop(key: string): Promise<string | null> {
        try {
            const result = await this.redisClient.rpop(key);
            logger.info(`Removed value from list ${key} in Redis`, result);
            return result;
        } catch (error) {
            logger.error(`Error removing value from list ${key} in Redis`, error);
            return null;
        }
    }

    public async lrange(key: string, start: number, stop: number): Promise<string[]> {
        try {
            const result = await this.redisClient.lrange(key, start, stop);
            return result;
        } catch (error) {
            logger.error(`Error getting range from list ${key} in Redis`, error);
            return [];
        }
    }

    //utility method for setting object as hash
    public async hsetObject(key: string, obj: Record<string, any>, ttlSeconds?: number): Promise<boolean> {
    try {
        const flatObj: Record<string, string> = {};
        for (const [field, value] of Object.entries(obj)) {
            flatObj[field] = typeof value === 'string' ? value : JSON.stringify(value);
        }
        const result = await this.redisClient.hset(key, flatObj);
        
        // Set TTL if provided
        if (ttlSeconds) {
            await this.redisClient.expire(key, ttlSeconds);
            logger.info(`Set object ${this.sanitizeKeyForLogging(key)} in Redis with TTL ${ttlSeconds}s`);
        } else {
            logger.info(`Set object ${this.sanitizeKeyForLogging(key)} in Redis without TTL`);
        }
        
        return result >= 0;
    } catch (error) {
        logger.error(`Error setting object ${this.sanitizeKeyForLogging(key)} in Redis`, error);
        return false;
    }
}


    // Utility method for getting object from hash
    public async hgetObject<T>(key: string): Promise<T | null> {
        try {
            const hashData = await this.hgetall(key);
            if (Object.keys(hashData).length === 0) return null;

            const obj: any = {};
            for (const [field, value] of Object.entries(hashData)) {
                try {
                    obj[field] = JSON.parse(value);
                } catch {
                    obj[field] = value; // Keep as string if not JSON
                }
            }
            return obj as T;
        } catch (error) {
            logger.error(`Error getting object hash ${key}:`, error);
            return null;
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

    public async zadd(key: string, score: number, member: string): Promise<number> {
        try {
            const result = await this.redisClient.zadd(key, score, member);
            logger.info(`Added member ${member} with score ${score} to sorted set ${key} in Redis`);
            return result;
        } catch (error) {
            logger.error(`Error adding member ${member} to sorted set ${key} in Redis`, error);
            return 0;
        }
    }

    public async zcount(key: string, min: string | number, max: string | number): Promise<number> {
        try {
            const result = await this.redisClient.zcount(key, min, max);
            return result;
        } catch (error) {
            logger.error(`Error counting members in sorted set ${key} in Redis`, error);
            return 0;
        }
    }

    public async zrange(key: string, start: number, stop: number, withScores?: boolean): Promise<string[]> {
        try {
            const args: any[] = [key, start, stop];
            if (withScores) args.push('WITHSCORES');
            const result = await this.redisClient.zrange(...args);
            return result;
        } catch (error) {
            logger.error(`Error getting range from sorted set ${key} in Redis`, error);
            return [];
        }
    }

    public async zrem(key: string, ...members: string[]): Promise<number> {
        try {
            const result = await this.redisClient.zrem(key, ...members);
            logger.info(`Removed members ${members.join(", ")} from sorted set ${key} in Redis`);
            return result;
        } catch (error) {
            logger.error(`Error removing members from sorted set ${key} in Redis`, error);
            return 0;
        }
    }

    public async zrevrange(key: string, start: number, stop: number, withScores?: boolean): Promise<string[]> {
        try {
            const args: any[] = [key, start, stop];
            if (withScores) args.push('WITHSCORES');
            const result = await this.redisClient.zrevrange(...args);
            return result;
        } catch (error) {
            logger.error(`Error getting reverse range from sorted set ${key} in Redis`, error);
            return [];
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
    async keys(pattern: string): Promise<string[]> {
        try {
            const keys = await this.redisClient.keys(pattern);
            return keys;
        } catch (error) {
            logger.error(`Error getting keys with pattern ${pattern}:`, error);
            return [];
        }
    }
}

export const redis = RedisManager.getInstance();
export default redis;