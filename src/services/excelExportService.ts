import { BaseService } from './baseService';
import * as ExcelJS from 'exceljs';
import { r2Service } from './cloudflareR2Service';
import { storedFileService } from './storedFileService';
import { quickMatchService } from './quickMatchService';
import { quickResultService } from './quickResultService';
import { quickSlotService } from './quickSlotService';
import { quickSeriesService } from './quickSeriesService';
import { QuickMatchResultCache } from '../types/quickResult';
import { sortMatchResultsForStandings } from '../utils/standingsSort';
import { SeriesTeamStanding } from '../types/quickSeries';
import redis from '../config/redis';
import {
    ExcelExportRequest,
    ExcelExportResponse,
    ExcelMatchData,
    ExcelSeriesData,
    ExcelSeriesStandingRow,
    ExcelSlotRow,
    ExcelStandingRow,
} from '../types/excelExport';
import { ServiceError } from '../utils/serviceError';
import { teamsMatch } from '../utils/seriesSlotUtils';

export class ExcelExportService extends BaseService {
    private readonly CACHE_TTL = 1800;

    async exportMatchToExcel(
        quickMatchId: string,
        userId: string,
        request: ExcelExportRequest = {}
    ): Promise<ExcelExportResponse> {
        const startTime = Date.now();

        try {
            this.logger.info(`Starting Excel export for match: ${quickMatchId}`);

            const matchData = await this.prepareMatchData(quickMatchId, userId);
            const workbook = await this.generateMatchWorkbook(matchData);
            const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
            const filename = this.generateFilename(matchData.matchInfo.name, request.customFilename, 'match');
            const r2Key = await this.uploadToR2(buffer, filename, quickMatchId);
            const preview = await storedFileService.ensureClientPreview({
                userId,
                assetType: 'EXCEL',
                r2Key,
                resourceId: r2Key,
                quickMatchId,
                filename,
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });

            await this.cacheMatchExportInfo(quickMatchId, r2Key, filename);

            return this.buildResponse(preview, filename, r2Key, startTime, matchData.standings.length, buffer.length);
        } catch (error) {
            this.handleError(error, 'Excel Export');
            throw error;
        }
    }

    async exportSeriesToExcel(
        seriesId: string,
        userId: string,
        request: ExcelExportRequest = {}
    ): Promise<ExcelExportResponse> {
        const startTime = Date.now();

        try {
            this.logger.info(`Starting Excel export for series: ${seriesId}`);

            const seriesData = await this.prepareSeriesData(seriesId, userId);
            const workbook = await this.generateSeriesWorkbook(seriesData);
            const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
            const filename = this.generateFilename(seriesData.seriesInfo.name, request.customFilename, 'series');
            const r2Key = await this.uploadToR2(buffer, filename, seriesId);
            const preview = await storedFileService.ensureClientPreview({
                userId,
                assetType: 'EXCEL',
                r2Key,
                resourceId: r2Key,
                quickSeriesId: seriesId,
                filename,
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });

            await this.cacheSeriesExportInfo(seriesId, r2Key, filename);

            return this.buildResponse(preview, filename, r2Key, startTime, seriesData.standings.length, buffer.length);
        } catch (error) {
            this.handleError(error, 'Series Excel Export');
            throw error;
        }
    }

    private buildResponse(
        preview: { previewUrl: string; expiresAt: string },
        filename: string,
        r2Key: string,
        startTime: number,
        totalTeams: number,
        fileSize: number
    ): ExcelExportResponse {
        const generationTimeMs = Date.now() - startTime;
        this.logger.info(`Excel export completed: ${filename} (${generationTimeMs}ms)`);

        return {
            downloadUrl: preview.previewUrl,
            filename,
            r2Key,
            expiresAt: new Date(preview.expiresAt),
            generationTimeMs,
            totalTeams,
            fileSize,
        };
    }

    private async prepareMatchData(quickMatchId: string, userId: string): Promise<ExcelMatchData> {
        const match = await quickMatchService.getQuickMatchById(quickMatchId, userId);
        if (!match) {
            throw new ServiceError('Match not found', 404, 'NOT_FOUND');
        }

        const results = await quickResultService.getMatchResults(quickMatchId, userId);
        if (results.length === 0) {
            throw new ServiceError('No results found for this match', 400, 'NO_RESULTS');
        }

        return {
            matchInfo: {
                name: match.matchName,
                game: match.game,
                map: match.map,
                createdAt: match.createdAt,
                totalTeams: results.length,
                killPointsValue: match.killPointsValue ?? 1,
                scoringDescription: match.scoringDescription,
            },
            slots: await this.buildSlotRows(quickMatchId, userId, results),
            standings: this.formatMatchStandings(results),
        };
    }

