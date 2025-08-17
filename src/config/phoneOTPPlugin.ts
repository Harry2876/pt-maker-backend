// // Simple phone OTP service - not using Better Auth plugin for now
// // We'll integrate this directly into our routes

// import { authService } from "../services/authService";

// export class PhoneOTPService {
    
//     async sendOTP(phoneNumber: string) {
//         try {
//             if (!phoneNumber) {
//                 throw new Error("Phone number is required");
//             }

//             const result = await authService.sendWhatsAppOTP(phoneNumber);
//             return result;
            
//         } catch (error) {
//             throw new Error("Failed to send OTP");
//         }
//     }

//     async verifyOTP(phoneNumber: string, otp: string, userData?: any) {
//         try {
//             if (!phoneNumber || !otp) {
//                 throw new Error("Phone number and OTP are required");
//             }

//             const result = await authService.verifyOTPAndAuth(
//                 { phoneNumber, otp },
//                 userData
//             );
            
//             if (result) {
//                 // Generate session token
//                 const sessionToken = authService.generateSessionToken(
//                     result.user.id,
//                     phoneNumber
//                 );

//                 return {
//                     success: true,
//                     user: result.user,
//                     token: sessionToken,
//                     type: result.type
//                 };
//             }

//             throw new Error("Invalid OTP");
            
//         } catch (error) {
//             throw new Error("OTP verification failed");
//         }
//     }
// }

// export const phoneOTPService = new PhoneOTPService();
