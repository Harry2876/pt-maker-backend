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

// Slot text parser result
export interface ParsedSlot {
    slotNumber: number;
    teamName: string;
    rawText: string;
}