export interface QuickMatchResultCache {
    id: string;
    quickMatchId: string;
    slotNumber: number;
    teamName: string;
    detectedTeamName?: string;
    position: number;
    rank: number;
    totalKills: number;
    positionPoints: number;
    killPoints: number;
    totalPoints: number;
    playerResults?: PlayerResult[];
    status: 'PENDING' | 'PROCESSED' | 'VERIFIED' | 'MANUAL_ENTRY';
    warningType?: string;
    needsReview: boolean;
    aiConfidence?: number;
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface CreateQuickMatchResultData {
    slotNumber: number;
    teamName: string;
    detectedTeamName?: string;
    position: number;
    rank: number;
    totalKills: number;
    positionPoints: number;
    killPoints: number;
    totalPoints: number;
    playerResults?: PlayerResult[];
    warningType?: string;
    needsReview?: boolean;
    aiConfidence?: number;
}

export interface UpdateQuickMatchResultData {
    teamName?: string;
    position?: number;
    rank?: number;
    totalKills?: number;
    positionPoints?: number;
    killPoints?: number;
    totalPoints?: number;
    playerResults?: PlayerResult[];
    status?: 'PENDING' | 'PROCESSED' | 'VERIFIED' | 'MANUAL_ENTRY';
    warningType?: string;
    needsReview?: boolean;
}

export interface PlayerResult {
    playerName: string;
    kills: number;
}

// Points Table
export interface QuickPointsTableCache {
    id: string;
    quickMatchId: string;
    tableImageUrl?: string;
    csvData?: any;
    pngGeneratedAt?: string;
    generationTimeMs?: number;
    template: string;
    expiresAt?: string;
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

// Python AI Response Types
export interface PythonAIAttendanceResponse {
    status: 'success' | 'error';
    request_id: string;
    data: {
        cards: Array<{
            source: string;              // Image filename  
            slot_number: number;         // Renamed from slot_position
            players: string[];           // Renamed from player_names
            finishes: string[];          // NEW: finish positions ["1", "5", "DNF"]
        }>;
        processing_stats: {
            total_cards: number;
            successful_cards: number;
            failed_cards: number;
        };
    };
    metadata: {
        engine_used: string;            // NEW: OCR engine used
        processing_time_ms: number;
        image_dimensions: string;       // NEW: "2712x1220"
        timestamp: string;              // NEW: ISO timestamp
    };
}

export interface PythonAIResultResponse {
    status: 'success' | 'error';
    request_id: string;
    data: {
        cards: Array<{
            rank: number;
            players: Array<{
                name: string;           // Individual player tracking
                finish: number;         // Individual finish position
            }>;
        }>;
        processing_stats: {
            total_cards: number;
            successful_cards: number;
            failed_cards: number;
        };
    };
    metadata: {
        engine_used: string;
        processing_time_ms: number;
        image_dimensions: string;
        timestamp: string;
    };
}

export interface PythonAIExportResponse {
    success: boolean;
    data: {
        png_url: string;
        csv_data: any;
    };
    metadata?: {
        generation_time_ms: number;
    };
}

// NEW: Engine status interfaces
export interface PythonAIEngineResponse {
    status: 'success' | 'error';
    data: {
        engines: Array<{
            id: string;
            name: string;
            description: string;
            optimized_for: string[];
            status: 'healthy' | 'unhealthy';
        }>;
        default_engine: string;
        total_engines: number;
    };
}

export interface PythonAIHealthResponse {
    status: 'healthy' | 'unhealthy';
    version: string;
    timestamp: number;
    services: {
        ocr_engines: string;
        image_processing: string;
        file_cleanup: string;
    };
    system: {
        memory_usage: string;
        cpu_usage: string;
        disk_usage: string;
        temp_files: number;
        gpu_available: boolean;
    };
}

// Warning Types
export type WarningType = 
    | 'TEAM_NAME_MISMATCH'
    | 'SLOT_NOT_FOUND'
    | 'DUPLICATE_TEAM'
    | 'MISSING_KILLS'
    | 'INVALID_POSITION'
    | 'LOW_AI_CONFIDENCE';