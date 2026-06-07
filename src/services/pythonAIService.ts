import axios from 'axios';
import logger from '../utils/logger';
import { env } from '../config/env';
import {
    ScoreboardResponse,
    CropUploadRequest,
    CropUploadResponse,
    StandingsRequest,
    StandingsResponse,
} from '../types/pythonAI';

export class PythonAIService {
    private readonly client: ReturnType<typeof axios.create>;

    constructor() {
        this.client = axios.create({
            baseURL: env.PYTHON_AI_BASE_URL,
            timeout: 300_000, // 5 min — OCR + image gen can be slow
            headers: { 'Content-Type': 'application/json' },
        });

        this.client.interceptors.response.use(
            (res) => res,
            (err: any) => {
                const status = err.response?.status;
                const detail = err.response?.data?.detail ?? err.message;
                logger.warn(`Python AI API error [${status}]: ${JSON.stringify(detail)}`, {
                    url: err.config?.url,
                    method: err.config?.method,
                });
                return Promise.reject(err);
            }
        );
    }

    /**
     * Process a single BGMI scoreboard screenshot.
     * Works for both attendance (expanded_layout) and result (compact_layout) images.
     */
    async processScoreboard(imageUrl: string): Promise<ScoreboardResponse> {
        const { data } = await this.client.post<ScoreboardResponse>(
            '/api/v1/ocr/scoreboard',
            { image_url: imageUrl, cleanup_temp: true }
        );
        return data;
    }

    /**
     * Process a batch of BGMI scoreboard screenshots from the SAME match.
     * - Attendance: up to 3 images → returns expanded_layout (slot_number per team)
     * - Results: up to 8-9 images → returns compact_layout (team_rank per team)
     */
    async processScoreboardBatch(imageUrls: string[]): Promise<ScoreboardResponse> {
        const { data } = await this.client.post<ScoreboardResponse>(
            '/api/v1/ocr/scoreboard/batch',
            { image_urls: imageUrls, cleanup_temp: true }
        );
        return data;
    }

    /**
     * Extract attendance team-block crops from screenshots and upload them to R2.
     * Uploads to pt-maker-screenshots/crops/attendance/{folder_path}
     */
    async uploadAttendanceCrops(request: CropUploadRequest): Promise<CropUploadResponse> {
        const { data } = await this.client.post<CropUploadResponse>(
            '/api/v1/ocr/crops/attendance',
            request
        );
        return data;
    }

    /**
     * Extract result team-block crops from screenshots and upload them to R2.
     * Uploads to pt-maker-screenshots/crops/results/{folder_path}
     */
    async uploadResultCrops(request: CropUploadRequest): Promise<CropUploadResponse> {
        const { data } = await this.client.post<CropUploadResponse>(
            '/api/v1/ocr/crops/results',
            request
        );
        return data;
    }

    /**
     * Generate tournament standings image using a template and upload to R2.
     */
    async generateStandings(request: StandingsRequest): Promise<StandingsResponse> {
        const { data } = await this.client.post<StandingsResponse>(
            '/api/v1/standings/generate',
            request
        );
        return data;
    }

    /**
     * Get supported tournament format types from Python AI.
     */
    async getSupportedFormats(): Promise<any> {
        const { data } = await this.client.get('/api/v1/standings/formats');
        return data;
    }
}

export const pythonAIService = new PythonAIService();
