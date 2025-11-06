import { BaseService } from "./baseService";
import redis from "../config/redis";
import { QueueService } from "./queueService";
import { randomUUID } from "crypto";
import {
    DiscordRegistrationToggleCache,
    ToggleRegistrationData
} from "../types/discordRegistration";

export class DiscordToggleService extends BaseService {
    private CACHE_TTL = 300;

    async toggleRegistration(data: ToggleRegistrationData): Promise<DiscordRegistrationToggleCache | null> {
        try {
            const toggleId = randomUUID();
            const now = new Date().toISOString();

            const currentToggle = await this.getToggleStatus(data.guildId);
            const newToggleCount = currentToggle ? currentToggle.toggleCount + 1 : 1;

            const toggle: DiscordRegistrationToggleCache = {
                id: toggleId,
                guildId: data.guildId,
                enabled: data.enabled,
                toggledBy: data.toggledBy,
                toggledByName: data.toggledByName,
                toggledAt: now,
                toggleCount: newToggleCount,
                reason: data.reason,
                dbStatus: 'PENDING_SYNC'
            };

            await redis.hsetObject(`guild:${data.guildId}:registration_toggle`, toggle, this.CACHE_TTL);

            await QueueService.syncDiscordImmediately('REGISTRATION_TOGGLE', toggleId, toggle, data.toggledBy);

            this.logger.info(`Registration ${data.enabled ? 'enabled' : 'disabled'} for guild ${data.guildId} by ${data.toggledByName}`);

            return toggle;
        } catch (error) {
            this.handleError(error, 'Toggle Registration Status');
            return null;
        }
    }

    async getToggleStatus(guildId: string): Promise<DiscordRegistrationToggleCache | null> {
        try {
            const cached = await redis.hgetObject<DiscordRegistrationToggleCache>(`guild:${guildId}:registration_toggle`);

            if (cached) {
                return cached;
            }

            const dbToggle = await this.db.discordRegistrationToggle.findUnique({
                where: { guildId }
            });

            if (dbToggle) {
                const toggle: DiscordRegistrationToggleCache = {
                    id: dbToggle.id,
                    guildId: dbToggle.guildId,
                    enabled: dbToggle.enabled,
                    toggledBy: dbToggle.toggledBy,
                    toggledByName: dbToggle.toggledByName,
                    toggledAt: dbToggle.toggledAt.toISOString(),
                    toggleCount: dbToggle.toggleCount,
                    reason: dbToggle.reason ?? undefined,
                    dbStatus: 'SYNCED'
                };
                await redis.hsetObject(`guild:${guildId}:registration_toggle`, toggle, this.CACHE_TTL);
                return toggle;
            }

            //return null if not found
            return null;
        } catch (error) {
            this.handleError(error, 'Get toggle status');
            return null;
        }
    }
}
export const discordToggleService = new DiscordToggleService();