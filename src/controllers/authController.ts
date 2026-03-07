import { Request, Response } from 'express';
import { authService } from '../services/authService';
import { handleControllerError, asyncHandler } from '../middleware/commonMiddleware';
import logger from '../utils/logger';
import { ResponseHelper } from '../utils/responseHelper';
import { PhoneUtils } from '../utils/phoneUtils';
import { AuthData } from '@/types/auth';



export class AuthController {
    static sendOTP = async (req: Request, res: Response) => {
        try {
            const { phoneNumber } = req.body; // Already validated by middleware

            const result = await authService.sendOTP(phoneNumber);
            if (!result.success) {
                return res.status(400).json(ResponseHelper.validationError(result.message, result.errorCode));
            }

            return res.json(ResponseHelper.success(result.message, {
                type: result.type,
                expiresIn: result.expiresIn
            }));
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
        const { phoneNumber, otp, appVersion } = req.body;

        // Verify OTP only - no registration/login logic here
        const otpResult = await authService.verifyOTP(phoneNumber, otp);
        if (!otpResult.success) {
            return res.status(400).json(ResponseHelper.validationError(otpResult.message, otpResult.errorCode));
        }

        // Check if user exists to determine next step
        const normalizedPhone = PhoneUtils.normalize(phoneNumber);
        const existingUser = await authService.getUserByPhone(normalizedPhone);

        if (existingUser) {
            // Existing user - complete login flow immediately
            const deviceInfo = req.headers['user-agent'] || 'Unknown';
            const ipAddress = req.ip || 'Unknown';
            
            // Update user's last app version
            if (appVersion && !existingUser.fromCache) {
                await authService.updateUserAppVersion(existingUser.id, appVersion);
            }
            
            const tokenPair = await authService.generateTokenPair(
                existingUser.id,
                existingUser.phoneNumber,
                existingUser.fromCache,
                deviceInfo,
                ipAddress,
                appVersion
            );

            return res.json(ResponseHelper.success('Login successful', {
                user: existingUser,
                tokens: tokenPair,
                type: 'login'
            }));
        } else {
            // New user - OTP verified, ready for registration
            // Mark phone as verified temporarily (10 minutes)
            await authService.markPhoneAsVerified(normalizedPhone);
            
            return res.json(ResponseHelper.success('OTP verified successfully. Please complete registration.', {
                phoneNumber: normalizedPhone,
                type: 'registration',
                verified: true,
                nextStep: 'registration',
                expiresIn: 600, // 10 minutes to complete registration
                message: 'Phone verified. You have 10 minutes to complete registration.'
            }));
        }
    });

    static register = asyncHandler(async (req: Request, res:Response) => {
        const {phoneNumber, username, fullName, password, organization, appVersion} = req.body;

        try{
            const normalizedPhone = PhoneUtils.normalize(phoneNumber);

            //check if phone was recently OTP-verified
            const isVerified = await authService.isPhoneVerified(normalizedPhone);
            if(!isVerified){
                return res.status(400).json(ResponseHelper.validationError(
                    'Phone number not verified or verification expired. Please verify OTP first.',
                    'PHONE_NOT_VERIFIED'
                ));
            }

            //check if username available
            const usernameCheck = await authService.checkUsernameAvailability(username);
            if(!usernameCheck.available){
                return res.status(409).json(ResponseHelper.conflict(
                    'Username is already taken',
                ));
            }

            //register user
            const userData: AuthData = {
                phoneNumber: normalizedPhone,
                username,
                fullName,
                password,
                organization,
                appVersion
            };

            const registerResult = await authService.registerUser(normalizedPhone, userData);
            if(!registerResult.success){
                return res.status(400).json(ResponseHelper.validationError(registerResult.message, registerResult.errorCode));
            }

            //add null check for user
            if(!registerResult.user){
                return res.status(500).json(ResponseHelper.serverError('User registration failed - User Data Might be Missing'));
            }

            //add null check for user
            if(!registerResult.user){
                return res.status(500).json(ResponseHelper.serverError('User registration failed - User Data Might be Missing'));
            }

            //clear phone verification (registration complete)
            await authService.clearPhoneVerification(normalizedPhone);

            //generate tokens for auto-login after registration
            const deviceInfo = req.headers['user-agent'] || 'Unknown';
            const ipAddress = req.ip || 'Unknown';
            const tokenPair = await authService.generateTokenPair(
                registerResult.user.id,
                registerResult.user.phoneNumber,
                registerResult.user.fromCache,
                deviceInfo,
                ipAddress,
                appVersion
            );

            return res.status(201).json(ResponseHelper.success('Registration Successfull. You are Now Logged in',{
                user: registerResult.user,
                tokens: tokenPair,
                type: 'registration'
            }));
        } catch (error:any) {
            logger.error('Registration error:', error);
            return res.status(500).json(ResponseHelper.serverError('Registration failed'));
        }
    });

    static checkUsername = asyncHandler(async (req: Request, res: Response) => {
        const { username } = req.body;

        try{
            const result = await authService.checkUsernameAvailability(username);

            if(result.success){
                return res.json(ResponseHelper.success(result.message,
                    {
                        username: username,
                        available: result.available
                    }
                ));
            }else {
                return res.status(400).json(ResponseHelper.validationError(result.message));
            }
        } catch (error: any) {
            logger.error('Check username error:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to check username'));
        }
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

    //extract the current access token from the header
    const authHeader = req.headers.authorization;
    let currentAccessToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

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