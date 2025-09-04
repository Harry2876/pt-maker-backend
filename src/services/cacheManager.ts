import redis from "../config/redis";
import logger from "../utils/logger";

interface CacheConfig {
    ttl: number;
    maxSize?: number;
    priority: 'high' | 'medium' | 'low';
}

interface SessionActivity {
    lastAccessed: number;
    accessCount: number;
    priority: number;
}

export class CacheManager {
    private static readonly CACHE_CONFIGS = {
        //High Priority - always Keep
        active_sessions: { ttl: 1800, priority: 'high' as const },
        access_tokens: { ttl: 1800, priority: 'high' as const },

        //medium priority - LRU evict after 7 days inactive
        user_data: { ttl: 604800, priority: 'medium' as const },
        refresh_tokens: { ttl: 604800, priority: 'medium' as const },

        //low priority - LRU evict after 1 hour inactive
        tournament_data: { ttl: 3600, priority: 'low' as const },
        match_data: { ttl: 3600, priority: 'low' as const },

    };

    //track session activity for LRU decisions
    static async trackActivity(sessionId: string): Promise<void> {
        const activityKey = `activity:${sessionId}`;
        const now = Date.now();

        const current = await redis.getObject<SessionActivity>(activityKey);
        const activity: SessionActivity = {
            lastAccessed: now,
            accessCount: (current?.accessCount || 0) + 1,
            priority: this.calculatePriority(current?.accessCount || 0, now)
        };

        await redis.setObject(activityKey, activity, 86400); // 24 hours
    }

    // Calculate session priority based on usage
    private static calculatePriority(accessCount: number, lastAccessed: number): number {
        const hoursSinceAccess = (Date.now() - lastAccessed) / (1000 * 60 * 60);

        if (accessCount > 50 && hoursSinceAccess < 1) return 10; // Very active
        if (accessCount > 20 && hoursSinceAccess < 6) return 8;  // Active
        if (accessCount > 5 && hoursSinceAccess < 24) return 6;  // Moderate
        if (hoursSinceAccess < 168) return 4; // Weekly user
        return 2; // Inactive
    }

    // Get sessions to evict based on LRU + priority
    static async getSessionsToEvict(maxSessions: number = 10000): Promise<string[]> {
        const pattern = 'session:*';
        const sessionKeys = await redis.keys(pattern);

        if (sessionKeys.length <= maxSessions) return [];

        const sessionsWithActivity = await Promise.all(
            sessionKeys.map(async (key) => {
                const sessionId = key.replace('session:', '');
                const activity = await redis.getObject<SessionActivity>(`activity:${sessionId}`);
                return {
                    sessionId,
                    key,
                    priority: activity?.priority || 1,
                    lastAccessed: activity?.lastAccessed || 0
                };
            })
        );

        // Sort by priority (ascending) then by lastAccessed (ascending) 
        sessionsWithActivity.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return a.lastAccessed - b.lastAccessed;
        });

        const toEvict = sessionsWithActivity
            .slice(0, sessionKeys.length - maxSessions)
            .map(s => s.sessionId);

        logger.info(`Identified ${toEvict.length} sessions for LRU eviction`);
        return toEvict;
    }

    // Evict sessions and related data
    static async evictSessions(sessionIds: string[]): Promise<void> {
        for (const sessionId of sessionIds) {
            try {
                // Get session data to find related tokens
                const sessionData = await redis.getObject<any>(`session:${sessionId}`);

                if (sessionData?.refreshToken) {
                    await redis.delete(`refresh_token:${sessionData.refreshToken}`);
                }

                // Remove session and activity data
                await redis.delete(`session:${sessionId}`);
                await redis.delete(`activity:${sessionId}`);

                logger.info(`Evicted session ${sessionId} from cache`);
            } catch (error) {
                logger.error(`Failed to evict session ${sessionId}:`, error);
            }
        }
    }
}