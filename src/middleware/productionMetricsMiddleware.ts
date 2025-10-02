import { Request, Response, NextFunction } from 'express';
import { ProductionMetricsService } from '../services/productionMetricsService';

export const productionMetricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Skip health checks and static files
    if (req.path === '/health' || req.path === '/favicon.ico') {
        return next();
    }
    
    // Override res.end to capture metrics
    const originalEnd = res.end.bind(res);
    
    res.end = function(this: Response, chunk?: any, encoding?: BufferEncoding | (() => void), cb?: (() => void)): Response {
        const responseTime = Date.now() - startTime;
        
        // Track API performance
        ProductionMetricsService.trackAPIPerformance(
            req.method,
            req.route?.path || req.path,
            res.statusCode,
            responseTime
        );
        
        // Track errors
        if (res.statusCode >= 400) {
            ProductionMetricsService.trackError(
                `http_${res.statusCode}`,
                `HTTP ${res.statusCode} error`,
                {
                    method: req.method,
                    path: req.path,
                    userAgent: req.get('User-Agent'),
                    ip: req.ip
                }
            );
        }
        
        // Call original end method with proper return
        return originalEnd(chunk, encoding as BufferEncoding, cb);
    };
    
    next();
};