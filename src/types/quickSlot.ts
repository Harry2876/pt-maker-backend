export interface QuickSlotCache {
    id: string;
    quickMatchId: string;
    slotNumber: number;
    teamName: string;
    playerNames?: string[];
    status: SlotStatus;
    detectedInAttendance: boolean;
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

/** Slot list item — includes logo fields and signed preview URLs for client display. */
export interface QuickSlotListItem extends QuickSlotCache {
    logoPresetEntryId: string | null;
    matchLogoStorageUrl: string | null;
    presetLogoStorageUrl: string | null;
    /** Effective raw logo URL (match logo overrides preset). Used by Python generation. */
    logoStorageUrl: string | null;
    fileId: string | null;
    previewUrl: string | null;
    signedUrl: string | null;
    /** @deprecated Use previewUrl — kept for Android backward compatibility */
    signedLogoUrl: string | null;
    expiresAt: string | null;
    previewUrlExpiresInSeconds: number | null;
}

export interface CreateQuickSlotData {
    slotNumber: number;
    teamName: string;
    playerNames?: string[];
}

export interface UpdateQuickSlotData {
    teamName?: string;
    playerNames?: string[];
    status?: SlotStatus;
    detectedInAttendance?: boolean;
}

export type SlotStatus = 
    | 'PENDING'
    | 'DETECTED'
    | 'MATCHED'
    | 'NOT_FOUND';

// Bulk slot upload
export interface BulkSlotUpload {
    slots: CreateQuickSlotData[];
}

export interface CopySlotsResult {
    slotsCopied: number;
    sourceMatchId: string;
    targetMatchId: string;
    slotCount: number;
}

// Slot text parser result
export interface ParsedSlot {
    slotNumber: number;
    teamName: string;
    rawText: string;
}