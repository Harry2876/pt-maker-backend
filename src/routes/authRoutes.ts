import express from 'express';
import { AuthController } from '../controllers/authController';
import { validateRequest } from '../middleware/commonMiddleware';
import { refreshTokenSchema, sendOTPSchema, verifyOTPSchema, loginSchema, registrationSchema, checkUsernameSchema } from '../validations/authValidation';
import { asyncHandler } from '../middleware/commonMiddleware';
import { authenticateUser } from '../middleware/auth';

/**
 * @swagger
 * tags:
 *   - name: Authentication
 *     description: Complete user authentication system with OTP verification, registration, login, and session management
 */

const authRouter = express.Router();

/**
 * @swagger
 * /api/v1/auth/send-otp:
 *   post:
 *     tags: [Authentication]
 *     summary: Send OTP to phone number
 *     description: |
 *       Sends a 6-digit OTP to the provided phone number. Auto-detects if phone is for new registration or existing user login.
 *       - For new users: Prepares for registration flow
 *       - For existing users: Prepares for OTP-based login (fallback auth method)
 *       - Supports international phone format normalization (+919876543210, 919876543210, 9876543210)
 *       - OTP expires in 5 minutes (300 seconds)
 *       - Rate limited to prevent spam
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 pattern: '^\\+?[1-9]\\d{1,14}$'
 *                 minLength: 10
 *                 maxLength: 15
 *                 example: "+919876543210"
 *                 description: "Phone number in international format. Supports +919876543210, 919876543210, or 9876543210 formats"
 *           examples:
 *             india_mobile:
 *               summary: Indian mobile number
 *               value:
 *                 phoneNumber: "+919876543210"
 *             us_mobile:
 *               summary: US mobile number  
 *               value:
 *                 phoneNumber: "+1234567890"
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "OTP sent successfully to +919876543210"
 *                 data:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [registration, login]
 *                       example: "registration"
 *                       description: "Indicates whether this is for new user registration or existing user login"
 *                     expiresIn:
 *                       type: number
 *                       example: 300
 *                       description: "OTP expiry time in seconds (5 minutes)"
 *       400:
 *         description: Validation error - Invalid phone number format
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
 *                   example: "Invalid phone number format. Use +919876543210, 919876543210, or 9876543210"
 *                 errorCode:
 *                   type: string
 *                   example: "INVALID_PHONE_FORMAT"
 *       404:
 *         description: User not found (when requesting OTP for login of non-existent user)
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
 *       409:
 *         description: User already exists (when requesting OTP for registration of existing user)
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
 *       500:
 *         description: Server error - Failed to send OTP (SMS service issue)
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
 *     summary: Verify OTP (Industry Standard - OTP verification only)
 *     description: |
 *       Verifies the 6-digit OTP sent to the phone number. Industry-standard implementation that ONLY handles OTP verification.
 *       
 *       **Flow Logic:**
 *       - For **existing users**: Automatically completes login and returns JWT tokens
 *       - For **new users**: Marks phone as verified and requires separate registration step
 *       - Phone verification expires in 10 minutes after successful OTP verification
 *       - Does NOT create user accounts (that's handled by /register endpoint)
 *       
 *       **Security Features:**
 *       - OTP attempts are rate limited (max 3 attempts)
 *       - OTP expires after 5 minutes
 *       - Failed attempts are logged for security monitoring
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - otp
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 pattern: '^\\+?[1-9]\\d{1,14}$'
 *                 example: "+919876543210"
 *                 description: "Same phone number used for sending OTP"
 *               otp:
 *                 type: string
 *                 pattern: '^\\d{6}$'
 *                 minLength: 6
 *                 maxLength: 6
 *                 example: "123456"
 *                 description: "6-digit numeric OTP code received via SMS"
 *     responses:
 *       200:
 *         description: OTP verification successful
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - title: Existing User (Auto-Login)
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     message:
 *                       type: string
 *                       example: "Login successful"
 *                     data:
 *                       type: object
 *                       properties:
 *                         user:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                               example: "uuid-string"
 *                             phoneNumber:
 *                               type: string
 *                               example: "+919876543210"
 *                             username:
 *                               type: string
 *                               example: "john_doe123"
 *                             fullName:
 *                               type: string
 *                               example: "John Doe"
 *                             organization:
 *                               type: string
 *                               example: "Tech Corp"
 *                         tokens:
 *                           type: object
 *                           properties:
 *                             accessToken:
 *                               type: string
 *                               example: "eyJhbGciOiJIUzI1NiIs..."
 *                               description: "JWT access token (expires in 30 minutes)"
 *                             refreshToken:
 *                               type: string
 *                               example: "eyJhbGciOiJIUzI1NiIs..."
 *                               description: "JWT refresh token (expires in 30 days)"
 *                         type:
 *                           type: string
 *                           example: "login"
 *                 - title: New User (Registration Required)
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     message:
 *                       type: string
 *                       example: "OTP verified successfully. Please complete registration."
 *                     data:
 *                       type: object
 *                       properties:
 *                         phoneNumber:
 *                           type: string
 *                           example: "+919876543210"
 *                         type:
 *                           type: string
 *                           example: "registration"
 *                         verified:
 *                           type: boolean
 *                           example: true
 *                         nextStep:
 *                           type: string
 *                           example: "registration"
 *                         expiresIn:
 *                           type: number
 *                           example: 600
 *                           description: "Time in seconds to complete registration (10 minutes)"
 *                         message:
 *                           type: string
 *                           example: "Phone verified. You have 10 minutes to complete registration."
 *       400:
 *         description: Invalid or expired OTP
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
 *                   enum: [INVALID_OTP, EXPIRED_OTP, MAX_ATTEMPTS_EXCEEDED]
 *                   example: "INVALID_OTP"
 */
