import {
    TeamListExportOptions,
    TeamListRequest,
    TeamListTeamData,
} from '../types/pythonAI';
import { omitEmptyFields } from './r2UrlUtils';
import { DEFAULT_PYTHON_IMAGE_OPTIONS } from './pythonGraphicsDefaults';
import { advancedConfigForPython } from './advancedConfigForPython';

const DEFAULT_TEAM_LIST_OPTIONS = DEFAULT_PYTHON_IMAGE_OPTIONS;

/** Build internal TeamListRequest from raw template URLs + team data + styling opts. */
export function buildTeamListRequest(
    templateUrl: string,
    configUrl: string,
    teamData: TeamListTeamData[],
    options: TeamListExportOptions = {},
    outputFilename?: string,
): TeamListRequest {
    return {
        template_url: templateUrl,
        template_config_url: configUrl,
        team_data: teamData,
        ...(options.headerOverrides != null && { header_overrides: options.headerOverrides }),
        ...(options.headerStyle != null && { header_style: options.headerStyle }),
        ...(options.footerOverrides != null && { footer_overrides: options.footerOverrides }),
        ...(options.footerStyle != null && { footer_style: options.footerStyle }),
        ...(options.teamLogoSize != null && { team_logo_size: options.teamLogoSize }),
        ...(options.teamNameFontSize != null && { team_name_font_size: options.teamNameFontSize }),
        ...(options.teamNameColor != null && { team_name_color: options.teamNameColor }),
        ...(options.cardOverrides != null && { card_overrides: options.cardOverrides }),
        ...(options.fontCustomization != null && { font_customization: options.fontCustomization }),
        ...(options.showBranding != null && { show_branding: options.showBranding }),
        ...(options.advancedConfig != null && { advanced_config: options.advancedConfig }),
        ...(outputFilename && { output_filename: outputFilename }),
        ...(!outputFilename && options.outputFilename && { output_filename: options.outputFilename }),
        options: DEFAULT_TEAM_LIST_OPTIONS,
    };
}

/** Build the exact JSON body Python POST /api/v1/team-list/generate expects. */
export function buildPythonTeamListPayload(request: TeamListRequest): Record<string, unknown> {
    return omitEmptyFields({
        template_url: request.template_url,
        template_config_url: request.template_config_url,
        team_data: request.team_data.map(row =>
            omitEmptyFields({
                slot: row.slot,
                team_name: row.team_name,
                team_logo_url: row.team_logo_url,
            })
        ),
        header_overrides: request.header_overrides,
        header_style: request.header_style,
        footer_overrides: request.footer_overrides,
        footer_style: request.footer_style,
        team_logo_size: request.team_logo_size,
        team_name_font_size: request.team_name_font_size,
        team_name_color: request.team_name_color,
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
