/**
 * Expected business-rule failure — maps to a 4xx response, not a 500.
 */
export class ServiceError extends Error {
    readonly statusCode: number;
    readonly code: string;

    constructor(message: string, statusCode = 400, code = 'VALIDATION_ERROR') {
        super(message);
        this.name = 'ServiceError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

export function isServiceError(error: unknown): error is ServiceError {
    return error instanceof ServiceError;
}
