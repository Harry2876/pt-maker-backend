import sharp from 'sharp';
import { r2Service } from '../services/cloudflareR2Service';
import { templatePreviewKeyFromOriginal } from './r2UrlUtils';

/** Display width for generated graphics / export PNG previews (UI only — originals kept for download). */
export const GENERATED_IMAGE_PREVIEW_WIDTH = 800;
export const GENERATED_IMAGE_PREVIEW_WEBP_QUALITY = 80;

export function previewWebpKeyFromOriginalR2Key(originalR2Key: string): string {
    return templatePreviewKeyFromOriginal(originalR2Key);
}

export async function buildCompressedPreviewBuffer(originalBuffer: Buffer): Promise<Buffer> {
    return sharp(originalBuffer)
        .resize({ width: GENERATED_IMAGE_PREVIEW_WIDTH, withoutEnlargement: true })
        .webp({ quality: GENERATED_IMAGE_PREVIEW_WEBP_QUALITY })
        .toBuffer();
}

/** Download original from R2, compress to WebP, upload alongside under `{dir}/previews/{name}.webp`. */
export async function ensureCompressedPreviewInR2(originalR2Key: string): Promise<string> {
    const previewKey = previewWebpKeyFromOriginalR2Key(originalR2Key);

    const { body } = await r2Service.getObjectStream(originalR2Key);
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Buffer>) {
        chunks.push(chunk);
    }

    const previewBuffer = await buildCompressedPreviewBuffer(Buffer.concat(chunks));
    await r2Service.uploadLogoBuffer(previewBuffer, previewKey, 'image/webp');

    return previewKey;
}
