import pLimit from 'p-limit';
import { BaseService } from './baseService';
import { r2Service } from './cloudflareR2Service';
import { storedFileService } from './storedFileService';
import redis from '../config/redis';
import {
    buildRawR2ObjectUrl,
    mimeTypeFromR2Key,
    templateNameToConfigFileName,
    templatePreviewKeyFromOriginal,
    resolveR2ObjectKey,
} from '../utils/r2UrlUtils';

/**
 * Extract the first numeric run from a filename stem.
 * e.g. "sl1" → "1", "t10template_1" → "10", "tmplate_2" → "2", "team_roster1" → "1"
 * Returns null if no digit sequence found.
 */
function extractNumericSuffix(name: string): string | null {
    // Prefer trailing number: "tmplate_2" → "2", "sl1" → "1"
    const trailing = name.match(/(\d+)\D*$/);
    if (trailing) return trailing[1];
    const first = name.match(/(\d+)/);
    return first ? first[1] : null;
}

export interface TemplateInfo {
    name: string;
    signedUrl: string;
    previewUrl: string;
    configUrl: string; // Template config file URL (signed)
    rawTemplateUrl: string; // Raw R2 URL for template (for Python AI API)
    rawConfigUrl: string; // Raw R2 URL for config (for Python AI API)
    category: string;
    fullPath: string;
    originalExtension: string; // Store the original file extension
}

export interface TemplateResponse {
    templates: Record<string, TemplateInfo[]>;
    totalTemplates: number;
    cacheExpiry: number;
}

export class TemplateService extends BaseService {
    private readonly CACHE_KEY = 'quickPT:templates';
    private readonly CACHE_TTL = 3600; // 1 hour
    private readonly TEMPLATE_PREFIX = 'templates/';

    constructor() {
        super();
    }

    /**
     * Issue client-facing signed preview URLs for template image + config JSON.
     * Thumbnails use compressed WebP previews; rawTemplateUrl still points at the full original.
     * Templates are registered as public files (no Bearer required when using sig).
     */
    private async issueTemplatePreviewUrls(
        imageKey: string,
        configKey: string,
    ): Promise<{ signedUrl: string; previewUrl: string; configUrl: string }> {
        const previewImageKey = templatePreviewKeyFromOriginal(imageKey);

        const [imagePreview, configPreview] = await Promise.all([
            storedFileService.ensureClientPreview({
                userId: null,
                assetType: 'TEMPLATE',
                r2Key: previewImageKey,
                resourceId: previewImageKey,
                isPublic: true,
                mimeType: mimeTypeFromR2Key(previewImageKey),
            }),
            storedFileService.ensureClientPreview({
                userId: null,
                assetType: 'TEMPLATE_CONFIG',
                r2Key: configKey,
                resourceId: configKey,
                isPublic: true,
                mimeType: 'application/json',
            }),
        ]);

        return {
            signedUrl: imagePreview.previewUrl,
            previewUrl: imagePreview.previewUrl,
            configUrl: configPreview.previewUrl,
        };
    }

