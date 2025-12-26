import { QuickMatchStatus } from '@prisma/client';

export interface StateTransition {
    from: QuickMatchStatus;
    to: QuickMatchStatus;
    conditions?: StateTransitionCondition[];
    requiredData?: string[];
}

export interface StateTransitionCondition {
    field: string;
    operator: 'exists' | 'equals' | 'greaterThan' | 'lessThan';
    value?: any;
    errorMessage: string;
}

export interface StateValidationResult {
    isValid: boolean;
    errorMessage?: string;
    errorCode?: string;
    missingRequirements?: string[];
}

export interface StateTransitionResult extends StateValidationResult {
    previousState: QuickMatchStatus;
    newState: QuickMatchStatus;
    transitionTime: string;
}

// Define all valid transitions
export type ValidTransition = 
    | { from: 'CREATED', to: 'SLOTS_UPLOADED' }
    | { from: 'SLOTS_UPLOADED', to: 'ATTENDANCE_UPLOADED' }
    | { from: 'ATTENDANCE_UPLOADED', to: 'RESULTS_UPLOADED' }
    | { from: 'RESULTS_UPLOADED', to: 'PROCESSING' }
    | { from: 'PROCESSING', to: 'COMPLETED' }
    | { from: 'PROCESSING', to: 'ERROR' }
    | { from: 'ERROR', to: 'PROCESSING' }  // Allow retry from error
    | { from: 'CREATED' | 'SLOTS_UPLOADED' | 'ATTENDANCE_UPLOADED' | 'RESULTS_UPLOADED', to: 'CANCELLED' }; // Allow cancellation before processing

export interface QuickMatchStateContext {
    id: string;
    currentStatus: QuickMatchStatus;
    slotsCount?: number;
    attendanceScreenshotsCount?: number;
    resultScreenshotsCount?: number;
    processingStep?: string;
    teamsDetected?: number;
}