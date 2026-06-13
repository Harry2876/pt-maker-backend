import { BaseService } from './baseService';
import { AttendanceTeam, ResultTeam } from '../types/pythonAI';
import { QuickSlotCache } from '../types/quickSlot';
import { WarningType } from '../types/quickResult';
import {
    countRosterOverlap,
    playerNamesMatch,
    requiredRosterMatchCount,
    rosterKey,
} from '../utils/playerNameMatcher';

export interface ReconciliationWarning {
    type: WarningType;
    message: string;
    details?: Record<string, unknown>;
}

export interface AttendanceReconciliationResult {
    teams: AttendanceTeam[];
    rawTeamCount: number;
    mergedTeamCount: number;
    warnings: ReconciliationWarning[];
}

export interface ResultReconciliationResult {
    teams: ResultTeam[];
    rawTeamCount: number;
    dedupedTeamCount: number;
    skippedDuplicates: number;
    skippedInvalidRanks: number;
    warnings: ReconciliationWarning[];
    needsPerImageFallback: boolean;
}

export interface SlotMatchResult {
    slot: QuickSlotCache | null;
    matchScore: number;
    requiredScore: number;
    ambiguous: boolean;
}

export interface SavedResultAuditEntry {
    slotNumber: number;
    rank: number;
    teamName: string;
    totalKills: number;
    matchScore: string;
}

export class OcrReconciliationService extends BaseService {
    private static readonly MIN_RANK = 1;
    private static readonly MAX_RANK = 25;

    mergeAttendanceTeams(teams: AttendanceTeam[]): AttendanceReconciliationResult {
        const warnings: ReconciliationWarning[] = [];
        const bySlot = new Map<number, AttendanceTeam>();

        for (const team of teams) {
            const slotNumber = team.slot_number;
            if (!slotNumber || slotNumber < 1) {
                warnings.push({
                    type: 'INVALID_POSITION',
                    message: `Attendance team has invalid slot number: ${slotNumber}`,
                    details: { slotNumber },
                });
                continue;
            }

            const existing = bySlot.get(slotNumber);
            if (!existing) {
                bySlot.set(slotNumber, team);
                continue;
            }

            const existingNames = this.extractPlayerNames(existing);
            const incomingNames = this.extractPlayerNames(team);
            const overlap = countRosterOverlap(existingNames, incomingNames);
            const required = Math.min(
                requiredRosterMatchCount(existingNames.length),
                requiredRosterMatchCount(incomingNames.length)
            );

            if (overlap >= required) {
                const keepIncoming = incomingNames.length > existingNames.length;
                if (keepIncoming) {
                    bySlot.set(slotNumber, team);
                }
                continue;
            }

            warnings.push({
                type: 'TEAM_NAME_MISMATCH',
                message: `Slot ${slotNumber} has conflicting rosters across attendance pages`,
                details: {
                    slotNumber,
                    existingPlayers: existingNames,
                    incomingPlayers: incomingNames,
                    overlap,
                    required,
                },
            });
        }

        const merged = [...bySlot.values()].sort((a, b) => a.slot_number - b.slot_number);

        return {
            teams: merged,
            rawTeamCount: teams.length,
            mergedTeamCount: merged.length,
            warnings,
        };
    }

