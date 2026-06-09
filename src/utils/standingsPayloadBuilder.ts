import { StandingsExportOptions, StandingsRequest, StandingsTeamData } from '../types/pythonAI';
import { omitEmptyFields } from './r2UrlUtils';

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
        row_height_adjust: request.row_height_adjust,
        element_overrides: request.element_overrides,
        column_overrides: request.column_overrides,
        advanced_config: request.advanced_config,
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
        ...(options.rowHeightAdjust != null && { row_height_adjust: options.rowHeightAdjust }),
        ...(options.elementOverrides && { element_overrides: options.elementOverrides }),
        ...(options.columnOverrides && { column_overrides: options.columnOverrides }),
        ...(options.advancedConfig && { advanced_config: options.advancedConfig }),
        options: { upload_to_r2: true },
    };
}
