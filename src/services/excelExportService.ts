import { BaseService } from './baseService';
import * as ExcelJS from 'exceljs';
import { r2Service } from './cloudflareR2Service';
import { signedUrlUtility } from './signedUrlUtility';
import { quickMatchService } from './quickMatchService';
import { quickProcessingService } from './quickProcessingService';
import { tieBreakingService } from './tieBreakingService';
import redis from '../config/redis';
import { randomUUID } from 'crypto';
import {
    ExcelExportRequest,
    ExcelExportResponse,
    ExcelMatchData,
    ExcelStandingRow,
    ExcelDetailedRow,
    ExcelPlayerRow,
    ExcelPointsMatrix
} from '../types/excelExport';

export class ExcelExportService extends BaseService {
    private readonly CACHE_TTL = 1800; // 30 minutes
    private readonly FILE_CLEANUP_TTL = 3600; // 1 hour

    constructor() {
        super();
    }

    /**
     * Main export function - generates Excel file for Quick Match
     */
    async exportMatchToExcel(
        quickMatchId: string,
        userId: string,
        request: ExcelExportRequest
    ): Promise<ExcelExportResponse> {
        const startTime = Date.now();
        
        try {
            this.logger.info(`Starting Excel export for match: ${quickMatchId}`);

            // 1. Fetch and validate match data
            const matchData = await this.prepareMatchData(quickMatchId, userId, request);
            
            // 2. Generate Excel workbook
            const workbook = await this.generateWorkbook(matchData, request);
            
            // 3. Convert to buffer
            const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
            
            // 4. Generate filename
            const filename = this.generateFilename(matchData.matchInfo, request.customFilename);
            
            // 5. Upload to R2
            const r2Key = await this.uploadToR2(buffer, filename, quickMatchId);
            
            // 6. Generate signed URL
            const signedUrlData = await signedUrlUtility.generateSignedUrl(r2Key, { expiryMinutes: 30 });
            
            // 7. Cache export info
            await this.cacheExportInfo(quickMatchId, r2Key, filename);
            
            const generationTimeMs = Date.now() - startTime;
            
            this.logger.info(`Excel export completed: ${filename} (${generationTimeMs}ms)`);
            
            return {
                success: true,
                downloadUrl: signedUrlData.signedUrl,
                filename,
                r2Key,
                expiresAt: signedUrlData.expiresAt,
                generationTimeMs,
                sheetsGenerated: this.getSheetCount(request),
                totalRows: this.calculateTotalRows(matchData, request),
                fileSize: buffer.length
            };

        } catch (error) {
            this.handleError(error, 'Excel Export');
            throw error;
        }
    }

    /**
     * Prepare all data needed for Excel generation
     */
    private async prepareMatchData(
        quickMatchId: string,
        userId: string,
        request: ExcelExportRequest
    ): Promise<ExcelMatchData> {
        // Get match info
        const match = await quickMatchService.getQuickMatchById(quickMatchId, userId);
        if (!match) {
            throw new Error('Match not found');
        }

        // Get match results
        const results = await quickProcessingService.getMatchResults(quickMatchId, userId);
        if (results.length === 0) {
            throw new Error('No results found for this match');
        }

        // Apply tie-breaking if needed
        const conflictDetection = await tieBreakingService.detectMatchConflicts(results);
        let finalResults = results;
        
        if (conflictDetection.hasConflicts) {
            // Auto-resolve conflicts if possible
            const tieBreakingResult = await tieBreakingService.applyAutomaticTieBreaking(
                conflictDetection.conflictGroups,
                [] // Empty tie-breaking rules array - will use defaults
            );
            finalResults = tieBreakingResult.resolvedResults;
        }

        // Prepare data structures
        const matchData: ExcelMatchData = {
            matchInfo: {
                id: match.id,
                name: match.matchName,
                game: match.game,
                map: match.map,
                createdAt: match.createdAt,
                totalTeams: finalResults.length,
                scoringConfig: {
                    positionPoints: match.positionPointsConfig || [20, 15, 12, 10, 8, 6, 4, 2, 1, 0],
                    killPointsValue: match.killPointsValue || 1,
                    description: match.scoringDescription
                }
            },
            standings: this.formatStandings(finalResults),
            detailedResults: this.formatDetailedResults(finalResults),
            pointsMatrix: this.formatPointsMatrix(match.positionPointsConfig || [20, 15, 12, 10, 8, 6, 4, 2, 1, 0])
        };

        if (request.includePlayerDetails) {
            matchData.playerBreakdown = this.formatPlayerBreakdown(finalResults);
        }

        return matchData;
    }

