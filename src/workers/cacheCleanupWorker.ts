import { Worker, Job } from 'bullmq';
import redis from '../config/redis';
import logger from '../utils/logger';
import { CacheManager } from '../services/cacheManager';
import { cacheCleanupQueue } from '../config/queues';
import { BaseWorker } from './baseWorker';

interface CacheCleanupData {
    type: 'lru-cleanup' | 'expired-cleanup';
    options: {
        maxSessions?: number;
    };
}

export class CacheCleanupWorker extends BaseWorker<CacheCleanupData> {

    constructor() {
        super('cache-cleanup', {
            connection: redis.getQueueConnection(),
            concurrency: 1,
        });
    }

    protected async processJob(job: Job<CacheCleanupData>): Promise<void> {
        const { type, options } = job.data;

        switch (type) {
            case 'lru-cleanup':
                await this.performLRUCleanup(options);
                break;
            case 'expired-cleanup':
                await this.cleanupExpiredKeys();
                break;
            default:
                logger.warn(`Unknown cache cleanup job type: ${type}`);
        }
    }

    private async performLRUCleanup(options: { maxSessions?: number } = {}): Promise<void> {
        try {
            const maxSessions = options.maxSessions || 10000;
            
            // Get memory usage using the queue connection
            const memoryInfo = await redis.getQueueConnection().info('memory');
            logger.info(`Redis memory usage before cleanup: ${memoryInfo}`);

            // Get sessions to evict
            const sessionsToEvict = await CacheManager.getSessionsToEvict(maxSessions);
            
            if (sessionsToEvict.length > 0) {
                await CacheManager.evictSessions(sessionsToEvict);
                logger.info(`LRU cleanup completed: evicted ${sessionsToEvict.length} sessions`);
            } else {
                logger.info('LRU cleanup: no sessions need eviction');
            }

            // Log memory usage after cleanup
            const memoryAfter = await redis.getQueueConnection().info('memory');
            logger.info(`Redis memory usage after cleanup: ${memoryAfter}`);

        } catch (error) {
            logger.error('LRU cleanup failed:', error);
            throw error;
        }
    }

    private async cleanupExpiredKeys(): Promise<void> {
        try {
            // This will be handled by Redis TTL, but we can add custom logic
            const patterns = ['expired:*', 'temp:*'];
            
            for (const pattern of patterns) {
                const keys = await redis.keys(pattern);
                if (keys.length > 0) {
                    // Delete keys one by one using RedisManager's delete method
                    for (const key of keys) {
                        await redis.delete(key);
                    }
                    logger.info(`Cleaned up ${keys.length} expired keys for pattern ${pattern}`);
                }
            }
        } catch (error) {
            logger.error('Expired keys cleanup failed:', error);
            throw error;
        }
    }

    public async start(): Promise<void> {
        logger.info('🧹 Cache Cleanup Worker started');
    }

    public async stop(): Promise<void> {
        await this.worker.close();
        logger.info('🧹 Cache Cleanup Worker stopped');
    }
}

// Schedule cleanup jobs
export const scheduleCacheCleanup = async (): Promise<void> => {
    // LRU cleanup every 30 minutes
    await cacheCleanupQueue.add('lru-cleanup', 
        { type: 'lru-cleanup', options: { maxSessions: 10000 } },
        { repeat: { every: 30 * 60 * 1000 } }
    );

    // Expired keys cleanup every hour
    await cacheCleanupQueue.add('expired-cleanup',
        { type: 'expired-cleanup', options: {} },
        { repeat: { every: 60 * 60 * 1000 } }
    );

    logger.info('📅 Cache cleanup jobs scheduled');
};