import express from 'express';
import { AuthController } from '../controllers/authController';
import { validateRequest } from '../middleware/commonMiddleware';
import { sendOTPSchema, verifyOTPSchema } from '../validations/authValidation';
import { asyncHandler } from '../middleware/commonMiddleware';

console.log('=== AUTH VALIDATION IMPORTS ===');
console.log('sendOTPSchema:', sendOTPSchema);
console.log('verifyOTPSchema:', verifyOTPSchema);
console.log('sendOTPSchema type:', typeof sendOTPSchema);
console.log('verifyOTPSchema type:', typeof verifyOTPSchema);
console.log('=== END IMPORTS DEBUG ===');

const authRouter = express.Router();

authRouter.post('/send-otp', 
    validateRequest(sendOTPSchema), 
    AuthController.sendOTP
);

authRouter.post('/verify-otp', 
    validateRequest(verifyOTPSchema), 
    AuthController.verifyOTP
);

authRouter.get('/profile', asyncHandler(AuthController.getProfile));

export default authRouter;