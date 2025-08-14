import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import logger from '../utils/logger';

// Extend Express Request type to include user data
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                phoneNumber: string;
                username: string;
                fullName: string;
                organization?: string;
                fromCache: boolean;
            };
        }
    }
}

// Main authentication middleware for protected routes
export const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                error: 'Authorization token required',
                message: 'Please provide a valid Bearer token in the Authorization header'
            });
        }

        const token = authHeader.substring(7);
        
        // Verify the access token using your custom auth service
        const sessionData = authService.verifySessionToken(token);
        
        // Get user details from your system (cache first, then DB)
        const user = await authService.getUserByPhone(sessionData.phoneNumber);
        
        if (!user) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid or expired token',
                message: 'User not found'
            });
        }

        // Add user data to request object
        req.user = {
            id: user.id,
            phoneNumber: user.phoneNumber,
            username: user.username,
            fullName: user.fullName,
            organization: user.organization || undefined,
            fromCache: user.fromCache
        };

        logger.info(`User ${user.username} authenticated successfully`);
        return next();
        
    } catch (error) {
        logger.error('Authentication middleware error:', error);
        return res.status(401).json({ 
            success: false,
            error: 'Authentication failed',
            message: error instanceof Error ? error.message : 'Invalid access token'
        });
    }
};

// Optional middleware - doesn't throw error if no token (for public endpoints that can benefit from user context)
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const sessionData = authService.verifyAccessToken(token);
            const user = await authService.getUserByPhone(sessionData.phoneNumber);
            
            if (user) {
                req.user = {
                    id: user.id,
                    phoneNumber: user.phoneNumber,
                    username: user.username,
                    fullName: user.fullName,
                    organization: user.organization || undefined,
                    fromCache: user.fromCache
                };
                logger.info(`Optional auth successful for ${user.username}`);
            }
        }
        
        return next();
        
    } catch (error) {
        // Don't throw error for optional auth, just log it
        logger.warn('Optional auth failed:', error);
        return next();
    }
};
