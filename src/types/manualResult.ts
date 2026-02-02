import { CreateQuickMatchResultData, UpdateQuickMatchResultData, QuickMatchResultCache } from './quickResult';


export interface CreateManualResultData extends CreateQuickMatchResultData {
    source: 'MANUAL_ENTRY';
    entryMethod: 'INDIVIDUAL' | 'BULK';
    enteredBy: string;
    entryNotes?: string;
}


export interface BulkResultCreationData {
    results: CreateManualResultData[];
    replaceExisting: boolean;
    validateConstraints: boolean;
}


export interface UpdateManualResultData extends UpdateQuickMatchResultData {
    entryNotes?: string;
    modifiedBy?: string;
}


export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

export interface ValidationError {
    field: string;
    code: string;
    message: string;
    value?: any;
}

export interface ValidationWarning {
    type: string;
    message: string;
    details?: any;
}


export interface PointsBreakdown {
    positionPoints: number;
    killPoints: number;
    totalPoints: number;
    calculation: {
        position: number;
        positionValue: number;
        totalKills: number;
        killValue: number;
    };
}


export interface BulkOperationResult {
    success: boolean;
    created: QuickMatchResultCache[];
    updated: QuickMatchResultCache[];
    errors: ValidationError[];
    summary: {
        total: number;
        successful: number;
        failed: number;
    };
}