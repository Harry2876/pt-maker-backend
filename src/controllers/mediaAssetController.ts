import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';
import { mediaAssetService } from '../services/mediaAssetService';
import { quickMatchService } from '../services/quickMatchService';
import { QuickMediaAssetType } from '../types/mediaAsset';
import { extractAccessTokenFromRequest } from '../middleware/auth';
import { withMediaPreviewAuth } from '../utils/mediaPreviewUrl';

export class MediaAssetController {

    /** GET /api/v1/quick-pt/media/:assetId — stream PNG (auth required) */
    static streamMedia = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { assetId } = req.params;

        const { stream, contentType, filename } = await mediaAssetService.streamOwnedAsset(assetId, userId);

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/"/g, '')}"`);
        res.setHeader('Cache-Control', 'private, max-age=3600');

        stream.on('error', () => {
            if (!res.headersSent) {
                res.status(502).json(ResponseHelper.error('Failed to stream media', 'STREAM_ERROR'));
            }
        });

        stream.pipe(res);
    });

    /** GET /api/v1/quick-pt/matches/:id/media — export history for a match */
    static listMatchMedia = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { id: quickMatchId } = req.params;
        const { type } = req.query;

        const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
        if (!quickMatch) {
            return res.status(404).json(ResponseHelper.notFound('Quick Match not found'));
        }

        const assetType = type
            ? (String(type).toUpperCase() as QuickMediaAssetType)
            : undefined;

        const items = await mediaAssetService.listMatchMedia(quickMatchId, userId, assetType);

        return res.json(ResponseHelper.success('Match media history retrieved', {
            items: withMediaPreviewAuth(items, extractAccessTokenFromRequest(req)),
            count: items.length,
        }));
    });
}
