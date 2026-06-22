import axios from 'axios';
import logger from '../utils/logger';
import { env } from '../config/env';
import {
    ScoreboardResponse,
    CropUploadRequest,
    CropUploadResponse,
    StandingsRequest,
    StandingsResponse,
    SlotListRequest,
    TeamListRequest,
    Top10Request,
    GraphicsResponse,
    FontsListResponse,
} from '../types/pythonAI';
import { buildPythonStandingsPayload } from '../utils/standingsPayloadBuilder';
import { extractPythonErrorDetail } from '../utils/pythonErrorUtils';
import { ServiceError } from '../utils/serviceError';

export class PythonAIService {
    private readonly client: ReturnType<typeof axios.create>;

    constructor() {
        this.client = axios.create({
            baseURL: env.PYTHON_AI_BASE_URL,
            timeout: 300_000,
            headers: { 'Content-Type': 'application/json' },
        });

        this.client.interceptors.response.use(
            (res) => res,
            (err: any) => {
                const status = err.response?.status;
                const detail = extractPythonErrorDetail(err);

                logger.warn(`Python AI API error [${status ?? 'NETWORK'}]: ${detail}`, {
                    url: err.config?.url,
                    baseURL: err.config?.baseURL ?? env.PYTHON_AI_BASE_URL,
                    method: err.config?.method,
                    responseBody: err.response?.data,
                });
                return Promise.reject(err);
            }
        );
    }

    /**
     * Process a single BGMI scoreboard screenshot.
     * @param imageRef Full raw R2 HTTPS URL or object key — Python reads from R2 directly.
     */
    async processScoreboard(imageRef: string): Promise<ScoreboardResponse> {
        try {
            const { data } = await this.client.post<ScoreboardResponse>(
                '/api/v1/ocr/scoreboard',
                { image_url: imageRef, cleanup_temp: true }
            );
            return data;
        } catch (err: any) {
            this.throwPythonServiceError(err, 'Scoreboard OCR failed');
        }
    }

    /**
     * Process a batch of BGMI scoreboard screenshots from the SAME match.
     * @param imageRefs Full raw R2 HTTPS URLs (preferred) or object keys
     */
    async processScoreboardBatch(imageRefs: string[]): Promise<ScoreboardResponse> {
        try {
            const { data } = await this.client.post<ScoreboardResponse>(
                '/api/v1/ocr/scoreboard/batch',
                { image_urls: imageRefs, cleanup_temp: true }
            );
            return data;
        } catch (err: any) {
            if (!err.response) {
                throw new ServiceError(
                    `Python AI service unreachable at ${env.PYTHON_AI_BASE_URL}. Ensure bgmi-ocr-api is running.`,
                    503,
                    'PYTHON_AI_UNAVAILABLE'
                );
            }
            this.throwPythonServiceError(err, 'Scoreboard batch OCR failed');
        }
    }

    async uploadAttendanceCrops(request: CropUploadRequest): Promise<CropUploadResponse> {
        try {
            const { data } = await this.client.post<CropUploadResponse>(
                '/api/v1/ocr/crops/attendance',
                request
            );
            return data;
        } catch (err: any) {
            this.throwPythonServiceError(err, 'Attendance crop upload failed');
        }
    }

    async uploadResultCrops(request: CropUploadRequest): Promise<CropUploadResponse> {
        try {
            const { data } = await this.client.post<CropUploadResponse>(
                '/api/v1/ocr/crops/results',
                request
            );
            return data;
        } catch (err: any) {
            this.throwPythonServiceError(err, 'Result crop upload failed');
        }
    }

    /**
     * Generate tournament standings PNG via Python AI.
     * Payload shape must match POST /api/v1/standings/generate exactly.
     */
    async generateStandings(request: StandingsRequest): Promise<StandingsResponse> {
        const body = buildPythonStandingsPayload(request);

        logger.debug('Python standings generate payload', {
            format_type: body.format_type,
            template_url: body.template_url,
            template_config_url: body.template_config_url,
            team_count: Array.isArray(body.team_data) ? body.team_data.length : 0,
        });

        try {
            const { data } = await this.client.post<StandingsResponse>(
                '/api/v1/standings/generate',
                body
            );
            return data;
        } catch (err: any) {
            if (!err.response) {
                throw new ServiceError(
                    `Python AI service unreachable at ${env.PYTHON_AI_BASE_URL}. Ensure bgmi-ocr-api is running.`,
                    503,
                    'PYTHON_AI_UNAVAILABLE'
                );
            }
            const detail = extractPythonErrorDetail(err);
            throw new ServiceError(
                `Standings generation failed: ${detail}`,
                err.response.status >= 500 ? 502 : 400,
                'PYTHON_AI_ERROR'
            );
        }
    }