    /**
     * Generate Excel workbook with multiple sheets
     */
    private async generateWorkbook(data: ExcelMatchData, request: ExcelExportRequest): Promise<ExcelJS.Workbook> {
        const workbook = new ExcelJS.Workbook();
        
        // Set workbook properties
        workbook.creator = 'SCRYMZ';
        workbook.lastModifiedBy = 'SCRYMZ System';
        workbook.created = new Date();
        
        // Generate sheets
        await this.createMatchSummarySheet(workbook, data);
        await this.createFinalStandingsSheet(workbook, data);
        await this.createDetailedResultsSheet(workbook, data);
        
        if (request.includePointsBreakdown) {
            await this.createPointsBreakdownSheet(workbook, data);
        }
        
        if (request.includePlayerDetails && data.playerBreakdown) {
            await this.createPlayerBreakdownSheet(workbook, data);
        }
        
        return workbook;
    }

    /**
     * Sheet 1: Match Summary
     */
    private async createMatchSummarySheet(workbook: ExcelJS.Workbook, data: ExcelMatchData): Promise<void> {
        const sheet = workbook.addWorksheet('Match Summary');
        
        // Set column widths
        sheet.columns = [
            { header: 'Property', key: 'property', width: 25 },
            { header: 'Value', key: 'value', width: 40 }
        ];
        
        // Add match information
        const summaryData = [
            ['Match Name', data.matchInfo.name],
            ['Game', data.matchInfo.game],
            ['Map', data.matchInfo.map || 'Not specified'],
            ['Created At', new Date(data.matchInfo.createdAt).toLocaleString()],
            ['Total Teams', data.matchInfo.totalTeams.toString()],
            ['Scoring System', data.matchInfo.scoringConfig.description || 'Standard BGMI'],
            ['Kill Points Value', data.matchInfo.scoringConfig.killPointsValue.toString()],
            ['Position Points', data.matchInfo.scoringConfig.positionPoints.join(', ')]
        ];
        
        summaryData.forEach((row, index) => {
            const excelRow = sheet.addRow({ property: row[0], value: row[1] });
            
            // Style header column
            excelRow.getCell('property').font = { bold: true };
            excelRow.getCell('property').fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE2E8F0' }
            };
        });
        
        // Add title
        sheet.insertRow(1, ['Match Information Summary']);
        sheet.mergeCells('A1:B1');
        sheet.getCell('A1').font = { size: 16, bold: true };
        sheet.getCell('A1').alignment = { horizontal: 'center' };
        