authRouter.post('/verify-otp', 
    validateRequest(verifyOTPSchema), 
    AuthController.verifyOTP
);

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     tags: [Authentication]
 *     summary: Complete user registration after OTP verification
 *     description: |
 *       Completes user registration process after successful OTP verification. This endpoint creates a new user account.
 *       
 *       **Prerequisites:**
 *       - Phone number must be OTP-verified within the last 10 minutes
 *       - Username must be checked for availability first (use /check-username)
 *       
 *       **Process:**
 *       1. Validates phone verification status
 *       2. Checks username availability (returns 409 if taken)
 *       3. Creates user account with hashed password
 *       4. Automatically logs in the user (returns JWT tokens)
 *       5. Clears phone verification status
 *       
 *       **Security:**
 *       - Password must contain uppercase, lowercase, and number
 *       - Username can only contain letters, numbers, and underscores
 *       - Phone verification expires after 10 minutes
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - username
 *               - password
 *               - fullName
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 pattern: '^\\+?[1-9]\\d{1,14}$'
 *                 example: "+919876543210"
 *                 description: "Previously OTP-verified phone number"
 *               username:
 *                 type: string
 *                 pattern: '^[a-zA-Z0-9_]+$'
 *                 minLength: 3
 *                 maxLength: 50
 *                 example: "john_doe123"
 *                 description: "Unique username (check availability with /check-username first)"
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 128
 *                 pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)'
 *                 example: "SecurePass123"
 *                 description: "Must contain at least one uppercase, lowercase, and number"
 *               fullName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 example: "John Doe"
 *                 description: "User's full display name"
 *               organization:
 *                 type: string
 *                 maxLength: 100
 *                 example: "Tech Corp"
 *                 description: "Optional organization/company name"
 *     responses:
 *       201:
 *         description: Registration successful - User created and logged in
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Registration successful. You are now logged in"
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           example: "uuid-string"
 *                         phoneNumber:
 *                           type: string
 *                           example: "+919876543210"
 *                         username:
 *                           type: string
 *                           example: "john_doe123"
 *                         fullName:
 *                           type: string
 *                           example: "John Doe"
 *                         organization:
 *                           type: string
 *                           example: "Tech Corp"
 *                     tokens:
 *                       type: object
 *                       properties:
 *                         accessToken:
 *                           type: string
 *                           example: "eyJhbGciOiJIUzI1NiIs..."
 *                           description: "JWT access token (30 min expiry)"
 *                         refreshToken:
 *                           type: string
 *                           example: "eyJhbGciOiJIUzI1NiIs..."
 *                           description: "JWT refresh token (30 day expiry)"
 *                     type:
 *                       type: string
 *                       example: "registration"
 *       400:
 *         description: Validation error or phone not verified
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
 *                   examples:
 *                     phone_not_verified:
 *                       value: "Phone number not verified or verification expired. Please verify OTP first."
 *                     invalid_password:
 *                       value: "Password must contain at least one uppercase letter, one lowercase letter, and one number"
 *                     invalid_username:
 *                       value: "Username can only contain letters, numbers, and underscores"
 *                 errorCode:
 *                   type: string
 *                   enum: [PHONE_NOT_VERIFIED, INVALID_PASSWORD, INVALID_USERNAME]
 *                   example: "PHONE_NOT_VERIFIED"
 *       409:
 *         description: Username already taken
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
 *                   example: "Username is already taken"
 *                 errorCode:
 *                   type: string
 *                   example: "USERNAME_EXISTS"
 */
