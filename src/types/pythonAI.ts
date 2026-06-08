// ===== SCOREBOARD OCR =====

export interface ScoreboardPlayer {
    name: string;
    finishes: number;
}

/**
 * Team from an attendance screenshot (expanded_layout).
 * Identified by slot number.
 */
export interface AttendanceTeam {
    slot_number: number;
    team_block_bbox: [number, number, number, number];
    players: ScoreboardPlayer[];
}

/**
 * Team from a result screenshot (compact_layout).
 * Identified by final rank.
 */
export interface ResultTeam {
    team_rank: number;
    team_block_bbox: [number, number, number, number];
    players: ScoreboardPlayer[];
}

export type ScoreboardLayout = 'expanded_layout' | 'compact_layout';

export interface ScoreboardData {
    teams: Array<AttendanceTeam | ResultTeam>;
    layout: ScoreboardLayout;
    inference_time: number;
}

export interface ScoreboardResponseMetadata {
    processing_time_ms: number;
    images_processed: number;
    image_dimensions: string;
    layout: ScoreboardLayout;
    timestamp: string;
}

export interface ScoreboardResponse {
    status: 'success' | 'error';
    request_id: string | null;
    data: ScoreboardData;
    metadata: ScoreboardResponseMetadata;
}

// ===== CROP UPLOAD =====

export interface CropUploadRequest {
    /** Full raw R2 HTTPS URLs or object keys — Python downloads from R2 directly */
    image_urls: string[];
    metadata?: Record<string, any> | null;
    cleanup_temp?: boolean;
}

export interface CropUploadResponse {
    status: 'success' | 'error';
    request_id: string | null;
    uploaded_urls: string[];
    metadata: Record<string, any>;
}

// ===== STANDINGS =====

export interface StandingsTeamData {
    rank: number;
    slot_number: number;
    team_name: string;
    matches_played?: number;
    total_points?: number;
    position_points?: number;
    finish_points?: number;
    wwcd?: number;
}

export interface StandingsRequest {
    /** Raw R2 HTTPS URL to the template image (from GET /quick-pt/templates → rawTemplateUrl) */
    template_url: string;
    /** Raw R2 HTTPS URL to templateConfig_N.json (paired with template_url) */
    template_config_url: string;
    format_type: '8_teams' | '16_teams' | '24_teams';
    team_data: StandingsTeamData[];
    table_font_size?: number | null;
    table_header_font_size?: number | null;
    table_header_label_mode?: string | null;
    row_height_adjust?: number | null;
    element_overrides?: Record<string, Record<string, any>> | null;
    column_overrides?: Record<string, Record<string, any>> | null;
    advanced_config?: Record<string, any> | null;
    output_filename?: string;
    options?: {
        cleanup_temp?: boolean;
        upload_to_r2?: boolean;
        compress_image?: boolean;
        image_quality?: number;
    } | null;
}

export interface StandingsStats {
    teams_processed: number;
    layout_type: string;
    processing_time_ms: number;
    template_dimensions?: string | null;
    fonts_loaded?: string[];
}

export interface StandingsResponseMetadata {
    format_type: string;
    template_used: string;
    output_filename: string;
    image_dimensions?: string | null;
    r2_upload_url?: string | null;
    processing_stats: StandingsStats;
}

export interface StandingsResponse {
    status: 'success' | 'error';
    request_id: string | null;
    timestamp: string;
    data: Record<string, any>;
    metadata: StandingsResponseMetadata;
}
