import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import logger from './utils/logger';
import { dbManager } from './config/database';
// Import route modules
import authRouter from './routes/authRoutes';
import tournamentRouter from './routes/tournamentRoutes';
import matchRouter from './routes/matchRoutes';
import uploadRouter from './routes/uploadRoutes';
import groupRouter from './routes/groupRoutes';                      // Add this
import teamRegistrationRouter from './routes/teamRegistrationRoutes';
import adminRouter from './routes/adminRoutes';
import redis from './config/redis';
import { WorkersManager } from './workers';
import { QueueService } from './services/queueService';
import { globalErrorHandler } from './middleware/commonMiddleware';
import { validateEnvironment } from './config/envValidator';

validateEnvironment();

const workersManager = new WorkersManager();

const app = express();
const PORT = process.env.PORT || 3000;

// Configure CORS securely
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://yourdomain.com', 'https://www.yourdomain.com']  // Replace with your frontend domains
        : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'], // Dev domains
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    maxAge: 86400 // 24 hours preflight cache
};

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false, // For API compatibility
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));
app.use(cors(corsOptions)); // Enable CORS

// Add after CORS middleware
app.use((req, res, next) => {
    // Add security headers
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Log request details for security monitoring
    logger.http(`Security Check: ${req.method} ${req.url} from ${req.ip}`, {
        userAgent: req.get('User-Agent'),
        referer: req.get('Referer'),
        origin: req.get('Origin')
    });
    
    next();
});

app.use(express.json({ limit: '50mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Parse URL-encoded bodies
app.use(globalErrorHandler);


// Start Redis and Workers
async function initializeServices() {
    try {
        // Test Redis cache connection
        await redis.set('server:status', 'running', 60);
        logger.info('✅ Redis cache connection tested successfully');

        // Wait for Redis queue connection to be ready
        const queueReady = await redis.waitForConnection(15000);
        if (!queueReady) {
            throw new Error('Redis queue connection failed');
        }

        // Start queue workers after Redis is confirmed ready
        await workersManager.startAllWorkers();

        await QueueService.scheduleUserSync();
        await QueueService.scheduleBatchSync(); // Runs every 10 minutes as safety net

    } catch (error) {
        logger.error('❌ Failed to initialize services:', error);
        process.exit(1);
    }
}

// Call before starting server
(async () => {
    await initializeServices();
})();

// Add graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('🛑 Received SIGTERM, shutting down gracefully');
    await workersManager.stopAllWorkers();
    await redis.disconnect();
    process.exit(0);
});
app.use((req, res, next) => {
    const startTime = Date.now();

    // Log request start
    logger.http(`📥 ${req.method} ${req.url} - ${req.ip}`);

    // Override res.end to capture response time
    const originalEnd = res.end.bind(res);
    res.end = function (chunk?: any, encoding?: any) {
        const duration = Date.now() - startTime;
        logger.http(`📤 Method ${req.method} ${req.url} ,Status :${res.statusCode} Latency : ${duration}ms`);
        return originalEnd(chunk, encoding);
    };

    next();
});
app.get('/test-queue', async (req, res) => {
    try {
        // Test Redis
        await redis.set('test:key', 'Hello Redis!', 60);
        const value = await redis.get('test:key');

        // Test Queue
        await QueueService.sendOTP({
            phoneNumber: '+919876543210',
            otp: '123456',
            type: 'registration',
            userId: 'test-user-123'
        });

        res.json({
            success: true,
            redis: { testValue: value },
            queue: { otpJobQueued: true },
            message: 'Redis and Queue system working!'
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});
// Basic health check route
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});


// API routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/tournaments', tournamentRouter); 
app.use('/api/v1/matches', matchRouter);
app.use('/api/v1/uploads', uploadRouter);
app.use('/api/v1/groups', groupRouter);            
app.use('/api/v1/team-registrations', teamRegistrationRouter);
// app.use('/api/v1/admin', adminRouter);

// API info endpoint
app.get('/api/v1', (req, res) => {
    res.json({
        message: 'BGMI Tournament API v1',
        version: '1.0.0',
        endpoints: {
            auth: '/api/v1/auth',
            tournaments: '/api/v1/tournaments',
            matches: '/api/v1/matches',
            uploads: '/api/v1/uploads',
            groups: '/api/v1/groups',                           // Add this
            teamRegistrations: '/api/v1/team-registrations',   // Add this
            admin: '/api/v1/admin'
        },
        status: {
            tournaments: 'active',
            matches: 'active',
            uploads: 'active',
            groups: 'active',                                   // Add this
            teamRegistrations: 'active',                        // Add this
            admin: 'coming soon'
        }
    });
});


// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error(err.stack);
    res.status(500).json({
        error: 'Something went wrong!',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        message: `The route ${req.originalUrl} does not exist`,
    });
});


// Start server with database connection
async function startServer() {
    try {
        // Connect to database
        await dbManager.connect();

        // Start Express server
        app.listen(PORT, () => {
            logger.info(`🚀 Server running on port ${PORT}`);
            logger.info(`💾 Database connected successfully`);
        });

    } catch (error) {
        logger.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start the application
startServer();