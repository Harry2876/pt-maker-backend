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
    team_logo_url?: string | null;
}

export interface StandingsRequest {
    /** Raw R2 HTTPS URL to the template image (from GET /quick-pt/templates → rawTemplateUrl) */
    template_url: string;
    /** Raw R2 HTTPS URL to templateConfig_N.json (paired with template_url) */
    template_config_url: string;
    format_type: '8_teams' | '16_teams' | '24_teams';
    team_data: StandingsTeamData[];
    /** Header overlay text — overrides template default when set */
    event_name?: string | null;
    organiser_name?: string | null;
    sponsor_name?: string | null;
    table_font_size?: number | null;
    table_header_font_size?: number | null;
    table_header_label_mode?: string | null;
    table_header_column_padding?: number | null;
    row_height_adjust?: number | null;
    team_logo_size?: number | null;
    team_logo_size_adjust?: number | null;
    team_logo_gap?: number | null;
    team_shift_right?: number | null;
    chicken_dinner_icon_size?: number | null;
    chicken_icon_gap?: number | null;
    element_overrides?: Record<string, Record<string, any>> | null;
    column_overrides?: Record<string, Record<string, any>> | null;
    font_customization?: FontCustomization | null;
    advanced_config?: Record<string, any> | null;
    show_branding?: boolean;
    output_filename?: string;
    options?: PythonImageOptions | null;
}

