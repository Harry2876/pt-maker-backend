export type TemplatePresetGraphicType =
    | 'STANDINGS'
    | 'SERIES_STANDINGS'
    | 'SLOT_LIST'
    | 'ROSTER'
    | 'TOP_10';

export interface TemplatePresetSummary {
    id: string;
    name: string;
    graphicType: TemplatePresetGraphicType;
    template: string;
    formatType: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface TemplatePresetDetail extends TemplatePresetSummary {
    userId: string;
    formValues: Record<string, unknown>;
}

export interface CreateTemplatePresetData {
    name: string;
    graphicType: TemplatePresetGraphicType;
    template: string;
    formatType?: string | null;
    formValues: Record<string, unknown>;
}

export interface UpdateTemplatePresetData {
    name?: string;
    formValues?: Record<string, unknown>;
}

export interface ListTemplatePresetsQuery {
    graphicType: TemplatePresetGraphicType;
    template: string;
    formatType?: string;
}