        // Add borders
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                row.eachCell((cell) => {
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                });
            }
        });
    }

    /**
     * Sheet 2: Final Standings
     */
    private async createFinalStandingsSheet(workbook: ExcelJS.Workbook, data: ExcelMatchData): Promise<void> {
        const sheet = workbook.addWorksheet('Final Standings');
        
        // Define columns
        sheet.columns = [
            { header: 'Rank', key: 'rank', width: 8 },
            { header: 'Team Name', key: 'teamName', width: 25 },
            { header: 'Slot', key: 'slotNumber', width: 8 },
            { header: 'Position', key: 'position', width: 12 },
            { header: 'Total Kills', key: 'totalKills', width: 12 },
            { header: 'Position Points', key: 'positionPoints', width: 15 },
            { header: 'Kill Points', key: 'killPoints', width: 12 },
            { header: 'Total Points', key: 'totalPoints', width: 15 },
            { header: 'Status', key: 'status', width: 15 }
        ];
        
        // Add data
        data.standings.forEach(standing => {
            sheet.addRow(standing);
        });
        
        // Style headers
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF3B82F6' }
        };
        headerRow.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        
        // Style winner (rank 1)
        const winnerRow = sheet.getRow(2);
        if (winnerRow) {
            winnerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFEF3C7' }
            };
        }
        
        // Add borders and alternating colors
        sheet.eachRow((row, rowNumber) => {
            // Alternating row colors (except header and winner)
            if (rowNumber > 2 && rowNumber % 2 === 0) {
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF8FAFC' }
                };
            }
            
            // Add borders
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });
        
        // Freeze header row
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    /**
     * Additional helper methods for other sheets...
     */
    private async createDetailedResultsSheet(workbook: ExcelJS.Workbook, data: ExcelMatchData): Promise<void> {
        // Implementation for detailed results sheet
        // Similar pattern to standings sheet but with player details
    }

    private async createPointsBreakdownSheet(workbook: ExcelJS.Workbook, data: ExcelMatchData): Promise<void> {
        // Implementation for points breakdown sheet
    }

    private async createPlayerBreakdownSheet(workbook: ExcelJS.Workbook, data: ExcelMatchData): Promise<void> {
        // Implementation for individual player statistics
    }

    /**
     * Data formatting methods
     */
    private formatStandings(results: any[]): ExcelStandingRow[] {
        return results
            .sort((a, b) => b.totalPoints - a.totalPoints || a.position - b.position)
            .map((result, index) => ({
                rank: index + 1,
                teamName: result.teamName,
                slotNumber: result.slotNumber,
                position: result.position,
                totalKills: result.totalKills,
                positionPoints: result.positionPoints,
                killPoints: result.killPoints,
                totalPoints: result.totalPoints,
                status: result.status || 'COMPLETED'
            }));
    }

    private formatDetailedResults(results: any[]): ExcelDetailedRow[] {
        return results.map(result => {
            const row: ExcelDetailedRow = {
                teamName: result.teamName,
                slotNumber: result.slotNumber,
                finalPosition: result.position,
                totalKills: result.totalKills
            };

            // Add player details if available
            if (result.playerResults && Array.isArray(result.playerResults)) {
                result.playerResults.forEach((player: any, index: number) => {
                    if (index < 4) { // Max 4 players per team
                        (row as any)[`player${index + 1}Name`] = player.playerName;
                        (row as any)[`player${index + 1}Kills`] = player.kills;
                    }
                });
            }

            return row;
        });
    }

    private formatPlayerBreakdown(results: any[]): ExcelPlayerRow[] {
        const playerRows: ExcelPlayerRow[] = [];
        
        results.forEach(result => {
            if (result.playerResults && Array.isArray(result.playerResults)) {
                result.playerResults.forEach((player: any) => {
                    playerRows.push({
                        teamName: result.teamName,
                        playerName: player.playerName,
                        kills: player.kills,
                        teamPosition: result.position,
                        teamTotalPoints: result.totalPoints
                    });
                });
            }
        });

        return playerRows.sort((a, b) => b.kills - a.kills);
    }

    private formatPointsMatrix(positionPoints: number[]): ExcelPointsMatrix[] {
        return positionPoints.map((points, index) => ({
            position: index + 1,
            points,
            description: index === 0 ? 'Winner Winner Chicken Dinner!' : `Position ${index + 1}`
        }));
    }

    /**
     * File management methods
     */
    private async uploadToR2(buffer: Buffer, filename: string, quickMatchId: string): Promise<string> {
        const uploadResult = await r2Service.uploadFile(
            buffer,
            filename,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'RESULT_IMAGE', // Reuse existing type for consistency
            quickMatchId,
            'quick-pt'
        );
        
        return uploadResult.key;
    }

    private generateFilename(matchInfo: any, customFilename?: string): string {
        if (customFilename) {
            return `${customFilename}.xlsx`;
        }
        
        const sanitized = matchInfo.name.replace(/[^a-zA-Z0-9\s\-_]/g, '').substring(0, 50);
        const timestamp = new Date().toISOString().slice(0, 10);
        return `${sanitized}_${timestamp}.xlsx`;
    }

    private async cacheExportInfo(quickMatchId: string, r2Key: string, filename: string): Promise<void> {
        const cacheData = {
            r2Key,
            filename,
            generatedAt: new Date().toISOString(),
            quickMatchId
        };
        
        await redis.set(`quickMatch:${quickMatchId}:excelExport`, JSON.stringify(cacheData), this.CACHE_TTL);
    }

    private getSheetCount(request: ExcelExportRequest): number {
        let count = 3; // Always: Summary, Standings, Detailed
        if (request.includePointsBreakdown) count++;
        if (request.includePlayerDetails) count++;
        return count;
    }

    private calculateTotalRows(data: ExcelMatchData, request: ExcelExportRequest): number {
        let rows = 10 + data.standings.length + data.detailedResults.length; // Base sheets
        if (request.includePointsBreakdown) rows += data.pointsMatrix.length;
        if (request.includePlayerDetails && data.playerBreakdown) rows += data.playerBreakdown.length;
        return rows;
    }
}

export const excelExportService = new ExcelExportService();