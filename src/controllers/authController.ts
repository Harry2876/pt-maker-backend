import { Request, Response } from 'express';
import { authService } from '../services/authService';
import { handleControllerError, asyncHandler } from '../middleware/commonMiddleware';
import logger from '../utils/logger';
import { success } from 'zod';
import { ResponseHelper } from '../utils/responseHelper';

export class AuthController {
    static sendOTP = async (req: Request, res: Response) => {
        try {
            const { phoneNumber, type } = req.body; // Already validated by middleware

            const result = await authService.sendOTP(phoneNumber, type);

            return res.json(ResponseHelper.success(`OTP sent successfully for ${type}`, result));
        } catch (error: any) {
            // Handle specific user existence errors
            if (error.message.includes('already exists')) {
                return res.status(409).json(ResponseHelper.conflict(error.message));
            }

            if (error.message.includes('No account found')) {
                return res.status(404).json(ResponseHelper.notFound(error.message));
            }

            // Handle other errors
            logger.error('Send OTP error:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to send OTP'));
        }
    };

    static verifyOTP = asyncHandler(async (req: Request, res: Response) => {
        const { phoneNumber, otp, username, fullName, organization, password } = req.body;

        const userData = username ? {
            phoneNumber,
            username,
            fullName: fullName || '',
            organization,
            password: password || '',
        } : undefined;

        const result = await authService.verifyOTPAndAuth(
            { phoneNumber, otp, password },
            userData
        );

        // Handle warning responses (invalid OTP)
        if (result && result.type === 'warning') {
            return res.status(400).json(ResponseHelper.validationError(result.message, result.errorCode));
        }

        if (!result || !result.user) {
            return res.status(400).json(ResponseHelper.validationError('OTP verification failed'));
        }

        const deviceInfo = req.headers['user-agent'] || 'Unknown';
        const ipAddress = req.ip || 'Unknown';
        const tokenPair = await authService.generateTokenPair(
            result.user.id,
            phoneNumber,
            result.user.fromCache,
            deviceInfo,
            ipAddress
        );

        return res.json(ResponseHelper.success(result.message, {
            user: {
                id: result.user.id,
                phoneNumber: result.user.phoneNumber,
                username: result.user.username,
                fullName: result.user.fullName,
                organization: result.user.organization
            },
            tokens: tokenPair,
            type: result.type
        }));
    });

    static login = asyncHandler(async (req: Request, res: Response) => {
        const { phoneNumber, password } = req.body;

        const result = await authService.authenticateUser(phoneNumber, password);

        if (!result.success) {
            return res.status(401).json(ResponseHelper.unauthorized(result.message));
        }

        const deviceInfo = req.headers['user-agent'] || 'Unknown';
        const ipAddress = req.ip || 'Unknown';

        const tokenPair = await authService.generateTokenPair(
            result.user!.id,
            result.user!.phoneNumber,
            result.user!.fromCache,
            deviceInfo,
            ipAddress
        );

        return res.json(ResponseHelper.success('Login successful', {
            user: {
                id: result.user!.id,
                phoneNumber: result.user!.phoneNumber,
                username: result.user!.username,
                fullName: result.user!.fullName,
                organization: result.user!.organization
            },
            tokens: tokenPair,
            type: 'login'
        }));
    });

    static async getProfile(req: Request, res: Response) {
        try {
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json(ResponseHelper.unauthorized('Auth Token Required'));
            }

            const token = authHeader.substring(7);
            const sessionData = await authService.verifySessionToken(token);
            const user = await authService.getUserByPhone(sessionData.phoneNumber);

            if (!user) {
                return res.status(404).json(ResponseHelper.notFound('User not found'));
            }

            return res.json(ResponseHelper.success('User profile retrieved successfully', {
                user: {
                    id: user.id,
                    phoneNumber: user.phoneNumber,
                    username: user.username,
                    fullName: user.fullName,
                    organization: user.organization
                }
            }));
        } catch (error: any) {
            return res.status(500).json(ResponseHelper.serverError(error.message || 'Failed to get profile'));
        }
    }
    static refreshToken = asyncHandler(async (req: Request, res: Response) => {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json(ResponseHelper.validationError('Refresh token is required'));
        }

        const result = await authService.refreshAccessToken(refreshToken);

        return res.json(ResponseHelper.success('Token refreshed successfully', result));
    });

    static logout = asyncHandler(async (req: Request, res: Response) => {
        const sessionData = await authService.verifySessionToken(
            req.headers.authorization!.substring(7)
        );
        await authService.revokeSession(sessionData.sessionId);

        return res.json(ResponseHelper.success('Logged out successfully'));
    });

    static logoutAll = asyncHandler(async (req: Request, res: Response) => {
        if (!req.user) {
            return res.status(401).json(ResponseHelper.unauthorized('Auth Token Required or User not Found'));
        }

        await authService.revokeAllUserSessions(req.user.id);

        return res.json(ResponseHelper.success('Logged out from all devices successfully'));
    });

    static getSessions = asyncHandler(async (req: Request, res: Response) => {
        if (!req.user) {
            return res.status(401).json(ResponseHelper.unauthorized('Auth Token Required or User not Found'));
        }

        const sessions = await authService.getActiveSessions(req.user.id);
        return res.json(ResponseHelper.success('User sessions retrieved successfully', sessions));
    });
}