import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodType } from 'zod';
import logger from '../utils/logger';

// Enhanced validation middleware that can handle body, params, and query
export const validateRequest = (schema: ZodType, target: 'body' | 'params' | 'query' = 'body') => {
    return (req: Request, res: Response, next: NextFunction): void | Response => {
        try {
            let dataToValidate;
            
            switch (target) {
                case 'body':
                    dataToValidate = req.body;
                    break;
                case 'params':
                    dataToValidate = req.params;
                    break;
                case 'query':
                    dataToValidate = req.query;
                    break;
                default:
                    dataToValidate = req.body;
            }

            const validatedData = schema.parse(dataToValidate);
            
            // Replace with validated data
            if (target === 'body') {
                req.body = validatedData;
            } else if (target === 'params') {
                req.params = validatedData as { [key: string]: string };
            } else if (target === 'query') {
                req.query = validatedData as { [key: string]: any };
            }
            
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid ${target} data`,
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