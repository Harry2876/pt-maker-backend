import logger from './logger';

/** Default options for Python POST /api/v1/standings|team-list|top-10-rankings/generate */
export const DEFAULT_PYTHON_IMAGE_OPTIONS = {
    upload_to_r2: true,
    compress_image: false,
    image_quality: 95,
    render_scale: 0,
} as const;

/** Slot-list curl uses upload_to_r2 + render_scale only; compress_image/image_quality are harmless extras */
export const DEFAULT_SLOT_LIST_OPTIONS = {
    upload_to_r2: true,
    compress_image: false,
    render_scale: 0,
} as const;

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

/** Branding on/off only — template JSON owns layout/fonts/text for the branding line. */
export function showBrandingForPython(showBranding: unknown): boolean | undefined {
    return typeof showBranding === 'boolean' ? showBranding : undefined;
}

export function fontCustomizationForPython(
    fontCustomization: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
    if (fontCustomization == null) {
        return undefined;
    }

    const { branding_font: _brandingFont, ...rest } = fontCustomization;
    return Object.keys(rest).length > 0 ? rest : undefined;
}

export function clientOverridesForPython(
    patch: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
    if (patch == null) {
        return undefined;
    }

    const { branding: _branding, ...rest } = patch;
    return Object.keys(rest).length > 0 ? rest : undefined;
}
