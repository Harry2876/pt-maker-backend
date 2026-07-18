import redis from '../config/redis';

export async function waitForDbSync(redisKey: string, timeoutMs = 5000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const status = await redis.hget(redisKey, 'dbStatus');
        if (status === 'SYNCED') {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    return false;
}

export async function waitForAllDbSync(redisKeys: string[], timeoutMs = 10000): Promise<boolean> {
    if (redisKeys.length === 0) {
        return true;
    }

    const results = await Promise.all(
        redisKeys.map(key => waitForDbSync(key, timeoutMs))
    );
    return results.every(Boolean);
}
