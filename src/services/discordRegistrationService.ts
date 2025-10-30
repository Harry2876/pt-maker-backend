import { BaseService } from "./baseService";
import redis from "../config/redis";
import { QueueService } from "./queueService";
import { randomUUID } from "crypto";
import {
    DiscordRegistrationSessionCache,
    DiscordRegistrationQueueEntry,
    CreateRegistrationSessionData,
    JoinQueueData,
    ProcessedQueueResult,
    QueueStatusOptions,
    GuildRegistrationSessionsCache,
    GuildQueueCache
} from "../types/discordRegistration";

export class DiscordRegistrationService extends BaseService {
    private CACHE_TTL = 300; // 5 minutes (following your patterns)
    private SESSION_CACHE_TTL = 1800; // 30 minutes for active sessions
    private QUEUE_CACHE_TTL = 60; // 1 minute for queue (real-time updates)

    async startRegistrationSession(data: CreateRegistrationSessionData): Promise<DiscordRegistrationSessionCache | null> {
        try {
            const sessionId = randomUUID();
            const now = new Date().toISOString();

            // Check for existing active session in channel
            const existingSession = await this.getActiveSessionByChannel(data.guildId, data.channelId);
            if (existingSession) {
                throw new Error('Registration session already active in this channel');
            }

            // Create session object
            const session: DiscordRegistrationSessionCache = {
                id: sessionId,
                guildId: data.guildId,
                channelId: data.channelId,
                name: data.name,
                groupId: data.groupId,
                isActive: true,
                maxSlots: data.maxSlots || 21,
                currentSlots: 0,
                startedAt: now,
                duration: data.duration || 30,
                status: 'ACTIVE',
                createdBy: data.createdBy,
                createdAt: now,
                updatedAt: now,
                dbStatus: 'PENDING_SYNC'
            };

            // Store in Redis with extended TTL for active sessions
            await redis.hsetObject(`registration_session:${sessionId}`, session, this.SESSION_CACHE_TTL);
            
            // Add to guild active sessions set
            await redis.sadd(`guild:${data.guildId}:active_sessions`, sessionId);
            await redis.expire(`guild:${data.guildId}:active_sessions`, this.SESSION_CACHE_TTL);

            // Add channel mapping for quick lookup
            await redis.set(`channel:${data.channelId}:session`, sessionId, this.SESSION_CACHE_TTL);

            // Clear guild sessions cache
            await redis.delete(`guild:${data.guildId}:sessions:list`);

            // Queue for database sync
            await QueueService.syncDiscordImmediately('REGISTRATION_SESSION', sessionId, session, data.createdBy);

            this.logger.info(`Registration session ${sessionId} started for guild ${data.guildId}, channel ${data.channelId}`);

            return session;
        } catch (error) {
            this.handleError(error, 'Start registration session');
            return null;
        }
    }