    /**
     * Get all available template images organized by category.
     * Returns standings templates (8_teams, 16_teams, 24_teams) AND
     * graphics templates (slot_list, team_roster, top_10).
     */
    async getAllTemplates(): Promise<TemplateResponse> {
        try {
            this.logger.info('Fetching all templates...');

            const cachedTemplates = await redis.get(this.CACHE_KEY);
            if (cachedTemplates) {
                this.logger.debug('Found cached templates, refreshing signed URLs...');
                const parsed = JSON.parse(cachedTemplates);
                const templatesWithFreshUrls = await this.refreshSignedUrls(parsed.templates);
                return {
                    ...parsed,
                    templates: templatesWithFreshUrls,
                    cacheExpiry: Date.now() + (this.CACHE_TTL * 1000),
                };
            }

            // Acquire a distributed lock so only one request fetches from R2 on a cold cache.
            // All other concurrent requests will wait and then read from cache once it is warm.
            const LOCK_KEY = 'quickPT:templates:fetch-lock';
            const LOCK_TTL = 60; // seconds — enough time for the R2 fetch to complete
            const lockAcquired = await redis.setNX(LOCK_KEY, '1', LOCK_TTL);

            if (!lockAcquired) {
                // Another request is already building the cache — wait up to 10 s for it
                this.logger.info('Template cache being built by another request, waiting...');
                for (let attempt = 0; attempt < 10; attempt++) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const ready = await redis.get(this.CACHE_KEY);
                    if (ready) {
                        const parsed = JSON.parse(ready);
                        const templatesWithFreshUrls = await this.refreshSignedUrls(parsed.templates);
                        return {
                            ...parsed,
                            templates: templatesWithFreshUrls,
                            cacheExpiry: Date.now() + (this.CACHE_TTL * 1000),
                        };
                    }
                }
                // If cache still not ready after 10 s, fall through and fetch anyway
                this.logger.warn('Template cache wait timed out — fetching from R2 directly');
            }

            try {
                this.logger.info('No cache found, fetching from R2...');
                const allFiles = await r2Service.listAllTemplateFiles(this.TEMPLATE_PREFIX);
                this.logger.info(`Found ${allFiles.length} total template files in R2`);

                if (allFiles.length === 0) {
                    this.logger.warn('No template files found in R2 bucket');
                    return { templates: {}, totalTemplates: 0, cacheExpiry: Date.now() + (this.CACHE_TTL * 1000) };
                }

                const organizedTemplates = await this.organizeTemplatesByCategory(allFiles);
                this.logger.info(`Organized templates into ${Object.keys(organizedTemplates).length} categories`);

                const cacheData = {
                    templates: this.stripSignedUrls(organizedTemplates),
                    totalTemplates: this.countTemplates(organizedTemplates),
                };

                await redis.set(this.CACHE_KEY, JSON.stringify(cacheData), this.CACHE_TTL);
                this.logger.info('Templates cached successfully');

                return {
                    templates: organizedTemplates,
                    totalTemplates: this.countTemplates(organizedTemplates),
                    cacheExpiry: Date.now() + (this.CACHE_TTL * 1000),
                };
            } finally {
                await redis.delete(LOCK_KEY);
            }
        } catch (error) {
            this.logger.error('Failed to get all templates:', error);
            this.handleError(error, 'Get All Templates');
            throw error;
        }
    }

    /**
     * Organize template files by category.
     *
     * Works for ALL category names — standings (16_teams) and graphics (slot_list, team_roster, top_10).
     *
     * Config pairing strategy (in order):
     *   1. For standings categories: use templateNameToConfigFileName (tmplate_1 → templateConfig_1.json)
     *   2. For all categories: match by shared numeric suffix from JSON files in the same folder
     *   3. Last resort: pick the only JSON in the folder if exactly one exists
     */
    private async organizeTemplatesByCategory(
        allFiles: Array<{ key: string; isImage: boolean; isConfig: boolean }>
    ): Promise<Record<string, TemplateInfo[]>> {
        // Group files by category folder
        const byCategory: Record<string, { images: string[]; configs: string[] }> = {};

        for (const file of allFiles) {
            const relative = file.key.replace(this.TEMPLATE_PREFIX, '');
            const parts = relative.split('/');
            if (parts.length < 2) continue;

            const category = parts[0];
            if (!byCategory[category]) {
                byCategory[category] = { images: [], configs: [] };
            }
            if (file.isImage) byCategory[category].images.push(file.key);
            if (file.isConfig) byCategory[category].configs.push(file.key);
        }

        const organized: Record<string, TemplateInfo[]> = {};
        let processedCount = 0;
        let skippedCount = 0;

        for (const [category, { images, configs }] of Object.entries(byCategory)) {
            if (images.length === 0) continue;

            // Build a numeric-id → configKey map for quick lookup
            const configByNumId: Record<string, string> = {};
            for (const configKey of configs) {
                const configFile = configKey.split('/').pop()!.replace('.json', '');
                const numId = extractNumericSuffix(configFile);
                if (numId) configByNumId[numId] = configKey;
            }

            organized[category] = [];

            for (const imageKey of images) {
                try {
                    const imageFile = imageKey.split('/').pop()!;
                    const extensionMatch = imageFile.match(/\.(png|jpg|jpeg)$/i);
                    if (!extensionMatch) { skippedCount++; continue; }

                    const originalExtension = extensionMatch[1].toLowerCase();
                    const templateName = imageFile.replace(/\.(png|jpg|jpeg)$/i, '');

                    // --- Config resolution ---
                    let configKey: string | null = null;

                    // 1. Try standard standings naming (tmplate_N → templateConfig_N.json)
                    const derivedConfigName = templateNameToConfigFileName(templateName);
                    const derivedConfigKey = `${this.TEMPLATE_PREFIX}${category}/${derivedConfigName}`;
                    if (configs.includes(derivedConfigKey)) {
                        configKey = derivedConfigKey;
                    }

                    // 2. Match by shared numeric suffix
                    if (!configKey) {
                        const numId = extractNumericSuffix(templateName);
                        if (numId && configByNumId[numId]) {
                            configKey = configByNumId[numId];
                        }
                    }

                    // 3. If only one JSON in the folder, use it
                    if (!configKey && configs.length === 1) {
                        configKey = configs[0];
                    }

                    if (!configKey) {
                        this.logger.warn(`No config JSON found for template ${imageKey} — skipping`);
                        skippedCount++;
                        continue;
                    }

                    const previewUrls = await this.issueTemplatePreviewUrls(imageKey, configKey);

                    organized[category].push({
                        name: templateName,
                        signedUrl: previewUrls.signedUrl,
                        previewUrl: previewUrls.previewUrl,
                        configUrl: previewUrls.configUrl,
                        rawTemplateUrl: buildRawR2ObjectUrl(imageKey),
                        rawConfigUrl: buildRawR2ObjectUrl(configKey),
                        category,
                        fullPath: `${category}/${templateName}`,
                        originalExtension,
                    });
                    processedCount++;
                } catch (err) {
                    this.logger.warn(`Failed to process template ${imageKey}`, err);
                    skippedCount++;
                }
            }

            // Sort within category
            organized[category].sort((a, b) => a.name.localeCompare(b.name));
            this.logger.debug(`Category ${category}: ${organized[category].length} templates`);
        }

        // Remove empty categories
        for (const cat of Object.keys(organized)) {
            if (organized[cat].length === 0) delete organized[cat];
        }

        this.logger.info(`Template organization complete: ${processedCount} processed, ${skippedCount} skipped`);
        return organized;
    }

    /**
     * Refresh signed URLs for cached templates.
     * Uses the rawTemplateUrl / rawConfigUrl already stored in the cache — no re-derivation needed.
     */
    private async refreshSignedUrls(
        templates: Record<string, Omit<TemplateInfo, 'signedUrl' | 'previewUrl' | 'configUrl'>[]>
    ): Promise<Record<string, TemplateInfo[]>> {
        const limit = pLimit(5);
        const refreshed: Record<string, TemplateInfo[]> = {};

        // Collect all refresh tasks across categories and run them concurrently (max 5 at a time)
        const tasks = Object.entries(templates).flatMap(([category, templateList]) =>
            templateList.map(template => limit(async () => {
                try {
                    const r2Key = `${this.TEMPLATE_PREFIX}${template.fullPath}.${template.originalExtension}`;

                    const configKey = template.rawConfigUrl
                        ? resolveR2ObjectKey(template.rawConfigUrl)
                        : `${this.TEMPLATE_PREFIX}${template.category}/${templateNameToConfigFileName(template.name)}`;

                    if (!configKey) {
                        this.logger.warn(`Could not resolve config key for template: ${template.fullPath}`);
                        return null;
                    }

                    const previewUrls = await this.issueTemplatePreviewUrls(r2Key, configKey);
                    return {
                        category,
                        info: {
                            ...template,
                            signedUrl: previewUrls.signedUrl,
                            previewUrl: previewUrls.previewUrl,
                            configUrl: previewUrls.configUrl,
                            rawTemplateUrl: buildRawR2ObjectUrl(r2Key),
                            rawConfigUrl: buildRawR2ObjectUrl(configKey),
                        } as TemplateInfo,
                    };
                } catch (error) {
                    this.logger.warn(`Failed to refresh signed URL for template: ${template.fullPath}`, error);
                    return null;
                }
            }))
        );

        const results = await Promise.all(tasks);

        for (const result of results) {
            if (!result) continue;
            if (!refreshed[result.category]) refreshed[result.category] = [];
            refreshed[result.category].push(result.info);
        }

        return refreshed;
    }

    /**
     * Remove signed URLs from templates for caching
     */
    private stripSignedUrls(
        templates: Record<string, TemplateInfo[]>
    ): Record<string, Omit<TemplateInfo, 'signedUrl' | 'previewUrl' | 'configUrl'>[]> {
        const stripped: Record<string, Omit<TemplateInfo, 'signedUrl' | 'previewUrl' | 'configUrl'>[]> = {};

        for (const [category, templateList] of Object.entries(templates)) {
            stripped[category] = templateList.map(({ signedUrl, previewUrl, configUrl, ...rest }) => rest);
        }

        return stripped;
    }

    /**
     * Count total number of templates
     */
    private countTemplates(templates: Record<string, TemplateInfo[]>): number {
        return Object.values(templates).reduce((total, templateList) => total + templateList.length, 0);
    }

    /**
     * Invalidate template cache (useful for admin operations)
     */
    async invalidateCache(): Promise<void> {
        try {
            await redis.delete(this.CACHE_KEY);
            this.logger.info('Template cache invalidated');
        } catch (error) {
            this.handleError(error, 'Invalidate Template Cache');
            throw error;
        }
    }

    /**
     * Get specific template with config URL by template name and format
     */
    async getTemplateWithConfig(
        templateName: string,
        formatType: string
    ): Promise<{ templateUrl: string; configUrl: string } | null> {
        try {
            const templates = await this.getAllTemplates();
            const categoryTemplates = templates.templates[formatType];
            
            if (!categoryTemplates) {
                this.logger.warn(`Format type ${formatType} not found`);
                return null;
            }
            
            const template = categoryTemplates.find(t => t.name === templateName);
            if (!template) {
                this.logger.warn(`Template ${templateName} not found in ${formatType}`);
                return null;
            }
            
            // Return raw R2 URLs for Python AI — Python fetches with its own R2 credentials
            return {
                templateUrl: template.rawTemplateUrl,
                configUrl: template.rawConfigUrl,
            };
        } catch (error) {
            this.handleError(error, 'Get Template With Config');
            throw error;
        }
    }
}

export const templateService = new TemplateService();