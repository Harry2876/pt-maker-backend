import express from 'express';
import { AuthController } from '../controllers/authController';
import { validateRequest } from '../middleware/commonMiddleware';
import { refreshTokenSchema, sendOTPSchema, verifyOTPSchema, loginSchema } from '../validations/authValidation';
import { asyncHandler } from '../middleware/commonMiddleware';
import { authenticateUser } from '../middleware/auth';

/**
 * @swagger
 * tags:
 *   - name: Authentication
 *     description: User authentication and session management
 */

const authRouter = express.Router();

/**
 * @swagger
 * /api/v1/auth/send-otp:
 *   post:
 *     tags: [Authentication]
 *     summary: Send OTP to phone number
 *     description: Send a 6-digit OTP to the provided phone number for registration or login
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendOtpRequest'
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found (for login type)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "No account found with this phone number. Please register first."
 *                 errorCode:
 *                   type: string
 *                   example: "USER_NOT_FOUND"
 *                 suggestion:
 *                   type: string
 *                   example: "Try using registration instead"
 *       409:
 *         description: User already exists (for registration type)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "User already exists with this phone number. Please use login instead."
 *                 errorCode:
 *                   type: string
 *                   example: "USER_EXISTS"
 *                 suggestion:
 *                   type: string
 *                   example: "Try using login instead"
 */
authRouter.post('/send-otp', 
    validateRequest(sendOTPSchema), 
    AuthController.sendOTP
);

/**
 * @swagger
 * /api/v1/auth/verify-otp:
 *   post:
 *     tags: [Authentication]
 *     summary: Verify OTP and authenticate user
 *     description: Verify OTP and either login existing user or register new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyOtpRequest'
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     phoneNumber:
 *                       type: string
 *                     username:
 *                       type: string
 *                     fullName:
 *                       type: string
 *                     organization:
 *                       type: string
 *                 token:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                 type:
 *                   type: string
 *                   enum: [login, registration]
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid OTP or validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid or expired OTP. Please try again."
 *                 errorCode:
 *                   type: string
 *                   example: "INVALID_OTP"
 */
authRouter.post('/verify-otp', 
    validateRequest(verifyOTPSchema), 
    AuthController.verifyOTP
);

/**
 * @swagger
 * /api/v1/auth/profile:
 *   get:
 *     tags: [Authentication]
 *     summary: Get user profile
 *     description: Get current user's profile information
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Login with phone number and password
 *     description: Authenticate user using phone number and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - password
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "+1234567890"
 *               password:
 *                 type: string
 *                 example: "Password123!"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
authRouter.post('/login', 
    validateRequest(loginSchema), 
    asyncHandler(AuthController.login)
);

authRouter.get('/profile', authenticateUser, asyncHandler(AuthController.getProfile));

/**
 * @swagger
 * /api/v1/auth/refresh-token:
 *   post:
 *     tags: [Authentication]
 *     summary: Refresh access token
 *     description: Get new access token using refresh token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Invalid refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Protected routes (require authentication)
authRouter.post('/refresh-token',
    validateRequest(refreshTokenSchema), 
    asyncHandler(AuthController.refreshToken)
);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Authentication]
 *     summary: Logout from current session
 *     description: Invalidate current session and logout user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
authRouter.post('/logout', authenticateUser, asyncHandler(AuthController.logout));

/**
 * @swagger
 * /api/v1/auth/logout-all:
 *   post:
 *     tags: [Authentication]
 *     summary: Logout from all sessions
 *     description: Invalidate all user sessions across all devices
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out from all devices successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
authRouter.post('/logout-all', authenticateUser, asyncHandler(AuthController.logoutAll));

/**
 * @swagger
 * /api/v1/auth/sessions:
 *   get:
 *     tags: [Authentication]
 *     summary: Get active sessions
 *     description: Get all active sessions for the current user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sessions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
authRouter.get('/sessions', authenticateUser, asyncHandler(AuthController.getSessions));

export default authRouter;