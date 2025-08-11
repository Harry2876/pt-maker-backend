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
            };
        }
    }
}

export const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Authorization token required',
                message: 'Please provide a valid Bearer token in the Authorization header'
            });
        }

        const token = authHeader.substring(7);
        
        // Verify the session token
        const sessionData = authService.verifySessionToken(token);
        
        // Get user details
        const user = await authService.getUserByPhone(sessionData.phoneNumber);
        
        if (!user || !user.isActive) {
            return res.status(401).json({ 
                error: 'Invalid or expired token',
                message: 'User not found or account is inactive'
            });
        }

        // Add user data to request object
        req.user = {
            id: user.id,
            phoneNumber: user.phoneNumber,
            username: user.username,
            fullName: user.fullName,
            organization: user.organization || undefined
        };

        return next();
        
    } catch (error) {
        logger.error('Authentication middleware error:', error);
        return res.status(401).json({ 
            error: 'Authentication failed',
            message: error instanceof Error ? error.message : 'Invalid token'
        });
    }
};

// Optional middleware - doesn't throw error if no token
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const sessionData = authService.verifySessionToken(token);
            const user = await authService.getUserByPhone(sessionData.phoneNumber);
            
            if (user && user.isActive) {
                req.user = {
                    id: user.id,
                    phoneNumber: user.phoneNumber,
                    username: user.username,
                    fullName: user.fullName,
                    organization: user.organization || undefined
                };
            }
        }
        
        return next();
        
    } catch (error) {
        // Don't throw error for optional auth, just log it
        logger.warn('Optional auth failed:', error);
        return next();
    }
};
