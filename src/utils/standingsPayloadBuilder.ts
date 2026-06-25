import { StandingsExportOptions, StandingsRequest, StandingsTeamData } from '../types/pythonAI';
import { omitEmptyFields } from './r2UrlUtils';
import {
    advancedConfigForPython,
    clientOverridesForPython,
    DEFAULT_PYTHON_IMAGE_OPTIONS,
    fontCustomizationForPython,
    showBrandingForPython,
} from './pythonGraphicsDefaults';

/**
 * Build the exact JSON body Python POST /api/v1/standings/generate expects.
 * @see docs/paths/quickPT.yaml — components.schemas.PythonStandingsGenerateRequest
 */
export function buildPythonStandingsPayload(request: StandingsRequest): Record<string, unknown> {
    return omitEmptyFields({
        template_url: request.template_url,
        template_config_url: request.template_config_url,
        format_type: request.format_type,
        team_data: request.team_data,
        event_name: request.event_name,
        organiser_name: request.organiser_name,
        sponsor_name: request.sponsor_name,
        table_font_size: request.table_font_size,
        table_header_font_size: request.table_header_font_size,
        table_header_label_mode: request.table_header_label_mode,
        table_header_column_padding: request.table_header_column_padding,
        row_height_adjust: request.row_height_adjust,
        team_logo_size: request.team_logo_size,
        team_logo_size_adjust: request.team_logo_size_adjust,
        team_logo_gap: request.team_logo_gap,
        team_shift_right: request.team_shift_right,
        chicken_dinner_icon_size: request.chicken_dinner_icon_size,
        chicken_icon_gap: request.chicken_icon_gap,
        element_overrides: clientOverridesForPython(
            request.element_overrides as Record<string, unknown> | null | undefined,
        ),
        column_overrides: request.column_overrides,
        font_customization: fontCustomizationForPython(
            request.font_customization as Record<string, unknown> | null | undefined,
        ),
        advanced_config: advancedConfigForPython(
            request.template_config_url,
            request.advanced_config as Record<string, unknown> | null | undefined,
        ),
        show_branding: showBrandingForPython(request.show_branding),
        output_filename: request.output_filename,
        options: request.options,
    });
}

export function buildStandingsRequest(
    templateUrl: string,
    configUrl: string,
    formatType: StandingsRequest['format_type'],
    teamData: StandingsTeamData[],
    options: StandingsExportOptions = {},
): StandingsRequest {
    return {
        template_url: templateUrl,
        template_config_url: configUrl,
        format_type: formatType,
        team_data: teamData,
        ...(options.outputFilename && { output_filename: options.outputFilename }),
        ...(options.eventName && { event_name: options.eventName }),
        ...(options.organiserName && { organiser_name: options.organiserName }),
        ...(options.sponsorName && { sponsor_name: options.sponsorName }),
        ...(options.tableFontSize != null && { table_font_size: options.tableFontSize }),
        ...(options.tableHeaderFontSize != null && { table_header_font_size: options.tableHeaderFontSize }),
        ...(options.tableHeaderLabelMode != null && { table_header_label_mode: options.tableHeaderLabelMode }),
        ...(options.tableHeaderColumnPadding != null && { table_header_column_padding: options.tableHeaderColumnPadding }),
        ...(options.rowHeightAdjust != null && { row_height_adjust: options.rowHeightAdjust }),
        ...(options.teamLogoSize != null && { team_logo_size: options.teamLogoSize }),
        ...(options.teamLogoSizeAdjust != null && { team_logo_size_adjust: options.teamLogoSizeAdjust }),
        ...(options.teamLogoGap != null && { team_logo_gap: options.teamLogoGap }),
        ...(options.teamShiftRight != null && { team_shift_right: options.teamShiftRight }),
        ...(options.chickenDinnerIconSize != null && { chicken_dinner_icon_size: options.chickenDinnerIconSize }),
        ...(options.chickenIconGap != null && { chicken_icon_gap: options.chickenIconGap }),
        ...(options.elementOverrides && { element_overrides: options.elementOverrides }),
        ...(options.columnOverrides && { column_overrides: options.columnOverrides }),
        ...(options.fontCustomization && { font_customization: options.fontCustomization }),
        ...(options.advancedConfig && { advanced_config: options.advancedConfig }),
        ...(options.showBranding != null && { show_branding: options.showBranding }),
        options: { ...DEFAULT_PYTHON_IMAGE_OPTIONS },
    };
}