    dedupeResultTeams(teams: ResultTeam[]): ResultReconciliationResult {
        const warnings: ReconciliationWarning[] = [];
        const seenRosters = new Map<string, ResultTeam>();
        const seenRanks = new Map<number, ResultTeam>();
        const deduped: ResultTeam[] = [];
        let skippedDuplicates = 0;
        let skippedInvalidRanks = 0;
        let needsPerImageFallback = false;

        for (const team of teams) {
            const rank = team.team_rank;
            const playerNames = this.extractPlayerNames(team);

            if (!rank || rank < OcrReconciliationService.MIN_RANK || rank > OcrReconciliationService.MAX_RANK) {
                skippedInvalidRanks++;
                needsPerImageFallback = true;
                warnings.push({
                    type: 'INVALID_POSITION',
                    message: `Skipped result team with invalid rank ${rank}`,
                    details: { rank, players: playerNames },
                });
                continue;
            }

            if (playerNames.length === 0) {
                warnings.push({
                    type: 'SLOT_NOT_FOUND',
                    message: `Skipped rank ${rank} — no player names detected`,
                    details: { rank },
                });
                continue;
            }

            const key = rosterKey(playerNames);
            const existingByRoster = seenRosters.get(key);

            if (existingByRoster) {
                skippedDuplicates++;
                const existingKills = this.totalKills(existingByRoster);
                const incomingKills = this.totalKills(team);
                if (existingKills !== incomingKills) {
                    // Prefer the reading with higher total kills (batch merge often under-reads)
                    if (incomingKills > existingKills) {
                        seenRosters.set(key, team);
                        seenRanks.set(rank, team);
                        const idx = deduped.findIndex((t) => rosterKey(this.extractPlayerNames(t)) === key);
                        if (idx >= 0) deduped[idx] = team;
                    }
                    warnings.push({
                        type: 'MISSING_KILLS',
                        message: `Duplicate roster at rank ${rank} has different kill counts (${existingKills} vs ${incomingKills})`,
                        details: {
                            rank,
                            keptRank: existingByRoster.team_rank,
                            existingKills,
                            incomingKills,
                            players: playerNames,
                        },
                    });
                } else {
                    warnings.push({
                        type: 'DUPLICATE_TEAM',
                        message: `Skipped duplicate roster for rank ${rank} (scroll header)`,
                        details: { rank, keptRank: existingByRoster.team_rank, players: playerNames },
                    });
                }
                continue;
            }

            const existingByRank = seenRanks.get(rank);
            if (existingByRank) {
                const existingNames = this.extractPlayerNames(existingByRank);
                const overlap = countRosterOverlap(playerNames, existingNames);
                if (overlap < requiredRosterMatchCount(playerNames.length)) {
                    needsPerImageFallback = true;
                    warnings.push({
                        type: 'DUPLICATE_TEAM',
                        message: `Rank ${rank} appears twice with different rosters — kept first occurrence`,
                        details: {
                            rank,
                            keptPlayers: existingNames,
                            skippedPlayers: playerNames,
                        },
                    });
                    skippedDuplicates++;
                    continue;
                }
            }

            seenRosters.set(key, team);
            seenRanks.set(rank, team);
            deduped.push(team);
        }

        deduped.sort((a, b) => a.team_rank - b.team_rank);

        return {
            teams: deduped,
            rawTeamCount: teams.length,
            dedupedTeamCount: deduped.length,
            skippedDuplicates,
            skippedInvalidRanks,
            warnings,
            needsPerImageFallback,
        };
    }

    findMatchingSlot(
        slots: QuickSlotCache[],
        resultPlayerNames: string[]
    ): SlotMatchResult {
        const requiredScore = requiredRosterMatchCount(resultPlayerNames.length);
        const scored: Array<{ slot: QuickSlotCache; score: number }> = [];

        for (const slot of slots) {
            if (!slot.playerNames || slot.playerNames.length === 0) continue;
            const score = countRosterOverlap(resultPlayerNames, slot.playerNames);
            if (score > 0) {
                scored.push({ slot, score });
            }
        }

        scored.sort((a, b) => b.score - a.score);

        if (scored.length === 0) {
            return { slot: null, matchScore: 0, requiredScore, ambiguous: false };
        }

        const best = scored[0];
        const tied = scored.filter(
            (c) => c.score === best.score && c.score >= requiredScore
        );

        if (best.score < requiredScore) {
            return { slot: null, matchScore: best.score, requiredScore, ambiguous: false };
        }

        if (tied.length > 1) {
            return {
                slot: null,
                matchScore: best.score,
                requiredScore,
                ambiguous: true,
            };
        }

        return {
            slot: best.slot,
            matchScore: best.score,
            requiredScore,
            ambiguous: false,
        };
    }

    private extractPlayerNames(team: AttendanceTeam | ResultTeam): string[] {
        return team.players.map((p) => p.name).filter(Boolean);
    }

    private totalKills(team: ResultTeam): number {
        return team.players.reduce((sum, p) => sum + (p.finishes || 0), 0);
    }
}

export const ocrReconciliationService = new OcrReconciliationService();
