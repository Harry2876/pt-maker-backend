import { QuickMatchStatus } from '@prisma/client';
import { BaseService } from './baseService';
import {
    StateTransition,
    StateValidationResult,
    StateTransitionResult,
    ValidTransition,
    QuickMatchStateContext,
    StateTransitionCondition
} from '../types/stateMachine';
import { quickSeriesService } from './quickSeriesService';

export class QuickMatchStateMachine extends BaseService {
    private static instance: QuickMatchStateMachine;

    // Singleton pattern following your architecture
    public static getInstance(): QuickMatchStateMachine {
        if (!QuickMatchStateMachine.instance) {
            QuickMatchStateMachine.instance = new QuickMatchStateMachine();
        }
        return QuickMatchStateMachine.instance;
    }

    // Define all valid state transitions with conditions
    private readonly transitions: StateTransition[] = [
        {
            from: 'CREATED',
            to: 'SLOTS_UPLOADED',
            conditions: [
                {
                    field: 'slotsCount',
                    operator: 'greaterThan',
                    value: 0,
                    errorMessage: 'Cannot transition to SLOTS_UPLOADED: No slots have been uploaded'
                }
            ]
        },
        {
            from: 'SLOTS_UPLOADED',
            to: 'ATTENDANCE_UPLOADED',
            conditions: [
                {
                    field: 'attendanceScreenshotsCount',
                    operator: 'greaterThan',
                    value: 0,
                    errorMessage: 'Cannot transition to ATTENDANCE_UPLOADED: No attendance screenshots uploaded'
                }
            ]
        },
        {
            from: 'ATTENDANCE_UPLOADED',
            to: 'RESULTS_UPLOADED',
            conditions: [
                {
                    field: 'resultScreenshotsCount',
                    operator: 'greaterThan',
                    value: 0,
                    errorMessage: 'Cannot transition to RESULTS_UPLOADED: No result screenshots uploaded'
                }
            ]
        },
        // Allow processing directly from attendance uploaded (for attendance processing)
        {
            from: 'ATTENDANCE_UPLOADED',
            to: 'PROCESSING'
        },
        // Allow processing directly from slots uploaded (for direct processing)
        {
            from: 'SLOTS_UPLOADED',
            to: 'PROCESSING'
        },
        {
            from: 'RESULTS_UPLOADED',
            to: 'PROCESSING',
            requiredData: ['slotsCount', 'attendanceScreenshotsCount', 'resultScreenshotsCount']
        },
        {
            from: 'PROCESSING',
            to: 'COMPLETED',
            conditions: [
                {
                    field: 'teamsDetected',
                    operator: 'greaterThan',
                    value: 0,
                    errorMessage: 'Cannot complete: No teams were detected in processing'
                },
                {
                    field: 'seriesProgressionValid',
                    operator: 'equals',
                    value: true,
                    errorMessage: 'Cannot complete: Series progression validation failed'
                }
            ]
        },
        {
            from: 'PROCESSING',
            to: 'ERROR',
            // No conditions - error state can be reached from processing at any time
        },
        {
            from: 'ERROR',
            to: 'PROCESSING',
            // Allow retry from error state
        },
        // Cancellation allowed before processing starts
        {
            from: 'CREATED',
            to: 'CANCELLED'
        },
        {
            from: 'SLOTS_UPLOADED',
            to: 'CANCELLED'
        },
        {
            from: 'ATTENDANCE_UPLOADED',
            to: 'CANCELLED'
        },
        {
            from: 'RESULTS_UPLOADED',
            to: 'CANCELLED'
        }
    ];

    /**
     * Validate if a state transition is allowed
     */
    public validateTransition(
        from: QuickMatchStatus,
        to: QuickMatchStatus,
        context?: QuickMatchStateContext
    ): StateValidationResult {
        try {
            // Find matching transition rule
            const transition = this.transitions.find(t => t.from === from && t.to === to);

            if (!transition) {
                return {
                    isValid: false,
                    errorCode: 'INVALID_STATE_TRANSITION',
                    errorMessage: `Invalid state transition from ${from} to ${to}. This transition is not allowed.`
                };
            }

            // Check conditions if they exist and context is provided
            if (transition.conditions && context) {
                for (const condition of transition.conditions) {
                    const validationResult = this.validateCondition(condition, context);
                    if (!validationResult.isValid) {
                        return validationResult;
                    }
                }
            }

            // Check required data
            if (transition.requiredData && context) {
                const missingData = transition.requiredData.filter(field =>
                    context[field as keyof QuickMatchStateContext] === undefined ||
                    context[field as keyof QuickMatchStateContext] === null
                );

                if (missingData.length > 0) {
                    return {
                        isValid: false,
                        errorCode: 'MISSING_REQUIRED_DATA',
                        errorMessage: `Missing required data for state transition: ${missingData.join(', ')}`,
                        missingRequirements: missingData
                    };
                }
            }

            return { isValid: true };
        } catch (error) {
            this.handleError(error, 'State transition validation');
            return {
                isValid: false,
                errorCode: 'VALIDATION_ERROR',
                errorMessage: 'An error occurred during state validation'
            };
        }
    }

