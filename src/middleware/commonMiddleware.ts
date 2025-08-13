import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodType } from 'zod';
import logger from '../utils/logger';

// Generic validation middleware
export const validateRequest = (schema: ZodType) => {
    return (req: Request, res: Response, next: NextFunction): void | Response => {
        try {
            const validatedData = schema.parse(req.body);
            req.body = validatedData; // Replace with validated data
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid request data',
                    details: error.issues.map((issue: any) => ({
                        field: issue.path.join('.'),
                        message: issue.message
                    }))
                });
            }

            logger.error('Validation middleware error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error during validation'
            });
        }
    };
};

// Generic error response handler
export const handleControllerError = (
    error: any,
    operation: string,
    res: Response
) => {
    const errorMessage = error instanceof Error ? error.message : `Failed to ${operation}`;
    logger.error(`${operation} Error:`, error);

    return res.status(500).json({
        success: false,
        message: errorMessage
    });
};

// Async wrapper to catch errors automatically
export const asyncHandler = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

// Global error handler middleware
export const globalErrorHandler = (
    error: any,
    _req: Request,
    res: Response,
    _next: NextFunction
) => {
    logger.error('Global error handler:', error);

    return res.status(500).json({
        success: false,
        message: 'Something went wrong',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
};