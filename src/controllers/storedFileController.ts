import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';
import { extractAccessTokenFromRequest } from '../middleware/auth';
import { authService } from '../services/authService';
import { previewUrlService } from '../services/previewUrlService';
import { storedFileService } from '../services/storedFileService';
import { ServiceError } from '../utils/serviceError';
import { StoredFileRecord } from '../types/mediaAsset';

function queryParam(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value;
    }
    if (Array.isArray(value) && typeof value[0] === 'string') {
        return value[0];
    }
    return undefined;
}

export class StoredFileController {

    /** GET /api/v1/quick-pt/files/:fileId?exp=&sig= */
    static streamFile = asyncHandler(async (req: Request, res: Response) => {
        const fileId = decodeURIComponent(req.params.fileId).trim();
        const expRaw = queryParam(req.query.exp);
        const sigRaw = queryParam(req.query.sig);
        const hasSigAuth = !!expRaw && !!sigRaw?.trim();

        let file: StoredFileRecord;

        if (hasSigAuth) {
            previewUrlService.verify({
                fileId,
                exp: expRaw!,
                sig: sigRaw!.trim(),
            });
            file = await storedFileService.getReadableBySignature(fileId);
        } else {
            const token = extractAccessTokenFromRequest(req);
            if (!token) {
                throw new ServiceError(
                    'Preview signature or authorization required',
                    401,
                    'UNAUTHORIZED',
                );
            }

            const sessionData = await authService.verifySessionToken(token);
            const user = await authService.getUserByPhone(sessionData.phoneNumber);
            if (!user) {
                throw new ServiceError('Invalid or expired token', 401, 'UNAUTHORIZED');
            }

            file = await storedFileService.assertReadable(fileId, user.id);
        }

        const { stream, contentType, filename } = await storedFileService.streamFileRecord(file);

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Cache-Control', 'private, max-age=300');

        stream.on('error', () => {
            if (!res.headersSent) {
                res.status(502).json(
                    ResponseHelper.error('Failed to stream file', 'STREAM_ERROR'),
                );
            }
        });

        stream.pipe(res);
    });
}
