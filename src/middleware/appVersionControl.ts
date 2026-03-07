import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import logger from '../utils/logger';
import { ResponseHelper } from '../utils/responseHelper';

// Extend Express Request type following your pattern
declare global {
    namespace Express {
        interface Request {
            appVersion?: string;
        }
    }
}

export const checkAppVersion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Extract app version from JWT token if user is authenticated
        if (req.user && req.headers.authorization) {
            const token = req.headers.authorization.substring(7);
            const decoded = await authService.verifySessionToken(token);
            req.appVersion = (decoded as any).appVersion;
        }
        
        // Check if version enforcement is enabled
        const versionCheck = await authService.checkAppVersionRequirements(
            req.appVersion || 'unknown'
        );
        
        if (!versionCheck.allowed) {
            res.status(426).json(ResponseHelper.error(
                versionCheck.message || 'App update required',
                'APP_UPDATE_REQUIRED'
            ));
            return;
        }
        
        // Log for analytics
        if (req.appVersion) {
            logger.info(`API call from app version: ${req.appVersion}`);
        }
        
        next();
    } catch (error) {
        logger.error('App version check error:', error);
        // Fail open - don't block users if version check fails
        next();
    }
};