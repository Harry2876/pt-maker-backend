import * as dotenv from 'dotenv';
dotenv.config();

import sharp from 'sharp';
import { r2Service } from '../services/cloudflareR2Service';

const PREVIEW_WIDTH = 600;
const WEBP_QUALITY = 80;

async function run() {
    console.log('🔍 Listing all template images from R2...');
    const allFiles = await r2Service.listAllTemplateFiles('templates/');
    const imageFiles = allFiles.filter(f => f.isImage);

    console.log(`Found ${imageFiles.length} template image(s). Generating previews...\n`);

    let success = 0;
    let skipped = 0;
    let failed = 0;

    for (const file of imageFiles) {
        const parts = file.key.split('/');
        const filename = parts[parts.length - 1];
        const nameWithoutExt = filename.replace(/\.(png|jpg|jpeg)$/i, '');

        // Skip if already inside a "previews" folder
        if (parts.includes('previews')) {
            skipped++;
            continue;
        }

        // Build preview key: templates/16_teams/tmplate_1.png
        //                  → templates/16_teams/previews/tmplate_1.webp
        const previewParts = [...parts.slice(0, -1), 'previews', `${nameWithoutExt}.webp`];
        const previewKey = previewParts.join('/');

        try {
            // Download original
            const { body } = await r2Service.getObjectStream(file.key);
            const chunks: Buffer[] = [];
            for await (const chunk of body as AsyncIterable<Buffer>) {
                chunks.push(chunk);
            }
            const originalBuffer = Buffer.concat(chunks);

            // Compress and resize
            const previewBuffer = await sharp(originalBuffer)
                .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
                .webp({ quality: WEBP_QUALITY })
                .toBuffer();

            // Upload preview
            await r2Service.uploadLogoBuffer(previewBuffer, previewKey, 'image/webp');

            const reduction = (((originalBuffer.length - previewBuffer.length) / originalBuffer.length) * 100).toFixed(1);
            console.log(`✅ ${file.key}`);
            console.log(`   → ${previewKey}`);
            console.log(`   ${(originalBuffer.length / 1024).toFixed(0)} KB → ${(previewBuffer.length / 1024).toFixed(0)} KB (${reduction}% smaller)\n`);
            success++;
        } catch (err) {
            console.error(`❌ Failed for ${file.key}:`, err);
            failed++;
        }
    }

    console.log(`\nDone! ✅ ${success} generated  ⏭ ${skipped} skipped  ❌ ${failed} failed`);
    process.exit(0);
}

run().catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
});