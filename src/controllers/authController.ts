import { Request, Response } from 'express';
import { authService } from '../services/authService';
import { asyncHandler } from '../middleware/commonMiddleware';
import logger from '../utils/logger';
import { ResponseHelper } from '../utils/responseHelper';
import { entitlementService } from '../services/entitlementService';
import { PhoneUtils } from '../utils/phoneUtils';
import { AuthData } from '@/types/auth';

type AuthFailureResult = {
    message: string;
    errorCode?: string;
    lockReason?: string;
    retryAfterSeconds?: number;
};

export class AuthController {
    private static respondAuthFailure(res: Response, statusCode: number, result: AuthFailureResult) {
        if (result.errorCode === 'ACCOUNT_LOCKED') {
            return res.status(423).json(
                ResponseHelper.accountLocked(
                    result.message,
                    result.lockReason ?? 'few_attempts',
                    result.retryAfterSeconds
                )
            );
        }

        if (result.errorCode === 'INVALID_OTP' || result.errorCode === 'INVALID_PHONE' || result.errorCode === 'PHONE_NOT_VERIFIED') {
            return res.status(statusCode).json(ResponseHelper.validationError(result.message, result.errorCode));
        }

        if (result.errorCode === 'INVALID_CREDENTIALS') {
            return res.status(401).json(ResponseHelper.error(result.message, 'INVALID_CREDENTIALS'));
        }

        return res.status(statusCode).json(ResponseHelper.error(result.message, result.errorCode ?? 'VALIDATION_ERROR'));
    }

    static sendOTP = async (req: Request, res: Response) => {
        try {
            const { phoneNumber } = req.body;

            const result = await authService.sendOTP(phoneNumber);
            if (!result.success) {
                return AuthController.respondAuthFailure(res, 400, result);
            }

            return res.json(ResponseHelper.success(result.message, {
                type: result.type,
                expiresIn: result.expiresIn,
                expiresAt: result.expiresAt,
                attemptsAllowed: result.attemptsAllowed,
                notice: result.notice,
            }));
        } catch (error: any) {
            if (error.message.includes('already exists')) {
                return res.status(409).json(ResponseHelper.conflict(error.message));
            }

            if (error.message.includes('No account found')) {
                return res.status(404).json(ResponseHelper.notFound(error.message));
            }

            logger.error('Send OTP error:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to send OTP'));
        }
    };

    static verifyOTP = asyncHandler(async (req: Request, res: Response) => {
        const { phoneNumber, otp } = req.body;

        const otpResult = await authService.verifyOTP(phoneNumber, otp);
        if (!otpResult.success) {
            return AuthController.respondAuthFailure(res, 400, otpResult);
        }

        const normalizedPhone = PhoneUtils.normalize(phoneNumber);
        const existingUser = await authService.getUserByPhone(normalizedPhone);

        if (existingUser) {
            const deviceInfo = req.headers['user-agent'] || 'Unknown';
            const ipAddress = req.ip || 'Unknown';
            const tokenPair = await authService.generateTokenPair(
                existingUser.id,
                existingUser.phoneNumber,
                existingUser.fromCache,
                deviceInfo,
                ipAddress
            );

            return res.json(ResponseHelper.success('Login successful', {
                user: existingUser,
                tokens: tokenPair,
                type: 'login',
            }));
        }

        await authService.markPhoneAsVerified(normalizedPhone);

        return res.json(ResponseHelper.success('OTP verified successfully. Please complete registration.', {
            phoneNumber: normalizedPhone,
            type: 'registration',
            verified: true,
            nextStep: 'registration',
            expiresIn: 600,
            message: 'Phone verified. You have 10 minutes to complete registration.',
        }));
    });

    static register = asyncHandler(async (req: Request, res: Response) => {
        const { phoneNumber, username, fullName, password, organization } = req.body;

        try {
            const normalizedPhone = PhoneUtils.normalize(phoneNumber);

            const isVerified = await authService.isPhoneVerified(normalizedPhone);
            if (!isVerified) {
                return res.status(400).json(ResponseHelper.validationError(
                    'Phone number not verified or verification expired. Please verify OTP first.',
                    'PHONE_NOT_VERIFIED'
                ));
            }

            const usernameCheck = await authService.checkUsernameAvailability(username);
            if (!usernameCheck.available) {
                return res.status(409).json(ResponseHelper.conflict('Username is already taken'));
            }

            const userData: AuthData = {
                phoneNumber: normalizedPhone,
                username,
                fullName,
                password,
                organization,
            };

            const registerResult = await authService.registerUser(normalizedPhone, userData);
            if (!registerResult.success) {
                return res.status(400).json(ResponseHelper.validationError(registerResult.message, registerResult.errorCode));
            }

            if (!registerResult.user) {
                return res.status(500).json(ResponseHelper.serverError('User registration failed - User Data Might be Missing'));
            }

            await authService.clearPhoneVerification(normalizedPhone);

            const deviceInfo = req.headers['user-agent'] || 'Unknown';
            const ipAddress = req.ip || 'Unknown';
            const tokenPair = await authService.generateTokenPair(
                registerResult.user.id,
                registerResult.user.phoneNumber,
                registerResult.user.fromCache,
                deviceInfo,
                ipAddress
            );

            return res.status(201).json(ResponseHelper.success('Registration Successfull. You are Now Logged in', {
                user: registerResult.user,
                tokens: tokenPair,
                type: 'registration',
            }));
        } catch (error: any) {
            logger.error('Registration error:', error);
            return res.status(500).json(ResponseHelper.serverError('Registration failed'));
        }
    });

    static checkUsername = asyncHandler(async (req: Request, res: Response) => {
        const { username } = req.body;

        try {
            const result = await authService.checkUsernameAvailability(username);

            if (result.success) {
                return res.json(ResponseHelper.success(result.message, {
                    username,
                    available: result.available,
                }));
            }

            return res.status(400).json(ResponseHelper.validationError(result.message));
        } catch (error: any) {
            logger.error('Check username error:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to check username'));
        }
    });

    static login = asyncHandler(async (req: Request, res: Response) => {
        const { phoneNumber, password } = req.body;

        const result = await authService.authenticateUser(phoneNumber, password);

        if (!result.success) {
            return AuthController.respondAuthFailure(res, 401, result);
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
                organization: result.user!.organization,
            },
            tokens: tokenPair,
            type: 'login',
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

            const entitlements = await entitlementService.getUserEntitlements(user.id);

            if (!entitlements) {
                return res.status(500).json(ResponseHelper.notFound('User entitlements not found'));
            }

            return res.json(ResponseHelper.success('User profile retrieved successfully', {
                user: {
                    id: user.id,
                    phoneNumber: user.phoneNumber,
                    username: user.username,
                    fullName: user.fullName,
                    organization: user.organization,
                },
                entitlements,
            }));
        } catch (error: any) {
            return res.status(500).json(ResponseHelper.serverError(error.message || 'Failed to get profile'));
        }
    }

    static refreshToken = asyncHandler(async (req: Request, res: Response) => {
        const { refreshToken } = req.body;

        const authHeader = req.headers.authorization;
        const currentAccessToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

        if (!refreshToken) {
            return res.status(400).json(ResponseHelper.validationError('Refresh token is required'));
        }

        const result = await authService.refreshAccessToken(refreshToken, currentAccessToken);

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
