import axios from 'axios';
import { BaseService } from './baseService';
import env from '../config/env';
import {
    PythonAIAttendanceResponse,
    PythonAIResultResponse,
    PythonAIExportResponse,
    PythonAIEngineResponse,
    PythonAIHealthResponse
} from '../types/quickResult';

export interface AttendanceDetectionRequest {
    image_url: string;                    // Single image instead of array
    engine?: string;                      // Optional engine selection
    options?: {
        save_variants?: boolean;
        cleanup_temp?: boolean;
        timeout_seconds?: number;
    };
}

export interface ResultExtractionRequest {
    image_url: string;                    // Single image instead of array
    engine?: string;                      // Optional engine selection
    options?: {
        save_variants?: boolean;
        cleanup_temp?: boolean;
        timeout_seconds?: number;
    };
}

// NEW: Engine management interfaces
export interface EngineListRequest {
    // No parameters needed
}

export interface EngineStatusRequest {
    // No parameters needed  
}

export interface PointsTableGenerationRequest {
    match_results: Array<{
        slot_number: number;
        team_name: string;
        position: number;
        total_kills: number;
        position_points: number;
        kill_points: number;
        total_points: number;
    }>;
    match_name: string;
    template?: string;
}

export interface StandingsGenerationRequest {
    template_url: string;            // Template image URL
    template_config_url: string;     // Template config JSON URL
    format_type: string;             // "24_teams", "16_teams" etc.
    output_filename: string;
    fonts?: {
        main_font_name?: string;
        bold_font_name?: string;
    };
    font_customization?: {
        global_size_multiplier?: number;
        override_all_fonts?: boolean;
        default_font_family?: string;
        default_font_weight?: string;
    };
    advanced_config?: {
        header?: {
            event_name?: {
                enabled?: boolean;
                text?: string;
                font?: { size?: number; color?: string; weight?: string; family?: string };
            };
            sponsor_name?: {
                enabled?: boolean;
                text?: string;
                font?: { size?: number; color?: string; weight?: string };
            };
        };
        organiser?: {
            name?: {
                enabled?: boolean;
                text?: string;
                font?: { size?: number; color?: string; weight?: string; family?: string };
            };
        };
        event_details?: {
            week_info?: { enabled?: boolean; text?: string };
            day_info?: { enabled?: boolean; text?: string };
        };
        footer?: {
            live_indicator?: { enabled?: boolean };
        };
    };
    options?: {
        upload_to_r2?: boolean;
    };
    team_data: Array<{
        rank: number;
        slot_number: number;
        team_name: string;
        matches_played: number;
        total_points: number;
        position_points: number;
        finish_points: number;  // renamed from kill_points
        wwcd: number;
    }>;
}

export interface StandingsGenerationResponse {
    status: string;
    request_id: string;
    timestamp: string;
    data: {
        standings_generated: boolean;
        output_filename: string;
        image_url: string;
        format_type: string;
        teams_processed: number;
        template_used: string;
    };
    metadata: {
        processing_time_seconds: number;
        image_dimensions: string;
        template_source: string;
        config_auto_loaded: boolean;
        font_files_used: number;
        total_text_elements: number;
        r2_upload_success: boolean;
        branding_signature: string;
    };
}

export class PythonAIService extends BaseService {
    private axiosInstance: any;
    private apiUrl: string;
    private apiKey: string;
    private timeout: number;
    private maxRetries: number;