    private async prepareSeriesData(seriesId: string, userId: string): Promise<ExcelSeriesData> {
        const series = await quickSeriesService.getTournamentSeriesById(seriesId, userId);
        if (!series) {
            throw new ServiceError('Tournament series not found', 404, 'NOT_FOUND');
        }

        let leaderboard = await quickSeriesService.getSeriesLeaderboard(seriesId, userId);
        if (!leaderboard?.leaderboardData?.length) {
            leaderboard = await quickSeriesService.updateSeriesLeaderboard(seriesId, userId);
        }

        if (!leaderboard?.leaderboardData?.length) {
            throw new ServiceError(
                'No series leaderboard data. Add matches with results before exporting.',
                400,
                'NO_LEADERBOARD'
            );
        }

        const standings = await this.formatSeriesStandings(leaderboard.leaderboardData, userId);
        const seriesMatches = await quickSeriesService.getSeriesMatches(seriesId, userId);
        const firstMatch = [...seriesMatches].sort((a, b) => a.matchOrder - b.matchOrder)[0];
        const slots = firstMatch
            ? await this.buildSlotRows(firstMatch.quickMatchId, userId, [])
            : this.slotsFromSeriesStandings(standings);

        return {
            seriesInfo: {
                name: series.seriesName,
                game: series.game,
                totalMatches: series.totalMatches,
                matchesCompleted: leaderboard.lastUpdatedMatch,
                totalTeams: standings.length,
                status: series.status,
                createdAt: series.createdAt,
            },
            slots: slots.length > 0 ? slots : this.slotsFromSeriesStandings(standings),
            standings,
        };
    }

    private slotsFromSeriesStandings(standings: ExcelSeriesStandingRow[]): ExcelSlotRow[] {
        return standings
            .map(s => ({ slotNumber: s.slotNumber, teamName: s.teamName }))
            .sort((a, b) => a.slotNumber - b.slotNumber);
    }

    private async buildSlotRows(
        quickMatchId: string,
        userId: string,
        results: QuickMatchResultCache[]
    ): Promise<ExcelSlotRow[]> {
        const slots = await quickSlotService.listQuickMatchSlots(quickMatchId, userId);

        if (slots.length > 0) {
            return slots
                .map(s => ({ slotNumber: s.slotNumber, teamName: s.teamName }))
                .sort((a, b) => a.slotNumber - b.slotNumber);
        }

        if (results.length === 0) {
            return [];
        }

        const seen = new Set<number>();
        return results
            .filter(r => {
                if (seen.has(r.slotNumber)) return false;
                seen.add(r.slotNumber);
                return true;
            })
            .map(r => ({ slotNumber: r.slotNumber, teamName: r.teamName }))
            .sort((a, b) => a.slotNumber - b.slotNumber);
    }

    private formatMatchStandings(results: QuickMatchResultCache[]): ExcelStandingRow[] {
        const sorted = sortMatchResultsForStandings(results);
        return sorted.map((result, index) => ({
            rank: index + 1,              
            slotNumber: result.slotNumber,
            teamName: result.teamName,
            position: result.position,    
            totalKills: result.totalKills,
            positionPoints: result.positionPoints,
            killPoints: result.killPoints,
            totalPoints: result.totalPoints,
            isWinner: index === 0,
        }));
    }

    private async formatSeriesStandings(
        leaderboard: SeriesTeamStanding[],
        userId: string
    ): Promise<ExcelSeriesStandingRow[]> {
        const matchIds = [...new Set(leaderboard.flatMap(s => s.matchResults.map(m => m.quickMatchId)))];
        const resultsByMatch = new Map<string, QuickMatchResultCache[]>();

        for (const matchId of matchIds) {
            resultsByMatch.set(matchId, await quickResultService.getMatchResults(matchId, userId));
        }

        return leaderboard.map((standing, index) => {
            let positionPoints = 0;
            let killPoints = 0;
            let wwcd = 0;
            let slotNumber = index + 1;

            for (const matchResult of standing.matchResults) {
                const matchRows = resultsByMatch.get(matchResult.quickMatchId) ?? [];
                const teamRow = matchRows.find(r => teamsMatch(r.teamName, standing.teamName));
                if (!teamRow) continue;

                positionPoints += teamRow.positionPoints;
                killPoints += teamRow.killPoints;
                if ((teamRow.rank ?? teamRow.position) === 1) {
                    wwcd += 1;
                }
                slotNumber = teamRow.slotNumber;
            }

            return {
                rank: index + 1,
                slotNumber,
                teamName: standing.teamName,
                matchesPlayed: standing.matchesPlayed,
                totalKills: standing.totalKills,
                positionPoints,
                killPoints,
                wwcd,
                totalPoints: standing.totalPoints,
                isLeader: index === 0,
            };
        });
    }