    async getActiveSessions(guildId: string): Promise<DiscordRegistrationSessionCache[] | null> {
        try {
            // Check cache first
            const cacheKey = `guild:${guildId}:sessions:list`;
            const cached = await redis.getObject<GuildRegistrationSessionsCache>(cacheKey);

            if (cached) {
                this.logger.info(`Fetched ${cached.sessions.length} sessions from cache for guild ${guildId}`);
                return cached.sessions.filter(s => s.isActive);
            }

            // Get active session IDs
            const sessionIds = await redis.smembers(`guild:${guildId}:active_sessions`);

            if (sessionIds.length === 0) {
                // Fallback to database
                const dbSessions = await this.db.discordRegistrationSession.findMany({
                    where: {
                        guildId,
                        isActive: true
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                });

                return dbSessions.map(session => ({
                    ...session,
                    startedAt: session.startedAt?.toISOString(),
                    endedAt: session.endedAt?.toISOString(),
                    createdAt: session.createdAt.toISOString(),
                    updatedAt: session.updatedAt.toISOString(),
                    dbStatus: 'SYNCED' as const
                }));
            }

            // Fetch sessions from Redis
            const sessions: DiscordRegistrationSessionCache[] = [];
            for (const sessionId of sessionIds) {
                const session = await redis.hgetObject<DiscordRegistrationSessionCache>(`registration_session:${sessionId}`);
                if (session && session.isActive) {
                    sessions.push(session);
                }
            }

            // Cache the result
            const cacheData: GuildRegistrationSessionsCache = {
                sessions,
                totalCount: sessions.length,
                activeCount: sessions.filter(s => s.isActive).length,
                lastUpdated: new Date().toISOString()
            };

            await redis.setObject(cacheKey, cacheData, this.CACHE_TTL);

            this.logger.info(`Fetched ${sessions.length} active sessions for guild ${guildId}`);
            return sessions;

        } catch (error) {
            this.handleError(error, 'Get active sessions');
            return null;
        }
    }

    async getActiveSessionByChannel(guildId: string, channelId: string): Promise<DiscordRegistrationSessionCache | null> {
        try {
            // Get session ID from channel mapping
            const sessionId = await redis.get(`channel:${channelId}:session`);
            if (!sessionId) {
                return null;
            }

            // Get session details
            const session = await redis.hgetObject<DiscordRegistrationSessionCache>(`registration_session:${sessionId}`);
            
            if (session && session.isActive && session.guildId === guildId) {
                return session;
            }

            return null;
        } catch (error) {
            this.handleError(error, 'Get active session by channel');
            return null;
        }
    }

    async toggleSession(guildId: string, sessionId: string): Promise<DiscordRegistrationSessionCache | null> {
        try {
            const session = await redis.hgetObject<DiscordRegistrationSessionCache>(`registration_session:${sessionId}`);
            
            if (!session || session.guildId !== guildId) {
                throw new Error('Session not found');
            }

            // Toggle active status
            session.isActive = !session.isActive;
            session.updatedAt = new Date().toISOString();
            session.dbStatus = 'PENDING_SYNC';

            // Update in Redis
            await redis.hsetObject(`registration_session:${sessionId}`, session, this.SESSION_CACHE_TTL);

            // Update guild sets
            if (session.isActive) {
                await redis.sadd(`guild:${guildId}:active_sessions`, sessionId);
            } else {
                await redis.srem(`guild:${guildId}:active_sessions`, sessionId);
            }

            // Clear cache
            await redis.delete(`guild:${guildId}:sessions:list`);

            // Queue for database sync
            await QueueService.queueDiscordSync({
                type: 'REGISTRATION_SESSION_UPDATE',
                entityId: sessionId,
                data: session,
                userId: 'system',
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });

            this.logger.info(`Session ${sessionId} toggled to ${session.isActive ? 'active' : 'inactive'}`);

            return session;
        } catch (error) {
            this.handleError(error, 'Toggle session');
            return null;
        }
    }

    async endSession(guildId: string, sessionId: string): Promise<ProcessedQueueResult | null> {
        try {
            const session = await redis.hgetObject<DiscordRegistrationSessionCache>(`registration_session:${sessionId}`);
            
            if (!session || session.guildId !== guildId) {
                throw new Error('Session not found');
            }

            // End the session
            session.isActive = false;
            session.status = 'COMPLETED';
            session.endedAt = new Date().toISOString();
            session.updatedAt = new Date().toISOString();
            session.dbStatus = 'PENDING_SYNC';

            // Update in Redis
            await redis.hsetObject(`registration_session:${sessionId}`, session, this.SESSION_CACHE_TTL);

            // Remove from active sessions
            await redis.srem(`guild:${guildId}:active_sessions`, sessionId);
            await redis.delete(`channel:${session.channelId}:session`);

            // Process the queue using merit-based algorithm
            const queueResult = await this.processSessionQueue(sessionId);

            // Clear caches
            await redis.delete(`guild:${guildId}:sessions:list`);
            await redis.delete(`session:${sessionId}:queue:list`);

            // Queue for database sync
            await QueueService.queueDiscordSync({
                type: 'REGISTRATION_SESSION_END',
                entityId: sessionId,
                data: { session, queueResult },
                userId: 'system',
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });

            this.logger.info(`Session ${sessionId} ended and queue processed. Assigned: ${Object.keys(queueResult.assignedSlots).length}, Waiting: ${queueResult.waitingList.length}`);

            return queueResult;
        } catch (error) {
            this.handleError(error, 'End session');
            return null;
        }
    }

    async joinQueue(data: JoinQueueData): Promise<DiscordRegistrationQueueEntry | null> {
        try {
            const queueId = randomUUID();
            const now = new Date().toISOString();

            // Check if team already in queue
            const existingEntry = await this.getQueueEntryByTeam(data.sessionId, data.teamName);
            if (existingEntry) {
                throw new Error('Team already in registration queue');
            }

            // Get team merit score (will be implemented in merit service)
            const merit = await this.getTeamMerit(data.guildId, data.teamName);

            // Calculate position based on merit
            const position = await this.calculateQueuePosition(data.sessionId, merit);

            const queueEntry: DiscordRegistrationQueueEntry = {
                id: queueId,
                sessionId: data.sessionId,
                guildId: data.guildId,
                teamName: data.teamName,
                userId: data.userId,
                userDiscord: data.userDiscord,
                merit,
                position,
                status: 'QUEUED',
                joinedAt: now
            };

            // Store in Redis
            await redis.hsetObject(`queue_entry:${queueId}`, queueEntry, this.QUEUE_CACHE_TTL);
            
            // Add to session queue with merit as score for sorting
            await redis.zadd(`session:${data.sessionId}:queue`, merit, queueId);

            // Add to team mapping for quick lookup
            await redis.set(`session:${data.sessionId}:team:${data.teamName}`, queueId, this.QUEUE_CACHE_TTL);

            // Clear queue cache
            await redis.delete(`session:${data.sessionId}:queue:list`);

            // Queue for database sync
            await QueueService.syncDiscordImmediately('REGISTRATION_QUEUE', queueId, queueEntry, data.userId);

            this.logger.info(`Team ${data.teamName} joined queue for session ${data.sessionId} with merit ${merit} at position ${position}`);

            return queueEntry;
        } catch (error) {
            this.handleError(error, 'Join queue');
            return null;
        }
    }

    // Helper method to get team merit (placeholder - will be implemented in merit service)
    private async getTeamMerit(guildId: string, teamName: string): Promise<number> {
        try {
            // This will be implemented when we create the merit service
            // For now, return default merit
            return 100;
        } catch (error) {
            this.logger.warn(`Failed to get merit for team ${teamName}, using default: ${error}`);
            return 100; // Default merit
        }
    }

    // Helper method to calculate queue position
    private async calculateQueuePosition(sessionId: string, merit: number): Promise<number> {
        try {
            // Count teams with higher merit (Redis sorted set)
            const higherMeritCount = await redis.zcount(`session:${sessionId}:queue`, merit + 1, '+inf');
            return higherMeritCount + 1;
        } catch (error) {
            this.logger.warn(`Failed to calculate position, using default: ${error}`);
            return 1;
        }
    }

    private async getQueueEntryByTeam(sessionId: string, teamName: string): Promise<DiscordRegistrationQueueEntry | null> {
        try {
            const entryId = await redis.get(`session:${sessionId}:team:${teamName}`);
            if (!entryId) {
                return null;
            }

            return await redis.hgetObject<DiscordRegistrationQueueEntry>(`queue_entry:${entryId}`);
        } catch (error) {
            this.logger.warn(`Failed to get queue entry for team ${teamName}: ${error}`);
            return null;
        }
    }

    // Placeholder for queue processing (will be implemented)
    private async processSessionQueue(sessionId: string): Promise<ProcessedQueueResult> {
        // This will implement merit-based slot assignment
        return {
            assignedSlots: {},
            waitingList: [],
            processedCount: 0,
            waitingCount: 0
        };
    }
}

// Export singleton instance (following your pattern)
export const discordRegistrationService = new DiscordRegistrationService();