    constructor() {
        super();
        this.apiUrl = env.PYTHON_AI_API_URL;
        this.apiKey = env.PYTHON_AI_API_KEY || '';
        this.timeout = env.PYTHON_AI_TIMEOUT;
        this.maxRetries = env.AI_PROCESSING_MAX_RETRIES;

        // Create axios instance with default config
        this.axiosInstance = axios.create({
            baseURL: this.apiUrl,
            timeout: 0,
            headers: {
                'Content-Type': 'application/json',
                ...(this.apiKey && { 'X-API-Key': this.apiKey })
            }
        });

        // Add request interceptor for logging
        this.axiosInstance.interceptors.request.use(
            (config: any) => {
                this.logger.info(`Python AI API Request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error: any) => {
                this.logger.error('Python AI API Request Error:', error);
                return Promise.reject(error);
            }
        );

        // Add response interceptor for logging
        this.axiosInstance.interceptors.response.use(
            (response: any) => {
                this.logger.info(`Python AI API Response: ${response.status} ${response.config.url}`);
                return response;
            },
            (error: any) => {
                this.logger.error('Python AI API Response Error:', {
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    url: error.config?.url,
                    method: error.config?.method?.toUpperCase(),
                    message: error.message,
                    responseData: error.response?.data,
                    responseHeaders: error.response?.headers
                });

                // Additional logging for 500 errors
                if (error.response?.status === 500) {
                    this.logger.error('Python AI 500 Error Details:', {
                        fullError: error.response?.data || error.response || error,
                        requestPayload: error.config?.data ? JSON.parse(error.config.data) : null
                    });
                }

                return Promise.reject(error);
            }
        );
    }

    /**
     * Detect attendance from single screenshot  
     * NEW: Single image processing model
     */
    async detectAttendance(
        screenshotUrl: string,              // Single URL now
        engine?: string                     // Optional engine selection
    ): Promise<PythonAIAttendanceResponse> {
        try {
            const request: AttendanceDetectionRequest = {
                image_url: screenshotUrl,   // New field name
                engine: engine || 'combo_paddle_easy',  // Default engine
                options: {
                    save_variants: false,
                    cleanup_temp: true,
                    timeout_seconds: 300
                }
            };

            this.logger.info(`Processing attendance for screenshot: ${screenshotUrl}`, {
                requestPayload: request,
                apiUrl: this.apiUrl,
                endpoint: '/api/v1/ocr/attendance'
            });

            const response = await this.axiosInstance.post(
                '/api/v1/ocr/attendance',   // NEW endpoint
                request,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        ...(this.apiKey && { 'X-API-Key': this.apiKey }),
                        'Accept': 'application/json'
                    },
                    timeout: 0
                }
            );

            // NEW: Check status field instead of success
            if (response.data.status !== 'success') {
                this.logger.error(`Python AI returned error status:`, {
                    status: response.data.status,
                    response: response.data,
                    url: screenshotUrl
                });
                throw new Error(`Python AI returned error status: ${response.data.status}`);
            }

            this.logger.info(`Attendance detection completed: ${response.data.data.cards.length} cards detected`);
            return response.data;

        } catch (error) {
            this.logger.error(`Python AI attendance detection failed:`, {
                error: (error as any).message,
                response: (error as any).response?.data,
                status: (error as any).response?.status,
                url: screenshotUrl,
                apiUrl: this.apiUrl
            });
            this.handleError(error, 'Detect Attendance');
            throw this.formatError(error);
        }
    }

    /**
     * Detect attendance with retry logic - NEW: Single image processing
     */
    async detectAttendanceWithRetry(
        screenshotUrl: string,              // Single URL now
        engine?: string,                    // Optional engine
        retryCount: number = 0
    ): Promise<PythonAIAttendanceResponse> {
        try {
            return await this.detectAttendance(screenshotUrl, engine);
        } catch (error) {
            if (retryCount < this.maxRetries) {
                this.logger.warn(`Attendance detection failed, retrying... (${retryCount + 1}/${this.maxRetries})`);
                await this.delay(2000 * (retryCount + 1)); // Exponential backoff
                return this.detectAttendanceWithRetry(screenshotUrl, engine, retryCount + 1);
            }
            throw error;
        }
    }

    /**
     * Extract match results from single screenshot
     * NEW: Single image processing model
     */
    async extractResults(
        screenshotUrl: string,              // Single URL now
        engine?: string                     // Optional engine selection
    ): Promise<PythonAIResultResponse> {
        try {
            const request: ResultExtractionRequest = {
                image_url: screenshotUrl,   // New field name
                engine: engine || 'combo_paddle_easy',  // Default engine
                options: {
                    save_variants: false,
                    cleanup_temp: true,
                    timeout_seconds: 300
                }
            };

            this.logger.info(`Extracting results from screenshot: ${screenshotUrl}`);

            const response = await this.axiosInstance.post(
                '/api/v1/ocr/results',      // NEW endpoint
                request
            );

            // NEW: Check status field instead of success
            if (response.data.status !== 'success') {
                throw new Error(`Python AI returned error status: ${response.data.status}`);
            }

            this.logger.info(`Result extraction completed: ${response.data.data.cards.length} teams found`);
            return response.data;

        } catch (error) {
            this.handleError(error, 'Extract Results');
            throw this.formatError(error);
        }
    }

    /**
     * Extract results with retry logic - NEW: Single image processing
     */
    async extractResultsWithRetry(
        screenshotUrl: string,              // Single URL now
        engine?: string,                    // Optional engine
        retryCount: number = 0
    ): Promise<PythonAIResultResponse> {
        try {
            return await this.extractResults(screenshotUrl, engine);
        } catch (error) {
            if (retryCount < this.maxRetries) {
                this.logger.warn(`Result extraction failed, retrying... (${retryCount + 1}/${this.maxRetries})`);
                await this.delay(2000 * (retryCount + 1)); // Exponential backoff
                return this.extractResultsWithRetry(screenshotUrl, engine, retryCount + 1);
            }
            throw error;
        }
    }

    /**
     * Generate points table image/CSV
     */
    async generatePointsTable(
        matchResults: Array<{
            slot_number: number;
            team_name: string;
            position: number;
            total_kills: number;
            position_points: number;
            kill_points: number;
            total_points: number;
        }>,
        matchName: string,
        template: string = 'default'
    ): Promise<PythonAIExportResponse> {
        try {
            const request: PointsTableGenerationRequest = {
                match_results: matchResults,
                match_name: matchName,
                template
            };

            this.logger.info(`Generating points table for ${matchResults.length} teams`);

            const response = await this.axiosInstance.post(
                '/api/v1/export/points-table',
                request
            );

            if (!response.data.success) {
                throw new Error('Python AI returned unsuccessful response for points table generation');
            }

            this.logger.info(`Points table generated successfully`);
            return response.data;

        } catch (error) {
            this.handleError(error, 'Generate Points Table');
            throw this.formatError(error);
        }
    }

    /**
 * Get available OCR engines
 * NEW: Engine management capability
 */
    async getAvailableEngines(): Promise<PythonAIEngineResponse> {
        try {
            this.logger.info('Fetching available OCR engines');

            const response = await this.axiosInstance.get('/api/v1/engines/');

            if (response.data.status !== 'success') {
                throw new Error(`Failed to fetch engines: ${response.data.status}`);
            }

            this.logger.info(`Retrieved ${response.data.data.total_engines} available engines`);
            return response.data;

        } catch (error) {
            this.handleError(error, 'Get Available Engines');
            throw this.formatError(error);
        }
    }

    /**
     * Get engine status details
     * NEW: Engine health monitoring
     */
    async getEngineStatus(): Promise<any> {
        try {
            this.logger.info('Checking engine status');

            const response = await this.axiosInstance.get('/api/v1/engines/status');

            if (response.data.status !== 'success') {
                throw new Error(`Failed to get engine status: ${response.data.status}`);
            }

            this.logger.info('Engine status retrieved successfully');
            return response.data;

        } catch (error) {
            this.handleError(error, 'Get Engine Status');
            throw this.formatError(error);
        }
    }

    /**
     * Health check for Python AI API - UPDATED for new endpoint
     */
    async healthCheck(): Promise<{ healthy: boolean; message: string }> {
        try {
            const response = await this.axiosInstance.get('/api/v1/health', {
                timeout: 5000 // Short timeout for health check
            });

            // NEW: Check for new response structure
            const isHealthy = response.status === 200 && response.data.status === 'healthy';

            return {
                healthy: isHealthy,
                message: isHealthy ? 'Python AI API is healthy' : 'Python AI API health check failed'
            };
        } catch (error) {
            this.logger.warn('Python AI API health check failed:', error);
            return {
                healthy: false,
                message: error instanceof Error ? error.message : 'Health check failed'
            };
        }
    }

    /**
     * Format error for better debugging
     */
    private formatError(error: unknown): Error {
        // Check if it's an axios error by checking for response/request properties
        if (error && typeof error === 'object' && ('response' in error || 'request' in error || 'code' in error)) {
            const axiosError = error as any;

            if (axiosError.code === 'ECONNABORTED') {
                return new Error(`Python AI API timeout after ${this.timeout}ms`);
            }

            if (axiosError.code === 'ECONNREFUSED') {
                return new Error('Python AI API is not reachable. Please check if the service is running.');
            }

            if (axiosError.response) {
                const status = axiosError.response.status;
                const data = axiosError.response.data as any;
                return new Error(
                    `Python AI API error (${status}): ${data?.message || data?.error || 'Unknown error'}`
                );
            }

            return new Error(`Python AI API error: ${axiosError.message}`);
        }

        if (error instanceof Error) {
            return error;
        }

        return new Error('Unknown error occurred while communicating with Python AI API');
    }

    /**
     * Delay helper for retry logic
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }


    /**
     * Get overall API health status
     * NEW: Health monitoring
     */
    async getHealthStatus(): Promise<PythonAIHealthResponse> {
        try {
            this.logger.info('Checking Python AI API health status');

            const response = await this.axiosInstance.get('/api/v1/health', {
                timeout: this.timeout
            });

            this.logger.info(`Health status: ${response.data.status} - ${response.data.message}`);
            return response.data;

        } catch (error: any) {
            this.logger.error('Failed to fetch health status:', error.message);
            this.handleError(error, 'Get Health Status');
            throw error;
        }
    }
    /**
     * Validate Python AI API is available
     */
    async validateConnection(): Promise<void> {
        const health = await this.healthCheck();
        if (!health.healthy) {
            throw new Error(`Python AI API is not available: ${health.message}`);
        }
        this.logger.info('Python AI API connection validated successfully');
    }

    /**
     * Generate attendance crops from screenshot
     */
    async generateAttendanceCrops(
        screenshotUrl: string,
        matchId: string,
        tournamentId?: string,
        metadata?: any
    ): Promise<any> {
        const startTime = Date.now();

        try {
            const endpoint = '/api/v1/crops/attendance';
            const requestPayload = {
                image_url: screenshotUrl,
                match_id: matchId,
                tournament_id: tournamentId || "bgmi_tournament_2024",
                crop_type: "attendance",
                metadata: {
                    week: metadata?.week || 1,
                    day: metadata?.day || 2,
                    session: metadata?.session || "morning",
                    uploaded_by: metadata?.uploaded_by || "api_user"
                }
            };

            this.logger.info(`🎯 Generating attendance crops for: ${screenshotUrl}`);

            const response = await this.axiosInstance.post(endpoint, requestPayload, {
                timeout: this.timeout,
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey
                }
            });

            const processingTime = Date.now() - startTime;
            this.logger.info(`✅ Attendance crops generated in ${processingTime}ms: ${response.data.data?.crops_generated || 0} crops`);

            return response.data;

        } catch (error) {
            const processingTime = Date.now() - startTime;
            this.logger.error(`❌ Attendance crop generation failed after ${processingTime}ms:`, error);
            throw error;
        }
    }

    /**
     * Generate result crops from screenshot
     */
    async generateResultCrops(
        screenshotUrl: string,
        matchId: string,
        tournamentId?: string,
        metadata?: any
    ): Promise<any> {
        const startTime = Date.now();

        try {
            const endpoint = '/api/v1/crops/results';
            const requestPayload = {
                image_url: screenshotUrl,
                match_id: matchId,
                tournament_id: tournamentId || "bgmi_tournament_2024",
                crop_type: "results",
                metadata: {
                    week: metadata?.week || 1,
                    day: metadata?.day || 2,
                    session: metadata?.session || "morning",
                    game_number: metadata?.game_number || 3,
                    uploaded_by: metadata?.uploaded_by || "api_user"
                }
            };

            this.logger.info(`🎯 Generating result crops for: ${screenshotUrl}`);

            const response = await this.axiosInstance.post(endpoint, requestPayload, {
                timeout: this.timeout,
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey
                }
            });

            const processingTime = Date.now() - startTime;
            this.logger.info(`✅ Result crops generated in ${processingTime}ms: ${response.data.data?.crops_generated || 0} crops`);

            return response.data;

        } catch (error) {
            const processingTime = Date.now() - startTime;
            this.logger.error(`❌ Result crop generation failed after ${processingTime}ms:`, error);
            throw error;
        }
    }

    /**
     * Generate standings table image with advanced templating and customization
     */
    async generateStandingsTable(
        templateUrl: string,
        templateConfigUrl: string,
        formatType: string,
        teamData: Array<{
            rank: number;
            slot_number: number;
            team_name: string;
            matches_played: number;
            total_points: number;
            position_points: number;
            finish_points: number;
            wwcd: number;
        }>,
        outputFilename: string = 'standings_auto.png',
        customization?: {
            fonts?: {
                main_font_name?: string;
                bold_font_name?: string;
            };
            font_customization?: {
                global_size_multiplier?: number;
                override_all_fonts?: boolean;
                default_font_family?: string;
                default_font_weight?: string;
            };
            advanced_config?: {
                header?: {
                    event_name?: {
                        enabled?: boolean;
                        text?: string;
                        font?: { size?: number; color?: string; weight?: string; family?: string };
                    };
                    sponsor_name?: {
                        enabled?: boolean;
                        text?: string;
                        font?: { size?: number; color?: string; weight?: string };
                    };
                };
                organiser?: {
                    name?: {
                        enabled?: boolean;
                        text?: string;
                        font?: { size?: number; color?: string; weight?: string; family?: string };
                    };
                };
                event_details?: {
                    week_info?: { enabled?: boolean; text?: string };
                    day_info?: { enabled?: boolean; text?: string };
                };
                footer?: {
                    live_indicator?: { enabled?: boolean };
                };
            };
        }
    ): Promise<StandingsGenerationResponse> {
        const startTime = Date.now();
        
        try {
            const requestPayload: StandingsGenerationRequest = {
                template_url: templateUrl,
                template_config_url: templateConfigUrl,
                format_type: formatType,
                output_filename: outputFilename,
                fonts: customization?.fonts || {
                    main_font_name: "Inter_24pt-Regular.ttf",
                    bold_font_name: "Inter_24pt-Bold.ttf"
                },
                font_customization: customization?.font_customization || {
                    global_size_multiplier: 1.0,
                    override_all_fonts: false,
                    default_font_family: "Inter",
                    default_font_weight: "regular"
                },
                advanced_config: customization?.advanced_config || {
                    header: {
                        event_name: {
                            enabled: true,
                            text: "BGMI Tournament",
                            font: { size: 64, color: "#FFFFFF", weight: "bold", family: "Montserrat" }
                        },
                        sponsor_name: {
                            enabled: true,
                            text: "Powered by SCRYMZ",
                            font: { size: 40, color: "#CCCCCC", weight: "regular" }
                        }
                    },
                    organiser: {
                        name: {
                            enabled: true,
                            text: "Tournament Organizer",
                            font: { size: 52, color: "#FFFFFF", weight: "bold", family: "Oswald" }
                        }
                    },
                    event_details: {
                        week_info: { enabled: true, text: "Week 1" },
                        day_info: { enabled: true, text: "Day 1" }
                    },
                    footer: {
                        live_indicator: { enabled: false }
                    }
                },
                options: {
                    upload_to_r2: true
                },
                team_data: teamData
            };

            this.logger.info(`🏆 Generating enhanced standings for ${teamData.length} teams with template: ${templateUrl}`);

            const response = await this.axiosInstance.post('/api/v1/standings/generate', requestPayload, {
                timeout: this.timeout,
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey
                }
            });

            const processingTime = Date.now() - startTime;
            this.logger.info(`✅ Enhanced standings generated in ${processingTime}ms: ${response.data.data.output_filename}`);

            return response.data;

        } catch (error) {
            const processingTime = Date.now() - startTime;
            this.logger.error(`❌ Enhanced standings generation failed after ${processingTime}ms:`, error);
            throw error;
        }
    }

    /**
     * Get API configuration
     */
    getConfig(): {
        apiUrl: string;
        timeout: number;
        maxRetries: number;
        hasApiKey: boolean;
    } {
        return {
            apiUrl: this.apiUrl,
            timeout: this.timeout,
            maxRetries: this.maxRetries,
            hasApiKey: !!this.apiKey
        };
    }
}

export const pythonAIService = new PythonAIService();