/** Styling and header fields shared by match and series standings export */
export interface StandingsExportOptions {
    eventName?: string | null;
    organiserName?: string | null;
    sponsorName?: string | null;
    tableFontSize?: number | null;
    tableHeaderFontSize?: number | null;
    tableHeaderLabelMode?: string | null;
    tableHeaderColumnPadding?: number | null;
    rowHeightAdjust?: number | null;
    teamLogoSize?: number | null;
    teamLogoSizeAdjust?: number | null;
    teamLogoGap?: number | null;
    teamShiftRight?: number | null;
    chickenDinnerIconSize?: number | null;
    chickenIconGap?: number | null;
    elementOverrides?: Record<string, Record<string, any>> | null;
    columnOverrides?: Record<string, Record<string, any>> | null;
    fontCustomization?: FontCustomization | null;
    advancedConfig?: Record<string, any> | null;
    showBranding?: boolean;
    outputFilename?: string;
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

// ===== GRAPHICS GENERATION =====

export interface FontRoleConfig {
    font_file?: string;
    family?: string;
    weight?: string;
    size?: number;
    color?: string;
    alignment?: string;
}

export interface FontCustomization {
    override_all_fonts?: boolean;
    header_font?: FontRoleConfig;
    sponsor_font?: FontRoleConfig;
    organiser_font?: FontRoleConfig;
    table_header_font?: FontRoleConfig;
    table_data_font?: FontRoleConfig;
    team_name_font?: FontRoleConfig;
    slot_number_font?: FontRoleConfig;
    rank_font?: FontRoleConfig;
    footer_font?: FontRoleConfig;
    branding_font?: FontRoleConfig;
    global_size_multiplier?: number;
}

export interface FontsListResponse {
    status: 'success' | 'error';
    count: number;
    fonts: Array<{ id: string; file: string; label: string }>;
    usage?: Record<string, any>;
}

/** One row in slot_data sent to Python */
export interface SlotListSlotData {
    slot_number: number;
    team_name: string;
    team_logo_url?: string | null;
}

/** Internal request object (snake_case — matches Python) */
export interface SlotListRequest {
    template_url: string;
    template_config_url: string;
    slot_data: SlotListSlotData[];
    header_overrides?: Record<string, any> | null;
    slot_number_font_size?: number | null;
    team_name_font_size?: number | null;
    slot_number_color?: string | null;
    team_name_color?: string | null;
    team_logo_gap?: number | null;
    team_logo_size?: number | null;
    grid_overrides?: Record<string, any> | null;
    font_customization?: FontCustomization | null;
    show_branding?: boolean;
    output_filename?: string;
    options?: PythonImageOptions;
}

/** Shared Python generate options (standings, roster, top-10, slot-list) */
export interface PythonImageOptions {
    upload_to_r2?: boolean;
    compress_image?: boolean;
    image_quality?: number;
    render_scale?: number | null;
    cleanup_temp?: boolean;
    local_debug_path?: string | null;
}

/** CamelCase options from Android/controller → mapped in payload builder */
export interface SlotListExportOptions {
    headerOverrides?: Record<string, any> | null;
    slotNumberFontSize?: number | null;
    teamNameFontSize?: number | null;
    slotNumberColor?: string | null;
    teamNameColor?: string | null;
    teamLogoGap?: number | null;
    teamLogoSize?: number | null;
    gridOverrides?: Record<string, any> | null;
    fontCustomization?: FontCustomization | null;
    showBranding?: boolean;
    outputFilename?: string;
}

/** Python response — same shape as StandingsResponse */
export interface SlotListResponse {
    status: 'success' | 'error';
    request_id?: string | null;
    data?: Record<string, any>;
    metadata?: Record<string, any>;
    error?: { code: string; message: string };
}

/** One row in team_data sent to Python team-list / roster */
export interface TeamListTeamData {
    slot: number;
    team_name: string;
    team_logo_url?: string | null;
}

/** Internal request object (snake_case — matches Python POST /api/v1/team-list/generate) */
export interface TeamListRequest {
    template_url: string;
    template_config_url: string;
    team_data: TeamListTeamData[];
    header_overrides?: Record<string, any> | null;
    header_style?: Record<string, any> | null;
    footer_overrides?: Record<string, any> | null;
    footer_style?: Record<string, any> | null;
    team_logo_size?: number | null;
    team_name_font_size?: number | null;
    team_name_color?: string | null;
    card_overrides?: Record<string, any> | null;
    font_customization?: FontCustomization | null;
    show_branding?: boolean;
    advanced_config?: Record<string, any> | null;
    output_filename?: string;
    options?: PythonImageOptions;
}

/** CamelCase options from Android/controller → mapped in payload builder */
export interface TeamListExportOptions {
    headerOverrides?: Record<string, any> | null;
    headerStyle?: Record<string, any> | null;
    footerOverrides?: Record<string, any> | null;
    footerStyle?: Record<string, any> | null;
    teamLogoSize?: number | null;
    teamNameFontSize?: number | null;
    teamNameColor?: string | null;
    cardOverrides?: Record<string, any> | null;
    fontCustomization?: FontCustomization | null;
    showBranding?: boolean;
    advancedConfig?: Record<string, any> | null;
    outputFilename?: string;
}

export interface TeamListResponse {
    status: 'success' | 'error';
    request_id?: string | null;
    data?: Record<string, any>;
    metadata?: Record<string, any>;
    error?: { code: string; message: string };
}

/** One row in rank_data sent to Python top-10-rankings */
export interface Top10RankData {
    rank: number;
    team_name: string;
    total_points: number;
    team_logo_url?: string | null;
}

/** Internal request object (snake_case — matches Python POST /api/v1/top-10-rankings/generate) */
export interface Top10Request {
    template_url: string;
    template_config_url: string;
    rank_data: Top10RankData[];
    header_overrides?: Record<string, any> | null;
    footer_overrides?: Record<string, any> | null;
    card_overrides?: Record<string, any> | null;
    font_customization?: FontCustomization | null;
    show_branding?: boolean;
    advanced_config?: Record<string, any> | null;
    output_filename?: string;
    options?: PythonImageOptions;
}

/** CamelCase options from Android/controller */
export interface Top10ExportOptions {
    headerOverrides?: Record<string, any> | null;
    footerOverrides?: Record<string, any> | null;
    cardOverrides?: Record<string, any> | null;
    fontCustomization?: FontCustomization | null;
    showBranding?: boolean;
    advancedConfig?: Record<string, any> | null;
    outputFilename?: string;
}

export interface Top10Response {
    status: 'success' | 'error';
    request_id?: string | null;
    data?: Record<string, any>;
    metadata?: Record<string, any>;
    error?: { code: string; message: string };
}
