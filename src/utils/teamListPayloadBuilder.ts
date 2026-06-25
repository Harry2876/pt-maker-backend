import {
    TeamListExportOptions,
    TeamListRequest,
    TeamListTeamData,
} from '../types/pythonAI';
import { omitEmptyFields } from './r2UrlUtils';
import {
    advancedConfigForPython,
    clientOverridesForPython,
    DEFAULT_PYTHON_IMAGE_OPTIONS,
    fontCustomizationForPython,
    showBrandingForPython,
} from './pythonGraphicsDefaults';

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
        header_overrides: clientOverridesForPython(
            request.header_overrides as Record<string, unknown> | null | undefined,
        ),
        header_style: clientOverridesForPython(
            request.header_style as Record<string, unknown> | null | undefined,
        ),
        footer_overrides: clientOverridesForPython(
            request.footer_overrides as Record<string, unknown> | null | undefined,
        ),
        footer_style: clientOverridesForPython(
            request.footer_style as Record<string, unknown> | null | undefined,
        ),
        team_logo_size: request.team_logo_size,
        team_name_font_size: request.team_name_font_size,
        team_name_color: request.team_name_color,
        card_overrides: clientOverridesForPython(
            request.card_overrides as Record<string, unknown> | null | undefined,
        ),
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
