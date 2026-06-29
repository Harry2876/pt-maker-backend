import { randomUUID } from 'crypto';
import { BaseService } from './baseService';
import { r2Service } from './cloudflareR2Service';
import { storedFileService } from './storedFileService';
import { mimeTypeFromR2Key } from '../utils/r2UrlUtils';
import { ServiceError } from '../utils/serviceError';

const ALLOWED_LOGO_TYPES: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

const MAX_ENTRIES_PER_PRESET = 25;
const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface PresetEntryWithUrl {
    id: string;
    presetId: string;
    teamName: string;
    logoStorageUrl: string;
    signedLogoUrl: string;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface PresetWithEntries {
    id: string;
    userId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    entries: PresetEntryWithUrl[];
}

export interface LogoSuggestion {
    teamName: string;
    matchedEntry: {
        id: string;
        presetId: string;
        presetName: string;
        teamName: string;
        signedLogoUrl: string;
    } | null;
}

export class TeamLogoPresetService extends BaseService {
    constructor() {
        super();
    }

    private async logoPreviewUrl(
        userId: string,
        entry: { id: string; logoR2Key: string },
    ): Promise<string> {
        const preview = await storedFileService.ensureClientPreview({
            userId,
            assetType: 'LOGO',
            r2Key: entry.logoR2Key,
            resourceId: entry.id,
            mimeType: mimeTypeFromR2Key(entry.logoR2Key),
        });
        return preview.previewUrl;
    }

    async createPreset(userId: string, name: string): Promise<{ id: string; name: string; createdAt: Date }> {
        const preset = await this.db.teamLogoPreset.create({
            data: { userId, name },
            select: { id: true, name: true, createdAt: true },
        });
        this.logger.info(`Preset created: ${preset.id} for user ${userId}`);
        return preset;
    }

    async listPresets(userId: string): Promise<Array<{ id: string; name: string; entryCount: number; createdAt: Date }>> {
        const presets = await this.db.teamLogoPreset.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: { _count: { select: { entries: true } } },
        });

        return presets.map(p => ({
            id: p.id,
            name: p.name,
            entryCount: p._count.entries,
            createdAt: p.createdAt,
        }));
    }

    async getPreset(userId: string, presetId: string): Promise<PresetWithEntries> {
        const preset = await this.db.teamLogoPreset.findFirst({
            where: { id: presetId, userId },
            include: { entries: { orderBy: { sortOrder: 'asc' } } },
        });

        if (!preset) {
            throw new ServiceError('Preset not found or access denied', 404, 'NOT_FOUND');
        }

        const entries = await Promise.all(
            preset.entries.map(async (entry) => {
                const signedLogoUrl = await this.logoPreviewUrl(userId, entry);
                return {
                    id: entry.id,
                    presetId: entry.presetId,
                    teamName: entry.teamName,
                    logoStorageUrl: entry.logoStorageUrl,
                    signedLogoUrl,
                    sortOrder: entry.sortOrder,
                    createdAt: entry.createdAt,
                    updatedAt: entry.updatedAt,
                };
            })
        );

        return {
            id: preset.id,
            userId: preset.userId,
            name: preset.name,
            createdAt: preset.createdAt,
            updatedAt: preset.updatedAt,
            entries,
        };
    }

    async updatePreset(userId: string, presetId: string, name: string): Promise<{ id: string; name: string }> {
        const preset = await this.db.teamLogoPreset.findFirst({ where: { id: presetId, userId } });
        if (!preset) {
            throw new ServiceError('Preset not found or access denied', 404, 'NOT_FOUND');
        }

        const updated = await this.db.teamLogoPreset.update({
            where: { id: presetId },
            data: { name },
            select: { id: true, name: true },
        });
        return updated;
    }

    async deletePreset(userId: string, presetId: string): Promise<void> {
        const preset = await this.db.teamLogoPreset.findFirst({
            where: { id: presetId, userId },
            include: { entries: { select: { logoR2Key: true } } },
        });

        if (!preset) {
            throw new ServiceError('Preset not found or access denied', 404, 'NOT_FOUND');
        }

        // Delete all R2 objects first
        await Promise.allSettled(
            preset.entries.map(entry => r2Service.deleteFile(entry.logoR2Key))
        );

        // Cascade deletes entries via FK
        await this.db.teamLogoPreset.delete({ where: { id: presetId } });
        this.logger.info(`Preset ${presetId} deleted with ${preset.entries.length} entries`);
    }

    async addEntry(
        userId: string,
        presetId: string,
        teamName: string,
        fileBuffer: Buffer,
        mimeType: string,
        originalFileName: string
    ): Promise<PresetEntryWithUrl> {
        // Ownership check
        const preset = await this.db.teamLogoPreset.findFirst({
            where: { id: presetId, userId },
            include: { _count: { select: { entries: true } } },
        });

        if (!preset) {
            throw new ServiceError('Preset not found or access denied', 404, 'NOT_FOUND');
        }

        if (preset._count.entries >= MAX_ENTRIES_PER_PRESET) {
            throw new ServiceError(
                `Preset already has ${MAX_ENTRIES_PER_PRESET} entries (maximum allowed).`,
                400,
                'PRESET_FULL'
            );
        }

        if (fileBuffer.length > MAX_LOGO_SIZE_BYTES) {
            throw new ServiceError('Logo file too large. Maximum size is 5MB.', 400, 'FILE_TOO_LARGE');
        }

        const ext = ALLOWED_LOGO_TYPES[mimeType];
        if (!ext) {
            throw new ServiceError(
                `Invalid logo type "${mimeType}". Allowed: jpeg, png, webp.`,
                400,
                'INVALID_FILE_TYPE'
            );
        }

        const entryId = randomUUID();
        const r2Key = `team-logo-presets/${userId}/${presetId}/${entryId}.${ext}`;

        const { url } = await r2Service.uploadLogoBuffer(fileBuffer, r2Key, mimeType);

        // Get current max sortOrder
        const maxOrder = await this.db.teamLogoPresetEntry.aggregate({
            where: { presetId },
            _max: { sortOrder: true },
        });
        const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

        const entry = await this.db.teamLogoPresetEntry.create({
            data: {
                id: entryId,
                presetId,
                teamName,
                logoR2Key: r2Key,
                logoStorageUrl: url,
                sortOrder,
            },
        });

        const signedLogoUrl = await this.logoPreviewUrl(userId, { id: entry.id, logoR2Key: r2Key });

        this.logger.info(`Preset entry added: ${entryId} (${teamName}) for preset ${presetId}`);

        return {
            id: entry.id,
            presetId: entry.presetId,
            teamName: entry.teamName,
            logoStorageUrl: entry.logoStorageUrl,
            signedLogoUrl,
            sortOrder: entry.sortOrder,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
        };
    }

    async deleteEntry(userId: string, entryId: string): Promise<void> {
        const entry = await this.db.teamLogoPresetEntry.findFirst({
            where: { id: entryId },
            include: { preset: { select: { userId: true } } },
        });

        if (!entry || entry.preset.userId !== userId) {
            throw new ServiceError('Preset entry not found or access denied', 404, 'NOT_FOUND');
        }

        // Detach from slot assignments first (set null via FK OnDelete: SetNull handled by DB)
        await r2Service.deleteFile(entry.logoR2Key).catch(() => {
            this.logger.warn(`Could not delete R2 object for entry ${entryId}: ${entry.logoR2Key}`);
        });

        await this.db.teamLogoPresetEntry.delete({ where: { id: entryId } });
        this.logger.info(`Preset entry ${entryId} deleted`);
    }

    /**
     * Suggest preset entries for a list of team names.
     * Returns only the requesting user's entries — exact case-insensitive match.
     * Never suggests entries from other users.
     */
    async suggestForTeamNames(
        userId: string,
        teamNames: string[]
    ): Promise<LogoSuggestion[]> {
        if (teamNames.length === 0) return [];

        // Fetch all entries belonging to this user's presets
        const allEntries = await this.db.teamLogoPresetEntry.findMany({
            where: {
                preset: { userId },
                teamName: {
                    in: teamNames,
                    mode: 'insensitive',
                },
            },
            include: { preset: { select: { name: true } } },
            orderBy: { sortOrder: 'asc' },
        });

        // Sign URLs
        const signedEntries = await Promise.all(
            allEntries.map(async (entry) => {
                const signedLogoUrl = await this.logoPreviewUrl(userId, entry);
                return { ...entry, signedLogoUrl };
            })
        );

        // For each requested team name, pick the first matching entry (sorted by sortOrder)
        return teamNames.map((name) => {
            const match = signedEntries.find(
                (e) => e.teamName.toLowerCase() === name.toLowerCase()
            );
            return {
                teamName: name,
                matchedEntry: match
                    ? {
                          id: match.id,
                          presetId: match.presetId,
                          presetName: match.preset.name,
                          teamName: match.teamName,
                          signedLogoUrl: match.signedLogoUrl,
                      }
                    : null,
            };
        });
    }

    /**
     * Assign a preset entry to a slot assignment.
     * Validates the preset entry belongs to the user before assigning.
     */
    async assignPresetEntryToSlot(
        userId: string,
        slotAssignmentId: string,
        presetEntryId: string
    ): Promise<void> {
        // Verify the preset entry belongs to the user
        const entry = await this.db.teamLogoPresetEntry.findFirst({
            where: { id: presetEntryId },
            include: { preset: { select: { userId: true } } },
        });

        if (!entry || entry.preset.userId !== userId) {
            throw new ServiceError('Preset entry not found or access denied', 404, 'NOT_FOUND');
        }

        // Verify the slot belongs to the user
        const slot = await this.db.quickSlotAssignment.findFirst({
            where: { id: slotAssignmentId },
            include: { quickMatch: { select: { userId: true } } },
        });

        if (!slot || slot.quickMatch.userId !== userId) {
            throw new ServiceError('Slot assignment not found or access denied', 404, 'NOT_FOUND');
        }

        await this.db.quickSlotAssignment.update({
            where: { id: slotAssignmentId },
            data: { logoPresetEntryId: presetEntryId },
        });

        this.logger.info(`Preset entry ${presetEntryId} assigned to slot ${slotAssignmentId}`);
    }

    /**
     * Remove the preset entry assignment from a slot (keeps the preset entry itself).
     */
    async removePresetEntryFromSlot(userId: string, slotAssignmentId: string): Promise<void> {
        const slot = await this.db.quickSlotAssignment.findFirst({
            where: { id: slotAssignmentId },
            include: { quickMatch: { select: { userId: true } } },
        });

        if (!slot || slot.quickMatch.userId !== userId) {
            throw new ServiceError('Slot assignment not found or access denied', 404, 'NOT_FOUND');
        }

        await this.db.quickSlotAssignment.update({
            where: { id: slotAssignmentId },
            data: { logoPresetEntryId: null },
        });
    }
}

export const teamLogoPresetService = new TeamLogoPresetService();
