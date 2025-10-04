import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
        matchId: string
    ): Promise<{ url: string; key: string }> {
        try {
            const fileExtension = originalName.split('.').pop();
            const uniqueKey = `${screenshotType}/match-${matchId}/${Date.now()}-${crypto.randomUUID()}.${fileExtension}`;

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
}

export const r2Service = new CloudflareR2Service();