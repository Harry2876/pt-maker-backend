import {
    Top10ExportOptions,
    Top10Request,
    Top10RankData,
} from '../types/pythonAI';
import { omitEmptyFields } from './r2UrlUtils';
import {
    advancedConfigForPython,
    clientOverridesForPython,
    DEFAULT_PYTHON_IMAGE_OPTIONS,
    fontCustomizationForPython,
    logoOverridesForPython,
    showBrandingForPython,
    socialOverridesForPython,
} from './pythonGraphicsDefaults';

const DEFAULT_TOP10_OPTIONS = DEFAULT_PYTHON_IMAGE_OPTIONS;

/** Build internal Top10Request from raw template URLs + rank data + styling opts. */
export function buildTop10Request(
    templateUrl: string,
    configUrl: string,
    rankData: Top10RankData[],
    options: Top10ExportOptions = {},
): Top10Request {
    return {
        template_url: templateUrl,
        template_config_url: configUrl,
        rank_data: rankData,
        ...(options.headerOverrides != null && { header_overrides: options.headerOverrides }),
        ...(options.elementOverrides != null && { element_overrides: options.elementOverrides }),
        ...(options.footerOverrides != null && { footer_overrides: options.footerOverrides }),
        ...(options.cardOverrides != null && { card_overrides: options.cardOverrides }),
        ...(logoOverridesForPython(options.orgLogoOverrides) != null && {
            org_logo_overrides: logoOverridesForPython(options.orgLogoOverrides),
        }),
        ...(socialOverridesForPython(options.socialOverrides) != null && {
            social_overrides: socialOverridesForPython(options.socialOverrides),
        }),
        ...(options.fontCustomization != null && { font_customization: options.fontCustomization }),
        ...(options.showBranding != null && { show_branding: options.showBranding }),
        ...(options.advancedConfig != null && { advanced_config: options.advancedConfig }),
        ...(options.outputFilename && { output_filename: options.outputFilename }),
        options: DEFAULT_TOP10_OPTIONS,
    };
}

/** Build the exact JSON body Python POST /api/v1/top-10-rankings/generate expects. */
export function buildPythonTop10Payload(request: Top10Request): Record<string, unknown> {
    return omitEmptyFields({
        template_url: request.template_url,
        template_config_url: request.template_config_url,
        rank_data: request.rank_data.map(row =>
            omitEmptyFields({
                rank: row.rank,
                team_name: row.team_name,
                total_points: row.total_points,
                team_logo_url: row.team_logo_url,
            })
        ),
        header_overrides: clientOverridesForPython(
            request.header_overrides as Record<string, unknown> | null | undefined,
        ),
        element_overrides: clientOverridesForPython(
            request.element_overrides as Record<string, unknown> | null | undefined,
        ),
        footer_overrides: clientOverridesForPython(
            request.footer_overrides as Record<string, unknown> | null | undefined,
        ),
        card_overrides: clientOverridesForPython(
            request.card_overrides as Record<string, unknown> | null | undefined,
        ),
        org_logo_overrides: request.org_logo_overrides,
        social_overrides: request.social_overrides,
        font_customization: fontCustomizationForPython(
            request.font_customization as Record<string, unknown> | null | undefined,
        ),
        show_branding: showBrandingForPython(request.show_branding),
        advanced_config: advancedConfigForPython(
            request.template_config_url,
            request.advanced_config as Record<string, unknown> | null | undefined,
        ),
        output_filename: request.output_filename,
        options: request.options,
    });
}
