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
            timeout: this.timeout,
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
                    url: error.config?.url,
                    message: error.message
                });
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

            this.logger.info(`Processing attendance for screenshot: ${screenshotUrl}`);

            const response = await this.axiosInstance.post(
                '/api/v1/ocr/attendance',   // NEW endpoint
                request
            );

            // NEW: Check status field instead of success
            if (response.data.status !== 'success') {
                throw new Error(`Python AI returned error status: ${response.data.status}`);
            }

            this.logger.info(`Attendance detection completed: ${response.data.data.cards.length} cards detected`);
            return response.data;

        } catch (error) {
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