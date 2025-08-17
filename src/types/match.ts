export interface MatchCache {
    id: string;
    matchNumber: number;
    matchDate: string;
    status: 'PENDING_PROCESSING' | 'PROCESSED' | 'ERROR';
    tournamentId: string;
    groupId?: string; // Add this
    processedData?: any; // AI results from screenshot processing
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface CreateMatchData {
    matchNumber: number;
    matchDate?: Date;
    groupId?: string; // Add this
}

export interface UpdateMatchData {
    matchNumber?: number;
    matchDate?: Date;
    status?: 'PENDING_PROCESSING' | 'PROCESSED' | 'ERROR';
    processedData?: any;
    groupId?: string; // Add this
}

export interface Screenshot {
    id: string;
    originalName: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    type: 'SLOT_LIST' | 'RESULT_SCREEN';
    storageUrl: string;
    isProcessed: boolean;
    uploadedAt: string;
    matchId: string;
}