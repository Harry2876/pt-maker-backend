import crypto from 'crypto';
import { BaseService } from './baseService';
import { env } from '../config/env';
import { ServiceError } from '../utils/serviceError';
import {
    PreviewUrlIssueOptions,
    PreviewUrlResult,
    PreviewUrlVerifyInput,
} from '../types/previewUrl';


export const PREVIEW_FILES_PATH_PREFIX = '/api/v1/quick-pt/files';

export class PreviewUrlService extends BaseService {
    /** Default for exports, graphics, crops, logos, templates */
    static readonly DEFAULT_EXPIRY_MINUTES = 30;
    /** Screenshots — matches unifiedScreenshotService SCREENSHOT_PREVIEW_EXPIRY_MINUTES */
    static readonly SCREENSHOT_EXPIRY_MINUTES = 5;
    static readonly EXPIRY_CONFIGS = {
        SHORT: PreviewUrlService.SCREENSHOT_EXPIRY_MINUTES * 60,
        MEDIUM: PreviewUrlService.DEFAULT_EXPIRY_MINUTES * 60,
    } as const;

    /**
     * Issue a signed preview URL for a given file ID
     * Does not hit DB - cryptographic signing only 
     */
    issue(fileId: string, options: PreviewUrlIssueOptions = {}): PreviewUrlResult {
        const trimmedId = fileId.trim();
        if (!trimmedId) {
            throw new ServiceError('File ID is required', 400, 'INVALID_REQUEST');
        }

        const secret = env.PREVIEW_URL_SECRET;
        if (!secret || secret.length < 32) {
            throw new ServiceError(
                'Preview URL signing is not configured. Please set PREVIEW_URL_SECRET in environment variables.',
                500,
                'PREVIEW_URL_SECRET_MISSING',
            )
        }

        const expiryMinutes = options.expiryMinutes ?? PreviewUrlService.DEFAULT_EXPIRY_MINUTES;
        const expirySeconds = expiryMinutes * 60;
        const expUnix = Math.floor(Date.now() / 1000) + expirySeconds;
        const sig = this.computeSignature(trimmedId, expUnix, secret);
        const previewUrl = this.buildSignedUrl(trimmedId, expUnix, sig);
        const expiresAt = new Date(expUnix * 1000).toISOString();
        this.logger.debug(`Issued preview URL for fileId=${trimmedId}, exp=${expUnix}`);
        return {
            fileId: trimmedId,
            previewUrl,
            expiresAt,
            previewUrlExpiresInSeconds: expirySeconds,
        };
    }
    /**
     * Verify exp + sig from query string.
     * Throws ServiceError 401 on failure (for Step 3 stream handler).
     */
    verify(input: PreviewUrlVerifyInput): void {
        const fileId = input.fileId?.trim();
        if (!fileId) {
            throw new ServiceError('fileId is required', 401, 'PREVIEW_URL_INVALID');
        }
        const secret = env.PREVIEW_URL_SECRET;
        if (!secret || secret.length < 32) {
            throw new ServiceError(
                'Preview URL signing is not configured',
                500,
                'PREVIEW_URL_SECRET_MISSING',
            );
        }
        const expUnix = this.parseExpUnix(input.exp);
        const nowUnix = Math.floor(Date.now() / 1000);
        if (expUnix <= nowUnix) {
            throw new ServiceError('Preview link has expired', 401, 'PREVIEW_URL_EXPIRED');
        }
        const providedSig = (input.sig ?? '').trim().toLowerCase();
        if (!providedSig) {
            throw new ServiceError('Missing preview signature', 401, 'PREVIEW_URL_INVALID');
        }
        const expectedSig = this.computeSignature(fileId, expUnix, secret);
        if (!this.signaturesMatch(expectedSig, providedSig)) {
            throw new ServiceError('Invalid preview signature', 401, 'PREVIEW_URL_INVALID');
        }
    }
    /** Path only: /api/v1/quick-pt/files/{fileId} */
    buildPreviewPath(fileId: string): string {
        return `${PREVIEW_FILES_PATH_PREFIX}/${encodeURIComponent(fileId.trim())}`;
    }
    /** Absolute base URL for preview links (Android loads this directly) */
    buildAbsolutePreviewBaseUrl(): string {
        const domain = env.PRODUCTION_DOMAIN?.trim();
        if (!domain) {
            return '';
        }
        return this.normalizeProductionOrigin(domain);
    }
    // ─── private helpers ───
    private computeSignature(fileId: string, expUnix: number, secret: string): string {
        // LOCKED FORMAT — changing this invalidates all Android cached URLs
        const message = `${fileId}:${expUnix}`;
        return crypto.createHmac('sha256', secret).update(message).digest('hex');
    }
    private buildSignedUrl(fileId: string, expUnix: number, sig: string): string {
        const path = this.buildPreviewPath(fileId);
        const query = `exp=${expUnix}&sig=${sig}`;
        const origin = this.buildAbsolutePreviewBaseUrl();
        if (origin) {
            return `${origin}${path}?${query}`;
        }
        // Fallback for local dev without PRODUCTION_DOMAIN
        return `${path}?${query}`;
    }
    private normalizeProductionOrigin(domain: string): string {
        const trimmed = domain.trim().replace(/\/+$/, '');
        if (/^https?:\/\//i.test(trimmed)) {
            return trimmed;
        }
        return `https://${trimmed}`;
    }
    private parseExpUnix(exp: string | number): number {
        const n = typeof exp === 'number' ? exp : parseInt(String(exp).trim(), 10);
        if (!Number.isFinite(n) || n <= 0) {
            throw new ServiceError('Invalid preview expiry', 401, 'PREVIEW_URL_INVALID');
        }
        return n;
    }
    private signaturesMatch(expectedHex: string, providedHex: string): boolean {
        try {
            const a = Buffer.from(expectedHex, 'hex');
            const b = Buffer.from(providedHex, 'hex');
            if (a.length !== b.length) {
                return false;
            }
            return crypto.timingSafeEqual(a, b);
        } catch {
            return false;
        }
    }
    /** Same helper as signedUrlUtility — reuse for consistency */
    static calculateExpiryTimestamp(minutes: number): Date {
        return new Date(Date.now() + minutes * 60 * 1000);
    }
    static isExpired(expiresAt: Date | string): boolean {
        try {
            const expiryDate = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
            return expiryDate < new Date();
        } catch {
            return true;
        }
    }
}
export const previewUrlService = new PreviewUrlService();