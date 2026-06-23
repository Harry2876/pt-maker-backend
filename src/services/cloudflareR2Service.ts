import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import { BaseService } from "./baseService";
import crypto from 'crypto';

export class CloudflareR2Service extends BaseService {
    private s3Client: S3Client;
    private bucketName: string;
    private publicUrl: string;

    constructor() {
        super();
        this.bucketName = process.env.R2_BUCKET_NAME!;
        this.publicUrl = process.env.R2_PUBLIC_URL!; // e.g., https://<account_id>.r2.cloudflarestorage.com/<bucket_name>

        this.s3Client = new S3Client({
            region: 'auto',
            endpoint: process.env.R2_ENDPOINT!,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID!,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
            }
        });
    }

    async uploadFile(
        file: Buffer,
        originalName: string,
        mimeType: string,
        screenshotType: 'ATTENDANCE_IMAGE' | 'RESULT_IMAGE',
        matchId: string,
        context: 'tournament' | 'quick-pt' = 'tournament'
    ): Promise<{ url: string; key: string }> {
        try {
            const fileExtension = originalName.split('.').pop();
            const directory = context === 'quick-pt'
                ? 'quick-pt'
                : 'tournaments';
            const uniqueKey = `${directory}/${screenshotType}/match-${matchId}/${Date.now()}-${crypto.randomUUID()}.${fileExtension}`;

            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: uniqueKey,
                Body: file,
                ContentType: mimeType,
                // Make file publicly accessible
                ACL: 'public-read'
            });

            await this.s3Client.send(command);

            const fileUrl = `${this.publicUrl}/${uniqueKey}`;

            this.logger.info(`File uploaded successfully to R2: ${uniqueKey}`);

            return {
                url: fileUrl,
                key: uniqueKey
            };
        } catch (error) {
            this.logger.error('Failed to upload file to R2:', error);
            throw new Error('File upload failed');
        }
    }

    async deleteFile(key: string): Promise<void> {
        try {
            const command = new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: key
            });

            await this.s3Client.send(command);
            this.logger.info(`File deleted from R2: ${key}`);
        } catch (error) {
            this.logger.error(`Failed to delete file from R2: ${key}`, error);
            throw new Error('File deletion failed');
        }
    }

    async getSignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key
            });

            const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
            return signedUrl;
        } catch (error) {
            this.logger.error(`Failed to generate signed URL for: ${key}`, error);
            throw new Error('Failed to generate download URL');
        }
    }

    /** Stream an object from R2 for authenticated media proxy responses. */
    async getObjectStream(key: string): Promise<{ body: Readable; contentType: string }> {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });
            const response = await this.s3Client.send(command);

            if (!response.Body) {
                throw new Error('Empty R2 object body');
            }

            return {
                body: response.Body as Readable,
                contentType: response.ContentType ?? 'image/png',
            };
        } catch (error) {
            this.logger.error(`Failed to stream object from R2: ${key}`, error);
            throw new Error('Failed to stream media from storage');
        }
    }

    /**
     * Upload any logo buffer to a specific R2 key path.
     * Used for team logo presets and per-match slot logos.
     */
    async uploadLogoBuffer(
        buffer: Buffer,
        r2Key: string,
        mimeType: string
    ): Promise<{ url: string; key: string }> {
        try {
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: r2Key,
                Body: buffer,
                ContentType: mimeType,
                ACL: 'public-read',
            });

            await this.s3Client.send(command);

            const fileUrl = `${this.publicUrl}/${r2Key}`;
            this.logger.info(`Logo uploaded to R2: ${r2Key}`);
            return { url: fileUrl, key: r2Key };
        } catch (error) {
            this.logger.error(`Failed to upload logo to R2: ${r2Key}`, error);
            throw new Error('Logo upload failed');
        }
    }

    async listTemplateImages(prefix: string = 'templates/'): Promise<Array<{ key: string; url: string }>> {
        try {
            const command = new ListObjectsV2Command({
                Bucket: this.bucketName,
                Prefix: prefix,
                MaxKeys: 1000
            });

            const response = await this.s3Client.send(command);
            
            if (!response.Contents) {
                return [];
            }

            const templateImages = response.Contents
                .filter(obj => (obj.Key || '').match(/\.(png|jpg|jpeg)$/i))
                .map(obj => ({
                    key: obj.Key!,
                    url: `${this.publicUrl}/${obj.Key!}`
                }));

            this.logger.info(`Found ${templateImages.length} template images in R2`);
            return templateImages;
        } catch (error) {
            this.logger.error('Failed to list template images from R2:', error);
            throw new Error('Failed to fetch template images');
        }
    }

    /**
     * List ALL files (images + JSON configs) under a prefix.
     * Used by templateService to pair template images with their config JSONs.
     */
    async listAllTemplateFiles(prefix: string = 'templates/'): Promise<Array<{ key: string; isImage: boolean; isConfig: boolean }>> {
        try {
            const command = new ListObjectsV2Command({
                Bucket: this.bucketName,
                Prefix: prefix,
                MaxKeys: 1000
            });

            const response = await this.s3Client.send(command);

            if (!response.Contents) {
                return [];
            }

            return response.Contents
                .filter(obj => obj.Key && (obj.Key.match(/\.(png|jpg|jpeg)$/i) || obj.Key.endsWith('.json')))
                .map(obj => ({
                    key: obj.Key!,
                    isImage: /\.(png|jpg|jpeg)$/i.test(obj.Key!),
                    isConfig: obj.Key!.endsWith('.json'),
                }));
        } catch (error) {
            this.logger.error('Failed to list all template files from R2:', error);
            throw new Error('Failed to fetch template files');
        }
    }

    /** Read and parse a JSON object from R2 by key. */
    async getObjectJson<T = Record<string, unknown>>(key: string): Promise<T> {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });
            const response = await this.s3Client.send(command);
            const body = await response.Body?.transformToString();
            if (!body) {
                throw new Error('Empty template config object');
            }
            return JSON.parse(body) as T;
        } catch (error) {
            this.logger.error(`Failed to read JSON from R2: ${key}`, error);
            throw new Error('Failed to read template config');
        }
    }
}

export const r2Service = new CloudflareR2Service();