    private throwPythonServiceError(err: any, prefix: string): never {
        if (!err.response) {
            throw new ServiceError(
                `Python AI service unreachable at ${env.PYTHON_AI_BASE_URL}. Ensure bgmi-ocr-api is running.`,
                503,
                'PYTHON_AI_UNAVAILABLE'
            );
        }
        const detail = extractPythonErrorDetail(err);
        throw new ServiceError(
            `${prefix}: ${detail}`,
            err.response.status >= 500 ? 502 : 400,
            'PYTHON_AI_ERROR'
        );
    }

    async getSupportedFormats(): Promise<any> {
        const { data } = await this.client.get('/api/v1/standings/formats');
        return data;
    }

    /** GET /api/v1/fonts/list */
    async getFontsList(): Promise<FontsListResponse> {
        try {
            const { data } = await this.client.get<FontsListResponse>('/api/v1/fonts/list');
            return data;
        } catch (err: any) {
            this.throwPythonServiceError(err, 'Fonts list failed');
        }
    }

    /** POST /api/v1/slot-list/generate */
    async generateSlotList(request: SlotListRequest): Promise<GraphicsResponse> {
        logger.debug('Python slot-list generate payload', {
            template_url: request.template_url,
            template_config_url: request.template_config_url,
            slot_count: Array.isArray(request.slot_data) ? request.slot_data.length : 0,
            has_header_overrides: request.header_overrides !== null && request.header_overrides !== undefined,
            has_grid_overrides: request.grid_overrides !== null && request.grid_overrides !== undefined,
            has_font_customization: request.font_customization !== null && request.font_customization !== undefined,
            output_filename: request.output_filename,
            options: request.options,
        });

        try {
            const { data } = await this.client.post<GraphicsResponse>(
                '/api/v1/slot-list/generate',
                request
            );
            return data;
        } catch (err: any) {
            if (!err.response) {
                throw new ServiceError(
                    `Python AI service unreachable at ${env.PYTHON_AI_BASE_URL}. Ensure bgmi-ocr-api is running.`,
                    503,
                    'PYTHON_AI_UNAVAILABLE'
                );
            }
            const detail = extractPythonErrorDetail(err);
            throw new ServiceError(
                `Slot list generation failed: ${detail}`,
                err.response.status >= 500 ? 502 : 400,
                'PYTHON_AI_ERROR'
            );
        }
    }

    /** POST /api/v1/team-list/generate (Roster) */
    async generateTeamList(request: TeamListRequest): Promise<GraphicsResponse> {
        logger.debug('Python team-list generate payload', {
            template_url: request.template_url,
            template_config_url: request.template_config_url,
            team_count: Array.isArray(request.team_data) ? request.team_data.length : 0,
            has_header_overrides: request.header_overrides !== null && request.header_overrides !== undefined,
            has_card_overrides: request.card_overrides !== null && request.card_overrides !== undefined,
            has_font_customization: request.font_customization !== null && request.font_customization !== undefined,
            output_filename: request.output_filename,
            options: request.options,
        });

        try {
            const { data } = await this.client.post<GraphicsResponse>(
                '/api/v1/team-list/generate',
                request
            );
            return data;
        } catch (err: any) {
            if (!err.response) {
                throw new ServiceError(
                    `Python AI service unreachable at ${env.PYTHON_AI_BASE_URL}. Ensure bgmi-ocr-api is running.`,
                    503,
                    'PYTHON_AI_UNAVAILABLE'
                );
            }
            const detail = extractPythonErrorDetail(err);
            throw new ServiceError(
                `Team roster generation failed: ${detail}`,
                err.response.status >= 500 ? 502 : 400,
                'PYTHON_AI_ERROR'
            );
        }
    }

    /** POST /api/v1/top-10-rankings/generate */
    async generateTop10Rankings(request: Top10Request): Promise<GraphicsResponse> {
        logger.debug('Python top-10-rankings generate payload', {
            template_url: request.template_url,
            template_config_url: request.template_config_url,
            rank_count: Array.isArray(request.rank_data) ? request.rank_data.length : 0,
            has_header_overrides: request.header_overrides !== null && request.header_overrides !== undefined,
            has_card_overrides: request.card_overrides !== null && request.card_overrides !== undefined,
            has_font_customization: request.font_customization !== null && request.font_customization !== undefined,
            output_filename: request.output_filename,
            options: request.options,
        });

        try {
            const { data } = await this.client.post<GraphicsResponse>(
                '/api/v1/top-10-rankings/generate',
                request
            );
            return data;
        } catch (err: any) {
            if (!err.response) {
                throw new ServiceError(
                    `Python AI service unreachable at ${env.PYTHON_AI_BASE_URL}. Ensure bgmi-ocr-api is running.`,
                    503,
                    'PYTHON_AI_UNAVAILABLE'
                );
            }
            const detail = extractPythonErrorDetail(err);
            throw new ServiceError(
                `Top 10 rankings generation failed: ${detail}`,
                err.response.status >= 500 ? 502 : 400,
                'PYTHON_AI_ERROR'
            );
        }
    }
}

export const pythonAIService = new PythonAIService();
