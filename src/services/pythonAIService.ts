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
    SlotListResponse,
    TeamListRequest,
    TeamListResponse,
    Top10Request,
    Top10Response,
    FontsListResponse,
} from '../types/pythonAI';
import { buildPythonStandingsPayload } from '../utils/standingsPayloadBuilder';
import { buildPythonSlotListPayload } from '../utils/slotListPayloadBuilder';
import { buildPythonTeamListPayload } from '../utils/teamListPayloadBuilder';
import { buildPythonTop10Payload } from '../utils/top10PayloadBuilder';
import { extractPythonErrorDetail } from '../utils/pythonErrorUtils';
import { ServiceError } from '../utils/serviceError';
import { omitEmptyFields } from '../utils/r2UrlUtils';


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
            const body = omitEmptyFields({
                image_urls: request.image_urls,
                folder_path: request.folder_path,
                match_id: request.match_id,
                tournament_id: request.tournament_id,
                metadata: request.metadata,
                cleanup_temp: request.cleanup_temp ?? true,
            });
            logger.debug('Python attendance crops payload', {
                folder_path: body.folder_path,
                match_id: body.match_id,
                image_count: body.image_urls?.length ?? 0,
            });
            const { data } = await this.client.post<CropUploadResponse>(
                '/api/v1/crops/attendance',
                body
            );
            return data;
        } catch (err: any) {
            this.throwPythonServiceError(err, 'Attendance crop upload failed');
        }
    }

    async uploadResultCrops(request: CropUploadRequest): Promise<CropUploadResponse> {
        try {
            const body = omitEmptyFields({
                image_urls: request.image_urls,
                folder_path: request.folder_path,
                match_id: request.match_id,
                tournament_id: request.tournament_id,
                metadata: request.metadata,
                cleanup_temp: request.cleanup_temp ?? true,
            });
            logger.debug('Python result crops payload', {
                folder_path: body.folder_path,
                match_id: body.match_id,
                image_count: body.image_urls?.length ?? 0,
            });
            const { data } = await this.client.post<CropUploadResponse>(
                '/api/v1/crops/results',
                body
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

    /**
     * Generate slot-list PNG via Python AI.
     * Payload shape must match POST /api/v1/slot-list/generate exactly.
     */
    async generateSlotList(request: SlotListRequest): Promise<SlotListResponse> {
        const body = buildPythonSlotListPayload(request);

        logger.debug('Python slot-list generate payload', {
            template_url: body.template_url,
            template_config_url: body.template_config_url,
            slot_count: Array.isArray(body.slot_data) ? body.slot_data.length : 0,
            team_logo_size: body.team_logo_size,
        });

        try {
            const { data } = await this.client.post<SlotListResponse>(
                '/api/v1/slot-list/generate',
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
                `Slot list generation failed: ${detail}`,
                err.response.status >= 500 ? 502 : 400,
                'PYTHON_AI_ERROR'
            );
        }
    }

    /**
     * Generate team roster PNG via Python AI.
     * Payload shape must match POST /api/v1/team-list/generate exactly.
     */
    async generateTeamList(request: TeamListRequest): Promise<TeamListResponse> {
        const body = buildPythonTeamListPayload(request);

        logger.debug('Python team-list generate payload', {
            template_url: body.template_url,
            template_config_url: body.template_config_url,
            team_count: Array.isArray(body.team_data) ? body.team_data.length : 0,
            team_logo_size: body.team_logo_size,
        });

        try {
            const { data } = await this.client.post<TeamListResponse>(
                '/api/v1/team-list/generate',
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
                `Team roster generation failed: ${detail}`,
                err.response.status >= 500 ? 502 : 400,
                'PYTHON_AI_ERROR'
            );
        }
    }

    /**
     * Generate top-10 rankings PNG via Python AI.
     * Payload shape must match POST /api/v1/top-10-rankings/generate exactly.
     */
    async generateTop10Rankings(request: Top10Request): Promise<Top10Response> {
        const body = buildPythonTop10Payload(request);

        logger.debug('Python top-10-rankings generate payload', {
            template_url: body.template_url,
            template_config_url: body.template_config_url,
            rank_count: Array.isArray(body.rank_data) ? body.rank_data.length : 0,
        });

        try {
            const { data } = await this.client.post<Top10Response>(
                '/api/v1/top-10-rankings/generate',
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
                `Top 10 rankings generation failed: ${detail}`,
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
}

export const pythonAIService = new PythonAIService();