authRouter.post('/register', 
    validateRequest(registrationSchema), 
    asyncHandler(AuthController.register)
);

/**
 * @swagger
 * /api/v1/auth/check-username:
 *   post:
 *     tags: [Authentication]
 *     summary: Check username availability in real-time
 *     description: |
 *       Checks if a username is available for registration. Used for real-time validation during registration flow.
 *       
 *       **Use Cases:**
 *       - Real-time validation during registration form filling
 *       - Username availability check before submitting registration
 *       - Preventing registration failures due to taken usernames
 *       
 *       **Validation Rules:**
 *       - Must be 3-50 characters long
 *       - Can only contain letters, numbers, and underscores
 *       - Case-sensitive (john_doe and John_Doe are different)
 *       - Returns instant availability status
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *             properties:
 *               username:
 *                 type: string
 *                 pattern: '^[a-zA-Z0-9_]+$'
 *                 minLength: 3
 *                 maxLength: 50
 *                 example: "john_doe123"
 *                 description: "Username to check for availability"
 *           examples:
 *             valid_username:
 *               summary: Valid username format
 *               value:
 *                 username: "john_doe123"
 *             invalid_username:
 *               summary: Invalid username (contains spaces)
 *               value:
 *                 username: "john doe"
 *     responses:
 *       200:
 *         description: Username availability check completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   examples:
 *                     available:
 *                       value: "Username is available"
 *                     taken:
 *                       value: "Username is already taken"
 *                 data:
 *                   type: object
 *                   properties:
 *                     username:
 *                       type: string
 *                       example: "john_doe123"
 *                     available:
 *                       type: boolean
 *                       example: true
 *                       description: "true if username is available, false if taken"
 *       400:
 *         description: Invalid username format
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
 *                   example: "Username can only contain letters, numbers, and underscores"
 */
