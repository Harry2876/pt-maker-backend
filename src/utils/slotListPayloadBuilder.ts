import {
    SlotListExportOptions,
    SlotListRequest,
    SlotListSlotData,
} from '../types/pythonAI';
import { omitEmptyFields } from './r2UrlUtils';
import {
    clientOverridesForPython,
    DEFAULT_SLOT_LIST_OPTIONS,
    fontCustomizationForPython,
    logoOverridesForPython,
    showBrandingForPython,
    socialOverridesForPython,
} from './pythonGraphicsDefaults';

const DEFAULT_SLOT_LIST_OPTIONS_TYPED = DEFAULT_SLOT_LIST_OPTIONS;

/**
 * Build internal SlotListRequest from signed template URLs + slot data + styling opts.
 * Mirrors buildStandingsRequest() in standingsPayloadBuilder.ts.
 */
export function buildSlotListRequest(
    templateUrl: string,
    configUrl: string,
    slotData: SlotListSlotData[],
    options: SlotListExportOptions = {},
): SlotListRequest {
    return {
        template_url: templateUrl,
        template_config_url: configUrl,
        slot_data: slotData,
        ...(options.headerOverrides != null && { header_overrides: options.headerOverrides }),
        ...(options.elementOverrides != null && { element_overrides: options.elementOverrides }),
        ...(options.slotNumberFontSize != null && { slot_number_font_size: options.slotNumberFontSize }),
        ...(options.teamNameFontSize != null && { team_name_font_size: options.teamNameFontSize }),
        ...(options.slotNumberColor != null && { slot_number_color: options.slotNumberColor }),
        ...(options.teamNameColor != null && { team_name_color: options.teamNameColor }),
        ...(options.teamLogoGap != null && { team_logo_gap: options.teamLogoGap }),
        ...(options.teamLogoSize != null && { team_logo_size: options.teamLogoSize }),
        ...(options.gridOverrides != null && { grid_overrides: options.gridOverrides }),
        ...(logoOverridesForPython(options.orgLogoOverrides) != null && {
            org_logo_overrides: logoOverridesForPython(options.orgLogoOverrides),
        }),
        ...(logoOverridesForPython(options.sponsorLogoOverrides) != null && {
            sponsor_logo_overrides: logoOverridesForPython(options.sponsorLogoOverrides),
        }),
        ...(socialOverridesForPython(options.socialOverrides) != null && {
            social_overrides: socialOverridesForPython(options.socialOverrides),
        }),
        ...(options.fontCustomization != null && { font_customization: options.fontCustomization }),
        ...(options.showBranding != null && { show_branding: options.showBranding }),
        ...(options.outputFilename && { output_filename: options.outputFilename }),
        options: DEFAULT_SLOT_LIST_OPTIONS_TYPED,
    };
}

/**
 * Build the exact JSON body Python POST /api/v1/slot-list/generate expects.
 * Omits null/undefined keys — Python rejects explicit nulls.
 */
export function buildPythonSlotListPayload(request: SlotListRequest): Record<string, unknown> {
    return omitEmptyFields({
        template_url: request.template_url,
        template_config_url: request.template_config_url,
        slot_data: request.slot_data.map(row =>
            omitEmptyFields({
                slot_number: row.slot_number,
                team_name: row.team_name,
                team_logo_url: row.team_logo_url,
            })
        ),
        header_overrides: clientOverridesForPython(
            request.header_overrides as Record<string, unknown> | null | undefined,
        ),
        element_overrides: clientOverridesForPython(
            request.element_overrides as Record<string, unknown> | null | undefined,
        ),
        slot_number_font_size: request.slot_number_font_size,
        team_name_font_size: request.team_name_font_size,
        slot_number_color: request.slot_number_color,
        team_name_color: request.team_name_color,
        team_logo_gap: request.team_logo_gap,
        team_logo_size: request.team_logo_size,
        grid_overrides: clientOverridesForPython(
            request.grid_overrides as Record<string, unknown> | null | undefined,
        ),
        org_logo_overrides: request.org_logo_overrides,
        sponsor_logo_overrides: request.sponsor_logo_overrides,
        social_overrides: request.social_overrides,
        font_customization: fontCustomizationForPython(
            request.font_customization as Record<string, unknown> | null | undefined,
        ),
        show_branding: showBrandingForPython(request.show_branding),
        output_filename: request.output_filename,
        options: request.options,
    });
}
