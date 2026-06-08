import { StandingsRequest } from '../types/pythonAI';
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
