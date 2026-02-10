export interface ExcelExportRequest {
    quickMatchId: string;
    includePlayerDetails?: boolean;
    includePointsBreakdown?: boolean; 
    customFilename?: string;
}

export interface ExcelExportResponse {
    success: boolean;
    downloadUrl: string;
    filename: string;
    r2Key: string;
    expiresAt: Date;
    generationTimeMs: number;
    sheetsGenerated: number;
    totalRows: number;
    fileSize: number;
}

export interface ExcelMatchData {
    matchInfo: {
        id: string;
        name: string;
        game: string;
        map?: string;
        createdAt: string;
        totalTeams: number;
        scoringConfig: {
            positionPoints: number[];
            killPointsValue: number;
            description?: string;
        };
    };
    standings: ExcelStandingRow[];
    detailedResults: ExcelDetailedRow[];
    playerBreakdown?: ExcelPlayerRow[];
    pointsMatrix: ExcelPointsMatrix[];
}

export interface ExcelStandingRow {
    rank: number;
    teamName: string;
    slotNumber: number;
    position: number;
    totalKills: number;
    positionPoints: number;
    killPoints: number;
    totalPoints: number;
    status: string;
}

export interface ExcelDetailedRow {
    teamName: string;
    slotNumber: number;
    finalPosition: number;
    totalKills: number;
    player1Name?: string;
    player1Kills?: number;
    player2Name?: string;
    player2Kills?: number;
    player3Name?: string;
    player3Kills?: number;
    player4Name?: string;
    player4Kills?: number;
}

export interface ExcelPlayerRow {
    teamName: string;
    playerName: string;
    kills: number;
    teamPosition: number;
    teamTotalPoints: number;
}

export interface ExcelPointsMatrix {
    position: number;
    points: number;
    description: string;
}