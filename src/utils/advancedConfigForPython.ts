import logger from './logger';

/**
 * When template_config_url is set, Python loads coordinate JSON from R2.
 * Client advanced_config deep-merges on top and can overwrite positions — drop it entirely.
 */
export function advancedConfigForPython(
    templateConfigUrl: string | null | undefined,
    advancedConfig: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
    const hasTemplateConfig = Boolean(templateConfigUrl?.trim());

    if (hasTemplateConfig) {
        if (advancedConfig != null && Object.keys(advancedConfig).length > 0) {
            logger.warn('Ignoring client advanced_config — template_config_url provides layout coordinates');
        }
        return undefined;
    }

    return advancedConfig ?? undefined;
}
