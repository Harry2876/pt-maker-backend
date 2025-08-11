import express from 'express';
import { authService } from '../services/authService';

const authRouter = express.Router();

// POST /api/v1/auth/send-otp
authRouter.post('/send-otp', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        // Validate phone number format (basic validation)
        if (!/^\+?[1-9]\d{1,14}$/.test(phoneNumber)) {
            return res.status(400).json({ error: 'Invalid phone number format' });
        }
        
        const result = await authService.sendWhatsAppOTP(phoneNumber);
        return res.json(result);
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to send OTP';
        return res.status(500).json({ error: errorMessage });
    }
});

// POST /api/v1/auth/verify-otp
authRouter.post('/verify-otp', async (req, res) => {
    try {
        const { phoneNumber, otp, userData } = req.body;
        
        if (!phoneNumber || !otp) {
            return res.status(400).json({ error: 'Phone number and OTP are required' });
        }
        
        const result = await authService.verifyOTPAndAuth(
            { phoneNumber, otp },
            userData
        );
        
        if (result) {
            // Generate session token
            const sessionToken = authService.generateSessionToken(
                result.user.id,
                phoneNumber
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
                token: sessionToken,
                type: result.type,
                message: result.message
            });
        } else {
            return res.status(400).json({ error: 'Invalid OTP' });
        }
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'OTP verification failed';
        return res.status(400).json({ error: errorMessage });
    }
});

// GET /api/v1/auth/profile - Get user profile
authRouter.get('/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authorization token required' });
        }

        const token = authHeader.substring(7);
        const sessionData = authService.verifySessionToken(token);
        
        const user = await authService.getUserByPhone(sessionData.phoneNumber);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        return res.json({
            user: {
                id: user.id,
                phoneNumber: user.phoneNumber,
                username: user.username,
                fullName: user.fullName,
                organization: user.organization,
                subscription: user.subscription,
                projectCount: user._count?.projects,
                usageCount: user._count?.usageRecords
            }
        });
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get profile';
        return res.status(401).json({ error: errorMessage });
    }
});

// POST /api/v1/auth/logout
authRouter.post('/logout', async (req, res) => {
    try {
        return res.json({ 
            success: true,
            message: 'Logout successful. Please remove the token from client storage.' 
        });
    } catch (error) {
        return res.status(500).json({ error: 'Logout failed' });
    }
});

export default authRouter;