    private initWorkbook(): ExcelJS.Workbook {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'SCRYMZ';
        workbook.lastModifiedBy = 'SCRYMZ System';
        workbook.created = new Date();
        return workbook;
    }

    private async generateMatchWorkbook(data: ExcelMatchData): Promise<ExcelJS.Workbook> {
        const workbook = this.initWorkbook();
        const sheet = workbook.addWorksheet('Match Report');
        this.setStandardColumns(sheet, 7);

        let row = 1;
        row = this.addMergedTitle(sheet, row, data.matchInfo.name, 7);
        row += 1;

        row = this.writeSlotMappingSection(sheet, row, data.slots, 7);
        row += 1;

        row = this.addSectionHeading(sheet, row, 'Match Details', 7);
        const matchDetails: Array<[string, string]> = [
            ['Match Name', data.matchInfo.name],
            ['Game', data.matchInfo.game],
            ['Map', data.matchInfo.map || '—'],
            ['Date', new Date(data.matchInfo.createdAt).toLocaleString()],
            ['Total Teams', String(data.matchInfo.totalTeams)],
            ['Kill Points', String(data.matchInfo.killPointsValue)],
        ];
        if (data.matchInfo.scoringDescription) {
            matchDetails.push(['Scoring', data.matchInfo.scoringDescription]);
        }
        row = this.writeKeyValueSection(sheet, row, matchDetails);
        row += 1;

        row = this.addSectionHeading(sheet, row, 'Results & Rankings', 7);
        row = this.addTableHeader(sheet, row, [
            'Rank', 'Team Name', 'Position', 'Finishes', 'Pos Pts', 'Kill Pts', 'Total Pts',
        ]);

        for (const standing of data.standings) {
            const dataRow = sheet.getRow(row);
            dataRow.values = [
                undefined,
                standing.rank,
                standing.teamName,
                standing.position,
                standing.totalKills,
                standing.positionPoints,
                standing.killPoints,
                standing.totalPoints,
            ];
            this.highlightStandingRow(dataRow, standing.isWinner, row, 7);
            row += 1;
        }

        sheet.views = [{ state: 'frozen', ySplit: 1 }];
        return workbook;
    }

    private async generateSeriesWorkbook(data: ExcelSeriesData): Promise<ExcelJS.Workbook> {
        const workbook = this.initWorkbook();
        const sheet = workbook.addWorksheet('Series Report');
        const colSpan = 8;
        this.setStandardColumns(sheet, colSpan);

        let row = 1;
        row = this.addMergedTitle(sheet, row, data.seriesInfo.name, colSpan);
        row += 1;

        row = this.writeSlotMappingSection(sheet, row, data.slots, colSpan);
        row += 1;

        row = this.addSectionHeading(sheet, row, 'Series Details', colSpan);
        const seriesDetails: Array<[string, string]> = [
            ['Series Name', data.seriesInfo.name],
            ['Game', data.seriesInfo.game],
            ['Total Matches', String(data.seriesInfo.totalMatches)],
            ['Matches Completed', String(data.seriesInfo.matchesCompleted)],
            ['Total Teams', String(data.seriesInfo.totalTeams)],
            ['Status', data.seriesInfo.status],
            ['Created', new Date(data.seriesInfo.createdAt).toLocaleString()],
        ];
        row = this.writeKeyValueSection(sheet, row, seriesDetails);
        row += 1;

        row = this.addSectionHeading(sheet, row, 'Results & Rankings', colSpan);
        row = this.addTableHeader(sheet, row, [
            'Rank', 'Team Name', 'Matches', 'Kills', 'Pos Pts', 'Kill Pts', 'WWCD', 'Total Pts',
        ]);

        for (const standing of data.standings) {
            const dataRow = sheet.getRow(row);
            dataRow.values = [
                undefined,
                standing.rank,
                standing.teamName,
                standing.matchesPlayed,
                standing.totalKills,
                standing.positionPoints,
                standing.killPoints,
                standing.wwcd,
                standing.totalPoints,
            ];
            this.highlightStandingRow(dataRow, standing.isLeader, row, colSpan);
            row += 1;
        }

        sheet.views = [{ state: 'frozen', ySplit: 1 }];
        return workbook;
    }

    private setStandardColumns(sheet: ExcelJS.Worksheet, count: number): void {
        sheet.columns = Array.from({ length: count + 1 }, (_, i) => ({
            width: i === 0 ? 8 : i === 2 ? 28 : 14,
        }));
    }

