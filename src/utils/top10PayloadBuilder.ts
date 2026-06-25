import {
    Top10ExportOptions,
    Top10Request,
    Top10RankData,
} from '../types/pythonAI';
import { omitEmptyFields } from './r2UrlUtils';
import { DEFAULT_PYTHON_IMAGE_OPTIONS, DEFAULT_SLOT_LIST_OPTIONS } from './pythonGraphicsDefaults';
import { advancedConfigForPython } from './advancedConfigForPython';

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
        ...(options.footerOverrides != null && { footer_overrides: options.footerOverrides }),
        ...(options.cardOverrides != null && { card_overrides: options.cardOverrides }),
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
        header_overrides: request.header_overrides,
        footer_overrides: request.footer_overrides,
        card_overrides: request.card_overrides,
        font_customization: request.font_customization,
        show_branding: request.show_branding,
        advanced_config: advancedConfigForPython(
            request.template_config_url,
            request.advanced_config as Record<string, unknown> | null | undefined,
        ),
        output_filename: request.output_filename,
        options: request.options,
    });
}
