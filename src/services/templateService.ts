import { BaseService } from './baseService';
import { r2Service } from './cloudflareR2Service';
import { signedUrlUtility } from './signedUrlUtility';
import redis from '../config/redis';
import { buildRawR2ObjectUrl, templateNameToConfigFileName, resolveR2ObjectKey } from '../utils/r2UrlUtils';

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

                    const [signedUrl, configSignedUrl] = await Promise.all([
                        signedUrlUtility.generateSignedUrl(imageKey, { expiryMinutes: 30 }),
                        signedUrlUtility.generateSignedUrl(configKey, { expiryMinutes: 30 }),
                    ]);

                    organized[category].push({
                        name: templateName,
                        signedUrl: signedUrl.signedUrl,
                        previewUrl: signedUrl.signedUrl,
                        configUrl: configSignedUrl.signedUrl,
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
        const refreshed: Record<string, TemplateInfo[]> = {};

        for (const [category, templateList] of Object.entries(templates)) {
            refreshed[category] = [];

            for (const template of templateList) {
                try {
                    // Reconstruct R2 key from fullPath (works for all categories)
                    const r2Key = `${this.TEMPLATE_PREFIX}${template.fullPath}.${template.originalExtension}`;

                    const configKey = template.rawConfigUrl
                        ? resolveR2ObjectKey(template.rawConfigUrl)
                        : `${this.TEMPLATE_PREFIX}${template.category}/${templateNameToConfigFileName(template.name)}`;

                    if (!configKey) {
                        this.logger.warn(`Could not resolve config key for template: ${template.fullPath}`);
                        continue;
                    }

                    const [signedUrl, configSignedUrl] = await Promise.all([
                        signedUrlUtility.generateSignedUrl(r2Key, { expiryMinutes: 30 }),
                        signedUrlUtility.generateSignedUrl(configKey, { expiryMinutes: 30 }),
                    ]);

                    refreshed[category].push({
                        ...template,
                        signedUrl: signedUrl.signedUrl,
                        previewUrl: signedUrl.signedUrl,
                        configUrl: configSignedUrl.signedUrl,
                        rawTemplateUrl: buildRawR2ObjectUrl(r2Key),
                        rawConfigUrl: buildRawR2ObjectUrl(configKey),
                    } as TemplateInfo);
                } catch (error) {
                    this.logger.warn(`Failed to refresh signed URL for template: ${template.fullPath}`, error);
                }
            }
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