import { BaseService } from "./baseService";

interface PhoneAuthData {
    phoneNumber:string;
    username:string;
    fullName:string;
    organization?:string;
}

interface OTPVerificationData {
    phoneNumber: string;
    otp: string;
}


export class AuthService extends BaseService {

    //sending otp via whats app
      async sendWhatsAppOTP(phoneNumber: string) {
        try {
            // Generate 6-digit OTP
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            
            // Store OTP in database with expiry (5 minutes)
            const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
            
            // You'll need to create an OTP table or use Redis for this
            // For now, let's log it (in production, send via WhatsApp API)
            this.logger.info(`OTP for ${phoneNumber}: ${otp} (expires at ${otpExpiry})`);
            
            // TODO: Integrate with WhatsApp Business API to send OTP
            // await this.sendWhatsAppMessage(phoneNumber, `Your BGMI Tournament OTP: ${otp}`);
            
            // Store in temporary storage (Redis recommended for production)
            // For now, we'll store in a simple object (replace with Redis)
            
            return {
                success: true,
                message: 'OTP sent to WhatsApp',
                phoneNumber,
                expiresIn: 300 // 5 minutes in seconds
            };

        } catch (error) {
            this.handleError(error, 'Send WhatsApp OTP');
            return null;
        }
    }

       // Verify OTP and register/login user
    async verifyOTPAndAuth(verificationData: OTPVerificationData, userData?: PhoneAuthData) {
        try {
            // TODO: Verify OTP from storage (Redis/Database)
            // For demo, we'll accept any 6-digit number
            if (!/^\d{6}$/.test(verificationData.otp)) {
                throw new Error('Invalid OTP format');
            }

            // Check if user exists with this phone number
            let user = await this.db.user.findFirst({
                where: { 
                    phoneNumber: verificationData.phoneNumber
                },
                include: {
                    subscription: true
                }
            });

            if (user) {
                // Existing user - login
                await this.db.user.update({
                    where: { id: user.id },
                    data: { lastLoginAt: new Date() }
                });

                this.logger.info(`User logged in with phone: ${verificationData.phoneNumber}`);
                return {
                    type: 'login',
                    user,
                    message: 'Login successful'
                };

            } else {
                // New user - register
                if (!userData) {
                    throw new Error('User data required for registration');
                }

                // Check if username is available
                const existingUsername = await this.db.user.findFirst({
                    where: { username: userData.username }
                });

                if (existingUsername) {
                    throw new Error('Username already taken');
                }

                // Create new user
                const newUser = await this.db.user.create({
                    data: {
                        phoneNumber: userData.phoneNumber,
                        username: userData.username,
                        fullName: userData.fullName,
                        organization: userData.organization,
                        subscriptionId: null // Default to free plan
                    },
                    include: {
                        subscription: true
                    }
                });

                this.logger.info(`New user registered with phone: ${userData.phoneNumber}`);
                return {
                    type: 'register',
                    user: newUser,
                    message: 'Registration successful'
                };
            }

        } catch (error) {
            this.handleError(error, 'Verify OTP and authenticate');
            return null;
        }
    }


    // Get user profile by phone number
    async getUserByPhone(phoneNumber: string) {
        try {
            const user = await this.db.user.findFirst({
                where: { phoneNumber },
                include: {
                    subscription: true,
                    projects: {
                        select: {
                            id: true,
                            name: true,
                            status: true,
                            createdAt: true
                        }
                    },
                    _count: {
                        select: {
                            projects: true,
                            usageRecords: true
                        }
                    }
                }
            });

            return user;

        } catch (error) {
            this.handleError(error, 'Get user by phone');
            return null;
        }
    }


    // Update user profile
    async updateUserProfile(userId: string, updateData: {
        fullName?: string;
        username?: string;
        organization?: string;
    }) {
        try {
            // Check if username is available (if being updated)
            if (updateData.username) {
                const existingUsername = await this.db.user.findFirst({
                    where: { 
                        username: updateData.username,
                        NOT: { id: userId }
                    }
                });

                if (existingUsername) {
                    throw new Error('Username already taken');
                }
            }

            const user = await this.db.user.update({
                where: { id: userId },
                data: updateData,
                include: {
                    subscription: true
                }
            });

            this.logger.info(`User profile updated: ${userId}`);
            return user;

        } catch (error) {
            this.handleError(error, 'Update user profile');
            return null;
        }
    }

        generateSessionToken(userId: string, phoneNumber: string) {
        // In production, use proper JWT with secret
        const sessionData = {
            userId,
            phoneNumber,
            issuedAt: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        };

        // Simple base64 encoding (use proper JWT in production)
        const token = Buffer.from(JSON.stringify(sessionData)).toString('base64');
        
        return token;
    }

    // Verify session token
    verifySessionToken(token: string) {
        try {
            const sessionData = JSON.parse(Buffer.from(token, 'base64').toString());
            
            if (sessionData.expiresAt < Date.now()) {
                throw new Error('Session expired');
            }

            return sessionData;

        } catch (error) {
            throw new Error('Invalid session token');
        }
    }
}

export const authService = new AuthService();