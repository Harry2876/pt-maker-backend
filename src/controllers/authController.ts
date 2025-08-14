import { Request, Response } from 'express';
import { authService } from '../services/authService';
import { handleControllerError, asyncHandler } from '../middleware/commonMiddleware';
import logger from '../utils/logger';

export class AuthController {
    static sendOTP = asyncHandler(async (req: Request, res: Response) => {
        const { phoneNumber, type } = req.body; // Already validated by middleware

        const result = await authService.sendOTP(phoneNumber, type);

        return res.json({
            success: true,
            message: 'OTP sent successfully',
            data: result
        });
    });

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

        if (!result) {
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
}