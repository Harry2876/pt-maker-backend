import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import logger from '../utils/logger';
import { ResponseHelper } from '../utils/responseHelper';

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
      requestId?: string;
    }
  }
}

// Main authentication middleware for protected routes
export const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const requestId = req.headers['x-request-id'] ?? '-';

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn(
        `Auth: missing token | ${req.method} ${req.path} | ip=${req.ip} [${requestId}]`
      );
      return res
        .status(401)
        .json(ResponseHelper.unauthorized('Authorization token required'));
    }

    const token = authHeader.substring(7);

    const sessionData = await authService.verifySessionToken(token);
    const user = await authService.getUserByPhone(sessionData.phoneNumber);

    if (!user) {
      logger.warn(
        `Auth: user not found | ${req.method} ${req.path} | ip=${req.ip} [${requestId}]`
      );
      return res
        .status(401)
        .json(ResponseHelper.unauthorized('Invalid or expired token'));
    }
    req.user = {
      id: user.id,
      phoneNumber: user.phoneNumber,
      username: user.username,
      fullName: user.fullName,
      organization: user.organization || undefined,
      fromCache: user.fromCache,
    };

    return next();
  } catch (error) {
    const requestId = req.headers['x-request-id'] ?? '-';
    logger.warn(`Auth: token verification failed | ${req.method} ${req.path} | ip=${req.ip} | error=${error instanceof Error ? error.message : 'unknown'} [${requestId}]`);
    return res.status(401).json(ResponseHelper.unauthorized(
        error instanceof Error ? error.message : 'Invalid access token'
    ));
  }
};

// Optional middleware - doesn't throw error if no token (for public endpoints that can benefit from user context)
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const sessionData = await authService.verifySessionToken(token);
      const user = await authService.getUserByPhone(sessionData.phoneNumber);

      if (user) {
        req.user = {
          id: user.id,
          phoneNumber: user.phoneNumber,
          username: user.username,
          fullName: user.fullName,
          organization: user.organization || undefined,
          fromCache: user.fromCache,
        };
        logger.debug(`Optional auth successful for ${user.username}`);
      }
    }

    return next();
  } catch (error) {
    // Don't throw error for optional auth, just log it
    logger.warn('Optional auth failed:', error);
    return next();
  }
};