authRouter.post('/check-username', 
    validateRequest(checkUsernameSchema), 
    asyncHandler(AuthController.checkUsername)
);

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Login with phone number and password (Primary method)
 *     description: |
 *       Primary authentication method using phone number and password. Faster than OTP-based login.
 *       
 *       **Authentication Flow:**
 *       1. Validates phone number format and normalization
 *       2. Verifies password against stored hash
 *       3. Generates JWT access token (30 min expiry)
 *       4. Generates JWT refresh token (30 day expiry)
 *       5. Creates session record for device tracking
 *       
 *       **Security Features:**
 *       - Passwords are bcrypt hashed
 *       - Failed login attempts are rate limited
 *       - Device and IP tracking for session management
 *       - Automatic session cleanup for expired tokens
 *       
 *       **Fallback:** If password is forgotten, users can use OTP flow (/send-otp → /verify-otp)
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
 *                 pattern: '^\\+?[1-9]\\d{1,14}$'
 *                 example: "+919876543210"
 *                 description: "Registered phone number (auto-normalized)"
 *               password:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 128
 *                 example: "SecurePass123"
 *                 description: "User's password"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           example: "uuid-string"
 *                         phoneNumber:
 *                           type: string
 *                           example: "+919876543210"
 *                         username:
 *                           type: string
 *                           example: "john_doe123"
 *                         fullName:
 *                           type: string
 *                           example: "John Doe"
 *                         organization:
 *                           type: string
 *                           example: "Tech Corp"
 *                     tokens:
 *                       type: object
 *                       properties:
 *                         accessToken:
 *                           type: string
 *                           example: "eyJhbGciOiJIUzI1NiIs..."
 *                           description: "JWT access token (expires in 30 minutes)"
 *                         refreshToken:
 *                           type: string
 *                           example: "eyJhbGciOiJIUzI1NiIs..."
 *                           description: "JWT refresh token (expires in 30 days)"
 *                     type:
 *                       type: string
 *                       example: "login"
 *       401:
 *         description: Invalid credentials
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
 *                   examples:
 *                     invalid_password:
 *                       value: "Invalid phone number or password"
 *                     account_not_found:
 *                       value: "No account found with this phone number"
 *                 errorCode:
 *                   type: string
 *                   example: "INVALID_CREDENTIALS"
 *       400:
 *         description: Validation error
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
 *                   example: "Invalid phone number format"
 */
authRouter.post('/login', 
    validateRequest(loginSchema), 
    asyncHandler(AuthController.login)
);

/**
 * @swagger
 * /api/v1/auth/profile:
 *   get:
 *     tags: [Authentication]
 *     summary: Get current user's profile information
 *     description: |
 *       Retrieves the authenticated user's profile data. Requires valid JWT access token.
 *       
 *       **Security:**
 *       - Requires valid JWT Bearer token in Authorization header
 *       - Token is verified and user existence is confirmed
 *       - Returns user data without sensitive information (no password hashes)
 *       
 *       **Use Cases:**
 *       - Profile page display
 *       - User info validation
 *       - Dashboard personalization
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "User profile retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           example: "uuid-string"
 *                         phoneNumber:
 *                           type: string
 *                           example: "+919876543210"
 *                         username:
 *                           type: string
 *                           example: "john_doe123"
 *                         fullName:
 *                           type: string
 *                           example: "John Doe"
 *                         organization:
 *                           type: string
 *                           example: "Tech Corp"
 *       401:
 *         description: Unauthorized - Invalid or missing token
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
 *                   example: "Auth Token Required"
 *       404:
 *         description: User not found
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
 *                   example: "User not found"
 */
authRouter.get('/profile', 
    authenticateUser, 
    asyncHandler(AuthController.getProfile)
);

/**
 * @swagger
 * /api/v1/auth/refresh-token:
 *   post:
 *     tags: [Authentication]
 *     summary: Refresh expired access token using refresh token
 *     description: |
 *       Generates a new access token using a valid refresh token. Use this when access token expires.
 *       
 *       **Token Lifecycle:**
 *       - Access tokens expire in 30 minutes
 *       - Refresh tokens expire in 30 days
 *       - New access token is generated with fresh 30-minute expiry
 *       - Refresh token remains valid until its natural expiry
 *       
 *       **Security:**
 *       - Refresh token is verified against stored sessions
 *       - Invalid/expired refresh tokens are rejected
 *       - Device and IP tracking maintained across token refresh
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 minLength: 1
 *                 example: "eyJhbGciOiJIUzI1NiIs..."
 *                 description: "Valid JWT refresh token received during login/registration"
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Token refreshed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       example: "eyJhbGciOiJIUzI1NiIs..."
 *                       description: "New JWT access token (30 min expiry)"
 *                     expiresIn:
 *                       type: number
 *                       example: 1800
 *                       description: "Token expiry in seconds (30 minutes)"
 *       400:
 *         description: Invalid or missing refresh token
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
 *                   examples:
 *                     missing:
 *                       value: "Refresh token is required"
 *                     invalid:
 *                       value: "Invalid or expired refresh token"
 */
