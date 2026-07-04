import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';
import { extractAccessTokenFromRequest } from '../middleware/auth';
import { authService } from '../services/authService';
import { previewUrlService } from '../services/previewUrlService';
import { storedFileService } from '../services/storedFileService';
import { r2Service } from '../services/cloudflareR2Service';
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

        // Issue a short-lived presigned R2 URL and redirect the client to it.
        // This removes all image-byte traffic from Node.js — the client downloads
        // directly from R2, which frees server sockets and CPU.
        const presignedUrl = await r2Service.getSignedDownloadUrl(file.r2Key, 120);
        res.setHeader('Cache-Control', 'private, max-age=110');
        res.redirect(302, presignedUrl);
    });
}
