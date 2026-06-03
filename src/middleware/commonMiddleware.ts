import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodType } from 'zod';
import logger from '../utils/logger';
import { Sentry } from '../utils/instrument';
import { ResponseHelper } from '../utils/responseHelper';

declare global {
    namespace Express {
        interface Request {
            validatedQuery?: any;
        }
    }
}

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
                // Express 5.x compatibility: Don't reassign req.query directly
                // Instead, store validated data in a custom property
                (req as any).validatedQuery = validatedData;

                // For backward compatibility, also try to update individual properties
                try {
                    // Type guard and assertion
                    if (validatedData && typeof validatedData === 'object') {
                        const validatedObject = validatedData as Record<string, any>;
                        Object.keys(validatedObject).forEach(key => {
                            if (req.query && typeof req.query === 'object') {
                                (req.query as any)[key] = validatedObject[key];
                            }
                        });
                    }
                } catch (error) {
                    // If assignment fails, validation still passed, so continue
                    logger.warn('Query parameter assignment failed (Express 5.x compatibility mode):', error);
                }
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
    logger.error('Unhandled error:', error);

    // Send to Sentry — only real server errors, not expected client errors
    if (!error.status || error.status >= 500) {
        Sentry.captureException(error);
        // Flush so the event is sent before the response is returned
        Sentry.flush(2000).catch(() => {});
    }

    return res.status(error.status ?? 500).json(
        ResponseHelper.serverError(
            process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        )
    );
};