authRouter.post('/refresh-token',
    validateRequest(refreshTokenSchema), 
    asyncHandler(AuthController.refreshToken)
);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Authentication]
 *     summary: Logout from current session/device
 *     description: |
 *       Logs out the user from the current device/session only. Other device sessions remain active.
 *       
 *       **Process:**
 *       - Invalidates the current session ID
 *       - Revokes current access and refresh tokens for this device
 *       - Other device sessions remain unaffected
 *       - Client should clear stored tokens after successful logout
 *       
 *       **Security:**
 *       - Requires valid JWT access token
 *       - Session is immediately invalidated
 *       - Prevents token reuse after logout
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully from current device
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Logged out successfully"
 *       401:
 *         description: Unauthorized - Invalid or missing token
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
 *                   example: "Auth Token Required"
 */
authRouter.post('/logout', 
    authenticateUser, 
    asyncHandler(AuthController.logout)
);

/**
 * @swagger
 * /api/v1/auth/logout-all:
 *   post:
 *     tags: [Authentication]
 *     summary: Logout from all devices/sessions (Security feature)
 *     description: |
 *       Logs out the user from ALL devices and sessions simultaneously. Security feature for account compromise scenarios.
 *       
 *       **Use Cases:**
 *       - Suspected account compromise
 *       - Password changed
 *       - Security cleanup
 *       - Lost device scenarios
 *       
 *       **Process:**
 *       - Revokes ALL user sessions across all devices
 *       - Invalidates all access and refresh tokens
 *       - Forces re-authentication on all devices
 *       - Current device is also logged out
 *       
 *       **Security:**
 *       - Requires valid JWT access token
 *       - Immediate invalidation of all sessions
 *       - Logs security event for monitoring
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out from all devices successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Logged out from all devices successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionsRevoked:
 *                       type: number
 *                       example: 3
 *                       description: "Number of sessions that were invalidated"
 *       401:
 *         description: Unauthorized - Invalid or missing token
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
 *                   example: "Auth Token Required or User not Found"
 */
authRouter.post('/logout-all', 
    authenticateUser, 
    asyncHandler(AuthController.logoutAll)
);

/**
 * @swagger
 * /api/v1/auth/sessions:
 *   get:
 *     tags: [Authentication]
 *     summary: Get all active sessions for current user
 *     description: |
 *       Retrieves list of all active sessions/devices for the authenticated user. Security and device management feature.
 *       
 *       **Session Information:**
 *       - Device information (User-Agent)
 *       - Login timestamp
 *       - Last activity timestamp
 *       - IP address (partially masked for privacy)
 *       - Session ID for targeted logout
 *       
 *       **Use Cases:**
 *       - Security dashboard
 *       - Device management
 *       - Suspicious activity detection
 *       - Selective session termination
 *       
 *       **Privacy:**
 *       - IP addresses are partially masked (192.168.1.*)
 *       - Sensitive session data is excluded
 *       - Only current user's sessions are shown
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active sessions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "User sessions retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           sessionId:
 *                             type: string
 *                             example: "session-uuid-string"
 *                           deviceInfo:
 *                             type: string
 *                             example: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6)"
 *                           ipAddress:
 *                             type: string
 *                             example: "192.168.1.*"
 *                             description: "Partially masked for privacy"
 *                           loginTime:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-01-15T10:30:00Z"
 *                           lastActivity:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-01-15T11:45:00Z"
 *                           isCurrent:
 *                             type: boolean
 *                             example: true
 *                             description: "True if this is the current session"
 *                     totalSessions:
 *                       type: number
 *                       example: 3
 *       401:
 *         description: Unauthorized - Invalid or missing token
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
 *                   example: "Auth Token Required or User not Found"
 */
authRouter.get('/sessions', 
    authenticateUser, 
    asyncHandler(AuthController.getSessions)
);

export default authRouter;