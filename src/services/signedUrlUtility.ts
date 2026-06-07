import { BaseService } from './baseService';
import { r2Service } from './cloudflareR2Service';

export interface SignedUrlConfig {
    expiryMinutes?: number;
    includeMetadata?: boolean;
}

export interface SignedUrlResponse {
    signedUrl: string;
    expiresAt: Date;
    expirySeconds: number;
}

export interface SignedUrlWithMetadata extends SignedUrlResponse {
    originalKey: string;
    createdAt: string;
}

export class SignedUrlUtility extends BaseService {
    // Standard expiry configurations
    static readonly EXPIRY_CONFIGS = {
        SHORT: 30 * 60,      // 30 minutes (crops, exports)
        MEDIUM: 60 * 60,     // 1 hour (default R2)
        LONG: 24 * 60 * 60,  // 24 hours (special cases)
    } as const;

    // Default expiry for backward compatibility
    private readonly DEFAULT_EXPIRY_MINUTES = 30;

    /**
     * Generate signed URL with standardized response
     */
    async generateSignedUrl(
        r2Key: string, 
        config: SignedUrlConfig = {}
    ): Promise<SignedUrlResponse> {
        try {
            const expiryMinutes = config.expiryMinutes || this.DEFAULT_EXPIRY_MINUTES;
            const expirySeconds = expiryMinutes * 60;
            
            const signedUrl = await r2Service.getSignedDownloadUrl(r2Key, expirySeconds);
            const expiresAt = SignedUrlUtility.calculateExpiryTimestamp(expiryMinutes);

            this.logger.debug(`Generated signed URL for ${r2Key} with ${expiryMinutes}min expiry`);

            return {
                signedUrl,
                expiresAt,
                expirySeconds
            };
        } catch (error) {
            this.logger.error(`Failed to generate signed URL for ${r2Key}:`, error);
            throw new Error(`Signed URL generation failed: ${error}`);
        }
    }

    /**
     * Generate signed URL with additional metadata
     */
    async generateSignedUrlWithMetadata(
        r2Key: string, 
        config: SignedUrlConfig = {}
    ): Promise<SignedUrlWithMetadata> {
        try {
            const baseResult = await this.generateSignedUrl(r2Key, config);
            
            return {
                ...baseResult,
                originalKey: r2Key,
                createdAt: new Date().toISOString()
            };
        } catch (error) {
            this.logger.error(`Failed to generate signed URL with metadata for ${r2Key}:`, error);
            throw error;
        }
    }

    /**
     * Generate multiple signed URLs in batch
     */
    async generateBatchSignedUrls(
        r2Keys: string[],
        config: SignedUrlConfig = {}
    ): Promise<SignedUrlResponse[]> {
        try {
            const results = await Promise.all(
                r2Keys.map(key => this.generateSignedUrl(key, config))
            );
            
            this.logger.info(`Generated ${results.length} signed URLs in batch`);
            return results;
        } catch (error) {
            this.logger.error('Batch signed URL generation failed:', error);
            throw new Error(`Batch URL generation failed: ${error}`);
        }
    }

    /**
     * Calculate expiry timestamp from minutes
     */
    static calculateExpiryTimestamp(minutes: number): Date {
        return new Date(Date.now() + minutes * 60 * 1000);
    }

    /**
     * Check if a generated timestamp has expired
     */
    static isExpired(expiresAt: Date | string): boolean {
        try {
            const expiryDate = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
            return expiryDate < new Date();
        } catch (error) {
            return true; // Assume expired if timestamp is invalid
        }
    }

    /**
     * Get standard expiry configurations
     */
    static getStandardExpiryMinutes(type: 'SHORT' | 'MEDIUM' | 'LONG'): number {
        return SignedUrlUtility.EXPIRY_CONFIGS[type] / 60;
    }
}

export const signedUrlUtility = new SignedUrlUtility();