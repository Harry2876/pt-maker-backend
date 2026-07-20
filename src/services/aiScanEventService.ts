import { OcrScanType } from '@prisma/client';
import { BaseService } from './baseService';

export interface LogAiScanEventInput {
    userId: string;
    quickMatchId: string;
    scanType: OcrScanType;
    imageCount: number;
    imagesProcessed?: number;
    success: boolean;
    processingTimeMs?: number;
    errorMessage?: string;
}

export class AiScanEventService extends BaseService {
    /**
     * Persists one OCR batch invocation. Failures here are logged but never thrown
     * so scan processing is never blocked by analytics writes.
     */
    async logScanEvent(input: LogAiScanEventInput): Promise<void> {
        try {
            await this.db.aiScanEvent.create({
                data: {
                    userId: input.userId,
                    quickMatchId: input.quickMatchId,
                    scanType: input.scanType,
                    imageCount: input.imageCount,
                    imagesProcessed: input.imagesProcessed ?? 0,
                    success: input.success,
                    processingTimeMs: input.processingTimeMs ?? null,
                    errorMessage: input.errorMessage ?? null,
                },
            });
        } catch (error) {
            this.logger.error('Failed to log AI scan event (non-fatal):', error);
        }
    }
}

export const aiScanEventService = new AiScanEventService();
