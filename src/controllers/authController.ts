import { Request, Response } from 'express';
import { authService } from '../services/authService';
import { handleControllerError, asyncHandler } from '../middleware/commonMiddleware';
import logger from '../utils/logger';
import { success } from 'zod';

export class AuthController {
    static sendOTP = async (req: Request, res: Response) => {
        try {
            const { phoneNumber, type } = req.body; // Already validated by middleware

            const result = await authService.sendOTP(phoneNumber, type);

            return res.json({
                success: true,
                message: `OTP sent successfully for ${type}`,
                data: result
            });
        } catch (error: any) {
            // Handle specific user existence errors
            if (error.message.includes('already exists')) {
                return res.status(409).json({
                    success: false,
                    message: error.message,
                    errorCode: 'USER_EXISTS',
                    suggestion: 'Try using login instead'
                });
            }

            if (error.message.includes('No account found')) {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                    errorCode: 'USER_NOT_FOUND',
                    suggestion: 'Try using registration instead'
                });
            }

            // Handle other errors
            logger.error('Send OTP error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to send OTP',
                errorCode: 'OTP_SEND_FAILED'
            });
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
            return res.status(400).json({
                success: false,
                message: result.message,
                errorCode: result.errorCode
            });
        }

        if (!result || !result.user) {
            return res.status(400).json({
                success: false,
                message: 'OTP verification failed'
            });
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

        return res.json({
            success: true,
            user: {
                id: result.user.id,
                phoneNumber: result.user.phoneNumber,
                username: result.user.username,
                fullName: result.user.fullName,
                organization: result.user.organization
            },
            token: tokenPair,
            type: result.type,
            message: result.message
        });
    });

    static async getProfile(req: Request, res: Response) {
        try {
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({
                    success: false,
                    message: 'Unauthorized!! Auth Token Required'
                });
            }

            const token = authHeader.substring(7);
            const sessionData = await authService.verifySessionToken(token);
            const user = await authService.getUserByPhone(sessionData.phoneNumber);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            return res.json({
                success: true,
                message: 'User profile retrieved successfully',
                user: {
                    id: user.id,
                    phoneNumber: user.phoneNumber,
                    username: user.username,
                    fullName: user.fullName,
                    organization: user.organization
                }
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: error.message || 'Failed to get profile'
            });
        }
    }
    static refreshToken = asyncHandler(async (req: Request, res: Response) => {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token is required'
            });
        }

        const result = await authService.refreshAccessToken(refreshToken);

        return res.json({
            success: true,
            message: 'Token refreshed successfully',
            data: result
        });
    });

    static logout = asyncHandler(async (req: Request, res: Response) => {
        const sessionData = await authService.verifySessionToken(
            req.headers.authorization!.substring(7)
        );
        await authService.revokeSession(sessionData.sessionId);

        return res.json({
            success: true,
            message: 'Logged out successfully'
        });
    });

    static logoutAll = asyncHandler(async (req: Request, res: Response) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized!! Auth Token Required or User not Found'
            });
        }

        await authService.revokeAllUserSessions(req.user.id);

        return res.json({
            success: true,
            message: 'Logged out from all devices successfully'
        });
    });

    static getSessions = asyncHandler(async (req: Request, res: Response) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized!! Auth Token Required or User not Found'
            });
        }

        const sessions = await authService.getActiveSessions(req.user.id);
        return res.json({
            success: true,
            message: 'User sessions retrieved successfully',
            data: sessions
        });
    });
}