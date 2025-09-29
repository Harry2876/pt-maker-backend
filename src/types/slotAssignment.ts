
export interface SlotAssignmentCache {
    id: string;
    slotNumber: number;        // 1-25
    groupId: string;
    teamRegistrationId?: string; // null for empty slots
    teamName?: string;         // For display purposes
    isActive: boolean;
    slotType: SlotType;
    assignedAt: string;
    assignedBy: string;        // User ID who assigned
    assignedByName?: string;   // For display purposes
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export enum SlotType {
    TEAM_SLOT = 'TEAM_SLOT',
    MANAGEMENT_SLOT = 'MANAGEMENT_SLOT',
    RESERVED_SLOT = 'RESERVED_SLOT'
}

export interface CreateSlotAssignmentData {
    slotNumber: number;
    groupId: string;
    teamRegistrationId?: string;
    slotType?: SlotType;
}

export interface UpdateSlotAssignmentData {
    teamRegistrationId?: string; // null to make slot empty
    isActive?: boolean;
}

// Bulk slot assignment operations
export interface BulkSlotAssignmentData {
    groupId: string;
    assignments: SlotAssignmentOperation[];
}

export interface SlotAssignmentOperation {
    slotNumber: number;
    teamRegistrationId?: string; // null for empty slot
    action: 'ASSIGN' | 'UNASSIGN' | 'SWAP';
}

// Slot assignment validation
export interface SlotAssignmentValidation {
    isValid: boolean;
    errors: SlotAssignmentError[];
    warnings: SlotAssignmentWarning[];
}

export interface SlotAssignmentError {
    slotNumber: number;
    teamRegistrationId?: string;
    error: 'SLOT_OCCUPIED' | 'TEAM_ALREADY_ASSIGNED' | 'INVALID_SLOT_NUMBER' | 'TEAM_NOT_FOUND';
    message: string;
}

export interface SlotAssignmentWarning {
    slotNumber: number;
    teamRegistrationId?: string;
    warning: 'EMPTY_SLOT' | 'TEAM_MOVED' | 'SLOT_REUSED';
    message: string;
}

// Group slot layout
export interface GroupSlotLayout {
    groupId: string;
    groupName: string;
    maxSlots: number;
    assignedSlots: number;
    emptySlots: number;
    slots: SlotWithTeamInfo[];
}

export interface SlotWithTeamInfo {
    slotNumber: number;
    teamRegistrationId?: string;
    teamName?: string;
    playerCount?: number;
    isActive: boolean;
    assignedAt?: string;
    assignedBy?: string;
}

// Auto slot assignment
export interface AutoSlotAssignmentConfig {
    groupId: string;
    strategy: 'RANDOM' | 'BALANCED' | 'SKILL_BASED' | 'MANUAL_ORDER';
    excludeSlots?: number[];     // Slots to keep empty
    teamPriorities?: TeamPriority[];
}

export interface TeamPriority {
    teamRegistrationId: string;
    priority: number;           // Higher number = higher priority
    preferredSlots?: number[];  // Preferred slot numbers
}

export interface AutoSlotAssignmentResult {
    success: boolean;
    assignedCount: number;
    assignments: SlotAssignmentCache[];
    errors: string[];
}

// Slot swap operations
export interface SlotSwapRequest {
    groupId: string;
    slot1: number;
    slot2: number;
    reason?: string;
}

export interface SlotSwapResult {
    success: boolean;
    swappedSlots: {
        slot1: SlotWithTeamInfo;
        slot2: SlotWithTeamInfo;
    };
    message: string;
}

// Slot assignment history
export interface SlotAssignmentHistory {
    id: string;
    groupId: string;
    slotNumber: number;
    previousTeamId?: string;
    newTeamId?: string;
    action: 'ASSIGNED' | 'UNASSIGNED' | 'SWAPPED';
    performedBy: string;
    performedAt: string;
    reason?: string;
}

// Slot availability check
export interface SlotAvailability {
    groupId: string;
    availableSlots: number[];
    occupiedSlots: SlotWithTeamInfo[];
    totalSlots: number;
    maxAllowedSlots: number;
}