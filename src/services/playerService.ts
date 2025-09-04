import { BaseService } from './baseService';
import redis from '../config/redis';
import { QueueService } from './queueService';
import { randomUUID } from 'crypto';
import {
    PlayerCache,
    CreatePlayerData,
    UpdatePlayerData,
    PlayerStatCache,
    PlayerSearchItem
} from '../types/player';

export class PlayerService extends BaseService {
    private CACHE_TTL = 1800; // 30 minutes (longer for player data)

    // Create player with hybrid sync
    async createPlayer(data: CreatePlayerData, createdBy: string) {
        try {
            // 1. Check if player already exists by gameUuid or email
            if (data.gameUuid) {
                const existingByUuid = await this.findPlayerByGameUuid(data.gameUuid);
                if (existingByUuid) {
                    throw new Error(`Player with game UUID ${data.gameUuid} already exists`);
                }
            }

            if (data.email) {
                const existingByEmail = await this.findPlayerByEmail(data.email);
                if (existingByEmail) {
                    throw new Error(`Player with email ${data.email} already exists`);
                }
            }

            // 2. Generate player ID
            const playerId = randomUUID();

            // 3. Create player object
            const player: PlayerCache = {
                id: playerId,
                name: data.name,
                gameUuid: data.gameUuid,
                email: data.email,
                phoneNumber: data.phoneNumber,
                totalMatches: 0,
                totalKills: 0,
                totalPoints: 0,
                averageKills: 0,
                bestPosition: undefined,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 4. Store in Redis immediately
            await redis.hsetObject(`player:${playerId}`, player);

            // Index for searching
            if (data.gameUuid) {
                await redis.set(`player:uuid:${data.gameUuid}`, playerId, this.CACHE_TTL);
            }
            if (data.email) {
                await redis.set(`player:email:${data.email}`, playerId, this.CACHE_TTL);
            }
            if (data.phoneNumber) {
                await redis.set(`player:phone:${data.phoneNumber}`, playerId, this.CACHE_TTL);
            }

            // Add to global player list
            await redis.sadd('players:all', playerId);

            // 5. Queue database sync
            await QueueService.syncImmediately('PLAYER', playerId, player, createdBy);

            this.logger.info(`Player ${playerId} created: ${data.name}`);
            return player;

        } catch (error) {
            this.handleError(error, 'Create player');
            return null;
        }
    }

    // Get player by ID
    async getPlayerById(playerId: string): Promise<PlayerCache | null> {
        try {
            const cached = await redis.hgetObject<PlayerCache>(`player:${playerId}`);
            if (cached) {
                return cached;
            }

            // Fallback to database
            const dbPlayer = await this.db.player.findUnique({
                where: { id: playerId }
            });

            if (!dbPlayer) return null;

            const player: PlayerCache = {
                id: dbPlayer.id,
                name: dbPlayer.name,
                gameUuid: dbPlayer.gameUuid || undefined,
                email: dbPlayer.email || undefined,
                phoneNumber: dbPlayer.phoneNumber || undefined,
                totalMatches: dbPlayer.totalMatches,
                totalKills: dbPlayer.totalKills,
                totalPoints: dbPlayer.totalPoints,
                averageKills: dbPlayer.averageKills,
                bestPosition: dbPlayer.bestPosition || undefined,
                createdAt: dbPlayer.createdAt.toISOString(),
                updatedAt: dbPlayer.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            };

            // Cache for future requests
            await redis.hsetObject(`player:${playerId}`, player);

            return player;

        } catch (error) {
            this.handleError(error, 'Get player by ID');
            return null;
        }
    }

    // Find player by game UUID
    async findPlayerByGameUuid(gameUuid: string): Promise<PlayerCache | null> {
        try {
            // Check cache first
            const playerId = await redis.get(`player:uuid:${gameUuid}`);
            if (playerId) {
                return await this.getPlayerById(playerId);
            }

            // Fallback to database
            const dbPlayer = await this.db.player.findFirst({
                where: { gameUuid }
            });

            if (!dbPlayer) return null;

            const player: PlayerCache = {
                id: dbPlayer.id,
                name: dbPlayer.name,
                gameUuid: dbPlayer.gameUuid || undefined,
                email: dbPlayer.email || undefined,
                phoneNumber: dbPlayer.phoneNumber || undefined,
                totalMatches: dbPlayer.totalMatches,
                totalKills: dbPlayer.totalKills,
                totalPoints: dbPlayer.totalPoints,
                averageKills: dbPlayer.averageKills,
                bestPosition: dbPlayer.bestPosition || undefined,
                createdAt: dbPlayer.createdAt.toISOString(),
                updatedAt: dbPlayer.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            };

            // Cache for future requests
            await redis.hsetObject(`player:${dbPlayer.id}`, player);
            await redis.set(`player:uuid:${gameUuid}`, dbPlayer.id, this.CACHE_TTL);

            return player;

        } catch (error) {
            this.handleError(error, 'Find player by game UUID');
            return null;
        }
    }

    // Find player by email
    async findPlayerByEmail(email: string): Promise<PlayerCache | null> {
        try {
            // Check cache first
            const playerId = await redis.get(`player:email:${email}`);
            if (playerId) {
                return await this.getPlayerById(playerId);
            }

            // Fallback to database
            const dbPlayer = await this.db.player.findFirst({
                where: { email }
            });

            if (!dbPlayer) return null;

            const player: PlayerCache = {
                id: dbPlayer.id,
                name: dbPlayer.name,
                gameUuid: dbPlayer.gameUuid || undefined,
                email: dbPlayer.email || undefined,
                phoneNumber: dbPlayer.phoneNumber || undefined,
                totalMatches: dbPlayer.totalMatches,
                totalKills: dbPlayer.totalKills,
                totalPoints: dbPlayer.totalPoints,
                averageKills: dbPlayer.averageKills,
                bestPosition: dbPlayer.bestPosition || undefined,
                createdAt: dbPlayer.createdAt.toISOString(),
                updatedAt: dbPlayer.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            };

            // Cache for future requests
            await redis.hsetObject(`player:${dbPlayer.id}`, player);
            await redis.set(`player:email:${email}`, dbPlayer.id, this.CACHE_TTL);

            return player;

        } catch (error) {
            this.handleError(error, 'Find player by email');
            return null;
        }
    }

    // Update player statistics
    async updatePlayerStats(playerId: string, data: UpdatePlayerData, updatedBy: string) {
        try {
            const existing = await this.getPlayerById(playerId);
            if (!existing) {
                throw new Error('Player not found');
            }

            // Calculate new averages if matches are being updated
            let newAverageKills = existing.averageKills;
            if (data.totalMatches && data.totalKills) {
                newAverageKills = data.totalKills / data.totalMatches;
            }

            const updated: PlayerCache = {
                ...existing,
                name: data.name || existing.name,
                gameUuid: data.gameUuid || existing.gameUuid,
                email: data.email || existing.email,
                phoneNumber: data.phoneNumber || existing.phoneNumber,
                totalMatches: data.totalMatches || existing.totalMatches,
                totalKills: data.totalKills || existing.totalKills,
                totalPoints: data.totalPoints || existing.totalPoints,
                averageKills: newAverageKills,
                bestPosition: data.bestPosition !== undefined ?
                    (existing.bestPosition === undefined || data.bestPosition < existing.bestPosition ?
                        data.bestPosition : existing.bestPosition) : existing.bestPosition,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // Store in Redis
            await redis.hsetObject(`player:${playerId}`, updated);

            // Update indexes if needed
            if (data.gameUuid && data.gameUuid !== existing.gameUuid) {
                if (existing.gameUuid) {
                    await redis.delete(`player:uuid:${existing.gameUuid}`);
                }
                await redis.set(`player:uuid:${data.gameUuid}`, playerId, this.CACHE_TTL);
            }

            if (data.email && data.email !== existing.email) {
                if (existing.email) {
                    await redis.delete(`player:email:${existing.email}`);
                }
                await redis.set(`player:email:${data.email}`, playerId, this.CACHE_TTL);
            }

            // Queue database sync
            await QueueService.syncImmediately('PLAYER', playerId, updated, updatedBy);

            this.logger.info(`Player ${playerId} updated`);
            return updated;

        } catch (error) {
            this.handleError(error, 'Update player stats');
            return null;
        }
    }

    // Search players by name
    async searchPlayers(searchTerm: string, limit: number = 20): Promise<PlayerSearchItem[]> {
        try {
            // This is a simple implementation - in production you'd use proper search indexing
            const allPlayerIds = await redis.smembers('players:all');
            const results: PlayerSearchItem[] = [];

            for (const playerId of allPlayerIds.slice(0, 100)) { // Limit search scope
                const player = await redis.hgetObject<PlayerCache>(`player:${playerId}`);
                if (player && player.name.toLowerCase().includes(searchTerm.toLowerCase())) {
                    results.push({
                        id: player.id,
                        name: player.name,
                        gameUuid: player.gameUuid,
                        totalMatches: player.totalMatches,
                        totalKills: player.totalKills,
                        totalPoints: player.totalPoints,
                        averageKills: player.averageKills,
                        bestPosition: player.bestPosition
                    });
                }

                if (results.length >= limit) break;
            }

            return results.sort((a, b) => b.totalPoints - a.totalPoints); // Sort by total points

        } catch (error) {
            this.handleError(error, 'Search players');
            return [];
        }
    }

    // Get player statistics for a tournament
    async getPlayerTournamentStats(playerId: string, tournamentId: string): Promise<PlayerStatCache | null> {
        try {
            const cacheKey = `playerStat:${playerId}:${tournamentId}`;

            // Check cache first
            const cached = await redis.hgetObject<PlayerStatCache>(cacheKey);
            if (cached) {
                return cached;
            }

            // Fallback to database
            const dbStat = await this.db.playerStat.findUnique({
                where: {
                    playerId_tournamentId: {
                        playerId,
                        tournamentId
                    }
                }
            });

            if (!dbStat) return null;

            const playerStat: PlayerStatCache = {
                id: dbStat.id,
                playerId: dbStat.playerId,
                tournamentId: dbStat.tournamentId,
                teamName: dbStat.teamName,
                matches: dbStat.matches,
                totalKills: dbStat.totalKills,
                totalPoints: dbStat.totalPoints,
                averageKills: dbStat.averageKills,
                bestPosition: dbStat.bestPosition || undefined,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'SYNCED'
            };

            // Cache for future requests
            await redis.hsetObject(cacheKey, playerStat);

            return playerStat;

        } catch (error) {
            this.handleError(error, 'Get player tournament stats');
            return null;
        }
    }

    // Get top performing players
    async getTopPlayers(limit: number = 10): Promise<PlayerCache[]> {
        try {
            // This is a simple implementation - in production you'd use sorted sets
            const allPlayerIds = await redis.smembers('players:all');
            const players: PlayerCache[] = [];

            for (const playerId of allPlayerIds) {
                const player = await redis.hgetObject<PlayerCache>(`player:${playerId}`);
                if (player && player.totalMatches > 0) {
                    players.push(player);
                }
            }

            // Sort by total points and then by average kills
            return players
                .sort((a, b) => {
                    if (b.totalPoints !== a.totalPoints) {
                        return b.totalPoints - a.totalPoints;
                    }
                    return b.averageKills - a.averageKills;
                })
                .slice(0, limit);

        } catch (error) {
            this.handleError(error, 'Get top players');
            return [];
        }
    }

    // Delete player
    async deletePlayer(playerId: string, deletedBy: string) {
        try {
            const player = await this.getPlayerById(playerId);
            if (!player) {
                throw new Error('Player not found');
            }

            // Remove from Redis
            await redis.delete(`player:${playerId}`);
            await redis.srem('players:all', playerId);

            // Remove indexes
            if (player.gameUuid) {
                await redis.delete(`player:uuid:${player.gameUuid}`);
            }
            if (player.email) {
                await redis.delete(`player:email:${player.email}`);
            }
            if (player.phoneNumber) {
                await redis.delete(`player:phone:${player.phoneNumber}`);
            }

            // Queue database deletion
            await QueueService.syncImmediately('DELETE_PLAYER', playerId, { id: playerId }, deletedBy);

            this.logger.info(`Player ${playerId} deleted`);
            return true;

        } catch (error) {
            this.handleError(error, 'Delete player');
            return false;
        }
    }
}

export const playerService = new PlayerService();