    /**
     * Execute a state transition with validation
     */
    public async executeTransition(
        matchId: string,
        to: QuickMatchStatus,
        context: QuickMatchStateContext
    ): Promise<StateTransitionResult> {
        try {
            const from = context.currentStatus;

            // Validate the transition
            const validationResult = this.validateTransition(from, to, context);

            if (!validationResult.isValid) {
                return {
                    ...validationResult,
                    previousState: from,
                    newState: from, // State unchanged due to validation failure
                    transitionTime: new Date().toISOString()
                };
            }

            this.logger.info(`Executing state transition for match ${matchId}: ${from} → ${to}`);

            return {
                isValid: true,
                previousState: from,
                newState: to,
                transitionTime: new Date().toISOString()
            };
        } catch (error) {
            this.handleError(error, `State transition execution for match ${matchId}`);
            return {
                isValid: false,
                errorCode: 'TRANSITION_EXECUTION_ERROR',
                errorMessage: 'Failed to execute state transition',
                previousState: context.currentStatus,
                newState: context.currentStatus,
                transitionTime: new Date().toISOString()
            };
        }
    }

    /**
     * Get all possible next states from current state
     */
    public getValidNextStates(currentState: QuickMatchStatus): QuickMatchStatus[] {
        return this.transitions
            .filter(t => t.from === currentState)
            .map(t => t.to);
    }

    /**
     * Check if a state is a final state (no transitions possible)
     */
    public isFinalState(state: QuickMatchStatus): boolean {
        return !this.transitions.some(t => t.from === state);
    }

    private validateCondition(condition: StateTransitionCondition, context: QuickMatchStateContext): StateValidationResult {
        const value = context[condition.field as keyof QuickMatchStateContext];

        switch (condition.operator) {
            case 'exists':
                if (value === undefined || value === null) {
                    return {
                        isValid: false,
                        errorCode: 'MISSING_FIELD',
                        errorMessage: condition.errorMessage
                    };
                }
                break;

            case 'equals':
                if (value !== condition.value) {
                    return {
                        isValid: false,
                        errorCode: 'CONDITION_NOT_MET',
                        errorMessage: condition.errorMessage
                    };
                }
                break;

            case 'greaterThan':
                if (typeof value !== 'number' || value <= condition.value) {
                    return {
                        isValid: false,
                        errorCode: 'CONDITION_NOT_MET',
                        errorMessage: condition.errorMessage
                    };
                }
                break;

            case 'lessThan':
                if (typeof value !== 'number' || value >= condition.value) {
                    return {
                        isValid: false,
                        errorCode: 'CONDITION_NOT_MET',
                        errorMessage: condition.errorMessage
                    };
                }
                break;
        }

        return { isValid: true };
    }

    private async validateSeriesProgression(context: QuickMatchStateContext): Promise<boolean> {
    if (!context.seriesId) {
        return true; // Not part of series, always valid
    }

    try {
        const series = await quickSeriesService.getTournamentSeriesById(context.seriesId, context.userId!);
        
        if (!series) {
            this.logger.warn(`Series ${context.seriesId} not found during state validation`);
            return false;
        }

        // Validate series is still active and accepting completions
        if (series.status === 'COMPLETED' || series.status === 'CANCELLED') {
            this.logger.warn(`Cannot complete match: Series ${context.seriesId} is ${series.status}`);
            return false;
        }

        return true;
    } catch (error) {
        this.logger.error(`Series validation failed: ${(error as Error).message}`);
        return false;
    }
}
}

// Export singleton instance following your pattern
export const quickMatchStateMachine = QuickMatchStateMachine.getInstance();