    private writeSlotMappingSection(
        sheet: ExcelJS.Worksheet,
        row: number,
        slots: ExcelSlotRow[],
        colSpan: number
    ): number {
        row = this.addSectionHeading(sheet, row, 'Team & Slot Mapping', colSpan);
        row = this.addTableHeader(sheet, row, ['Slot', 'Team Name']);
        for (const slot of slots) {
            const dataRow = sheet.getRow(row);
            dataRow.values = [undefined, slot.slotNumber, slot.teamName];
            this.styleDataRow(dataRow, 2);
            row += 1;
        }
        return row;
    }

    private writeKeyValueSection(sheet: ExcelJS.Worksheet, row: number, pairs: Array<[string, string]>): number {
        for (const [label, value] of pairs) {
            const detailRow = sheet.getRow(row);
            detailRow.values = [undefined, label, value];
            detailRow.getCell(2).font = { bold: true };
            detailRow.getCell(2).fill = this.labelFill();
            this.styleDataRow(detailRow, 2);
            row += 1;
        }
        return row;
    }

    private highlightStandingRow(dataRow: ExcelJS.Row, highlight: boolean, row: number, colCount: number): void {
        if (highlight) {
            dataRow.eachCell({ includeEmpty: false }, cell => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFEF3C7' },
                };
            });
        } else if (row % 2 === 0) {
            dataRow.eachCell({ includeEmpty: false }, cell => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF8FAFC' },
                };
            });
        }
        this.styleDataRow(dataRow, colCount);
    }

    private addMergedTitle(sheet: ExcelJS.Worksheet, row: number, title: string, colSpan: number): number {
        sheet.mergeCells(row, 2, row, colSpan + 1);
        const cell = sheet.getCell(row, 2);
        cell.value = title;
        cell.font = { size: 16, bold: true };
        cell.alignment = { horizontal: 'center' };
        return row + 1;
    }

    private addSectionHeading(sheet: ExcelJS.Worksheet, row: number, title: string, colSpan: number): number {
        sheet.mergeCells(row, 2, row, colSpan + 1);
        const cell = sheet.getCell(row, 2);
        cell.value = title;
        cell.font = { size: 12, bold: true, color: { argb: 'FF1E3A5F' } };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE2E8F0' },
        };
        cell.alignment = { horizontal: 'left' };
        return row + 1;
    }

    private addTableHeader(sheet: ExcelJS.Worksheet, row: number, headers: string[]): number {
        const headerRow = sheet.getRow(row);
        headerRow.values = [undefined, ...headers];
        headerRow.eachCell({ includeEmpty: false }, cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF3B82F6' },
            };
            cell.alignment = { horizontal: 'center' };
            cell.border = this.cellBorder();
        });
        return row + 1;
    }

    private styleDataRow(row: ExcelJS.Row, colCount: number): void {
        for (let col = 2; col <= colCount + 1; col++) {
            const cell = row.getCell(col);
            cell.border = this.cellBorder();
            cell.alignment = { vertical: 'middle' };
        }
    }

    private labelFill(): ExcelJS.Fill {
        return {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE2E8F0' },
        };
    }

    private cellBorder(): Partial<ExcelJS.Borders> {
        return {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
        };
    }

    private async uploadToR2(buffer: Buffer, filename: string, entityId: string): Promise<string> {
        const uploadResult = await r2Service.uploadFile(
            buffer,
            filename,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'RESULT_IMAGE',
            entityId,
            'quick-pt'
        );
        return uploadResult.key;
    }

    private generateFilename(name: string, customFilename: string | undefined, prefix: 'match' | 'series'): string {
        if (customFilename) {
            return customFilename.endsWith('.xlsx') ? customFilename : `${customFilename}.xlsx`;
        }

        const sanitized = name.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().substring(0, 50);
        const timestamp = new Date().toISOString().slice(0, 10);
        return `${sanitized || prefix}_${timestamp}.xlsx`;
    }

    private async cacheMatchExportInfo(quickMatchId: string, r2Key: string, filename: string): Promise<void> {
        await redis.set(
            `quickMatch:${quickMatchId}:excelExport`,
            JSON.stringify({ r2Key, filename, generatedAt: new Date().toISOString(), quickMatchId }),
            this.CACHE_TTL
        );
    }

    private async cacheSeriesExportInfo(seriesId: string, r2Key: string, filename: string): Promise<void> {
        await redis.set(
            `quickSeries:${seriesId}:excelExport`,
            JSON.stringify({ r2Key, filename, generatedAt: new Date().toISOString(), seriesId }),
            this.CACHE_TTL
        );
    }
}

export const excelExportService = new ExcelExportService();
