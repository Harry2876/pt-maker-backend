export interface ExcelExportRequest {
    customFilename?: string;
}

export interface ExcelExportResponse {
    downloadUrl: string;
    filename: string;
    r2Key: string;
    expiresAt: Date;
    generationTimeMs: number;
    totalTeams: number;
    fileSize: number;
}

export interface ExcelSlotRow {
    slotNumber: number;
    teamName: string;
}

export interface ExcelStandingRow {
    rank: number;
    slotNumber: number;
    teamName: string;
    position: number;
    totalKills: number;
    positionPoints: number;
    killPoints: number;
    totalPoints: number;
    isWinner: boolean;
}

export interface ExcelMatchData {
    matchInfo: {
        name: string;
        game: string;
        map?: string;
        createdAt: string;
        totalTeams: number;
        killPointsValue: number;
        scoringDescription?: string;
    };
    slots: ExcelSlotRow[];
    standings: ExcelStandingRow[];
}

export interface ExcelSeriesStandingRow {
    rank: number;
    slotNumber: number;
    teamName: string;
    matchesPlayed: number;
    totalKills: number;
    positionPoints: number;
    killPoints: number;
    wwcd: number;
    totalPoints: number;
    isLeader: boolean;
}

export interface ExcelSeriesData {
    seriesInfo: {
        name: string;
        game: string;
        totalMatches: number;
        matchesCompleted: number;
        totalTeams: number;
        status: string;
        createdAt: string;
    };
    slots: ExcelSlotRow[];
    standings: ExcelSeriesStandingRow[];
}
