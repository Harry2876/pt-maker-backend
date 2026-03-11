import { BaseService } from './baseService';
import { r2Service } from './cloudflareR2Service';
import { signedUrlUtility } from './signedUrlUtility';
import redis from '../config/redis';

export interface TemplateInfo {
    name: string;
    signedUrl: string;
    previewUrl: string;
    configUrl: string; // Template config file URL
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
     * Get all available template images organized by category
     */
    async getAllTemplates(): Promise<TemplateResponse> {
        try {
            this.logger.info('Fetching all templates...');
            
            // Check cache first
            const cachedTemplates = await redis.get(this.CACHE_KEY);
            if (cachedTemplates) {
                this.logger.info('Found cached templates, refreshing signed URLs...');
                const parsed = JSON.parse(cachedTemplates);
                
                // Regenerate signed URLs (they expire)
                const templatesWithFreshUrls = await this.refreshSignedUrls(parsed.templates);
                
                return {
                    ...parsed,
                    templates: templatesWithFreshUrls,
                    cacheExpiry: Date.now() + (this.CACHE_TTL * 1000)
                };
            }

            this.logger.info('No cache found, fetching from R2...');
            
            // Fetch from R2
            const templateImages = await r2Service.listTemplateImages(this.TEMPLATE_PREFIX);
            this.logger.info(`Found ${templateImages.length} template images in R2`);
            
            if (templateImages.length === 0) {
                this.logger.warn('No template images found in R2 bucket');
                return {
                    templates: {},
                    totalTemplates: 0,
                    cacheExpiry: Date.now() + (this.CACHE_TTL * 1000)
                };
            }
            
            // Organize templates by category
            const organizedTemplates = await this.organizeTemplatesByCategory(templateImages);
            this.logger.info(`Organized templates into ${Object.keys(organizedTemplates).length} categories`);
            
            // Cache the organized structure (without signed URLs)
            const cacheData = {
                templates: this.stripSignedUrls(organizedTemplates),
                totalTemplates: this.countTemplates(organizedTemplates)
            };
            
            await redis.set(this.CACHE_KEY, JSON.stringify(cacheData), this.CACHE_TTL);
            this.logger.info('Templates cached successfully');

            return {
                templates: organizedTemplates,
                totalTemplates: this.countTemplates(organizedTemplates),
                cacheExpiry: Date.now() + (this.CACHE_TTL * 1000)
            };

        } catch (error) {
            this.logger.error('Failed to get all templates:', error);
            this.handleError(error, 'Get All Templates');
            throw error;
        }
    }

    /**
     * Organize template images by category from R2 keys
     */
    private async organizeTemplatesByCategory(
        templateImages: Array<{ key: string; url: string }>
    ): Promise<Record<string, TemplateInfo[]>> {
        const organized: Record<string, TemplateInfo[]> = {};
        let processedCount = 0;
        let skippedCount = 0;

        this.logger.info(`Organizing ${templateImages.length} template images by category...`);

        for (const image of templateImages) {
            try {
                // Extract category and template name from path
                // Expected format: templates/24_teams/template1.png
                const pathParts = image.key.replace(this.TEMPLATE_PREFIX, '').split('/');
                
                if (pathParts.length < 2) {
                    this.logger.warn(`Invalid template path format: ${image.key}`);
                    skippedCount++;
                    continue;
                }
                
                const category = pathParts[0]; // e.g., "24_teams"
                const templateFile = pathParts[pathParts.length - 1]; // e.g., "template1.png"
                const extensionMatch = templateFile.match(/\.(png|jpg|jpeg)$/i);
                
                if (!extensionMatch) {
                    this.logger.warn(`Unsupported file extension: ${templateFile}`);
                    skippedCount++;
                    continue;
                }
                
                const originalExtension = extensionMatch[1].toLowerCase();
                const templateName = templateFile.replace(/\.(png|jpg|jpeg)$/i, ''); // e.g., "template1"

                // Validate category format
                if (!category.match(/^\d+_teams$/)) {
                    this.logger.warn(`Invalid category format: ${category} in ${image.key}`);
                    skippedCount++;
                    continue;
                }

                // Generate signed URL for template image
                const signedUrl = await signedUrlUtility.generateSignedUrl(image.key, { expiryMinutes: 30 });
                
                // Generate signed URL for config file (same naming pattern)
                const configKey = `${this.TEMPLATE_PREFIX}${category}/templateConfig_${templateName.replace('tmplate_', '')}.json`;
                const configSignedUrl = await signedUrlUtility.generateSignedUrl(configKey, { expiryMinutes: 30 });

                const templateInfo: TemplateInfo = {
                    name: templateName,
                    signedUrl: signedUrl.signedUrl,
                    previewUrl: signedUrl.signedUrl, // Same as signed URL for now
                    configUrl: configSignedUrl.signedUrl,
                    category: category,
                    fullPath: `${category}/${templateName}`,
                    originalExtension: originalExtension
                };

                if (!organized[category]) {
                    organized[category] = [];
                }

                organized[category].push(templateInfo);
                processedCount++;
                
            } catch (error) {
                this.logger.warn(`Failed to process template image: ${image.key}`, error);
                skippedCount++;
                continue;
            }
        }

        this.logger.info(`Template organization complete: ${processedCount} processed, ${skippedCount} skipped`);

        // Sort templates within each category
        Object.keys(organized).forEach(category => {
            organized[category].sort((a, b) => a.name.localeCompare(b.name));
            this.logger.debug(`Category ${category}: ${organized[category].length} templates`);
        });

        return organized;
    }

    /**
     * Refresh signed URLs for cached templates
     */
    private async refreshSignedUrls(
        templates: Record<string, Omit<TemplateInfo, 'signedUrl' | 'previewUrl' | 'configUrl'>[]>
    ): Promise<Record<string, TemplateInfo[]>> {
        const refreshed: Record<string, TemplateInfo[]> = {};

        for (const [category, templateList] of Object.entries(templates)) {
            refreshed[category] = [];
            
            for (const template of templateList) {
                try {
                    // Reconstruct R2 key with original extension
                    const r2Key = `${this.TEMPLATE_PREFIX}${template.fullPath}.${template.originalExtension}`;
                    const configKey = `${this.TEMPLATE_PREFIX}${template.category}/templateConfig_${template.name.replace('tmplate_', '')}.json`;
                    
                    // Generate fresh signed URLs for both template and config
                    const signedUrl = await signedUrlUtility.generateSignedUrl(r2Key, { expiryMinutes: 30 });
                    const configSignedUrl = await signedUrlUtility.generateSignedUrl(configKey, { expiryMinutes: 30 });
                    
                    refreshed[category].push({
                        ...template,
                        signedUrl: signedUrl.signedUrl,
                        previewUrl: signedUrl.signedUrl,
                        configUrl: configSignedUrl.signedUrl
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
            
            return {
                templateUrl: template.signedUrl,
                configUrl: template.configUrl
            };
        } catch (error) {
            this.handleError(error, 'Get Template With Config');
            throw error;
        }
    }
}

export const templateService = new TemplateService();