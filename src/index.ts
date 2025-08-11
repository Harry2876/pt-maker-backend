import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import logger from './utils/logger';
import { dbManager } from './config/database';
// Import route modules
// import authRouter from './routes/authRoutes';
// import projectRouter from './routes/projectRoutes';
import matchRouter from './routes/matchRoutes';
import adminRouter from './routes/adminRoutes';
import redis from './config/redis';
import { WorkersManager } from './workers';
import { QueueService } from './services/queueService';

const workersManager = new WorkersManager();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json({ limit: '50mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Parse URL-encoded bodies


// Start Redis and Workers
async function initializeServices() {
    try {
        // Test Redis connection
        await redis.set('server:status', 'running', 60);
        logger.info('✅ Redis connection tested successfully');
        
        // Start queue workers
        await workersManager.startAllWorkers();
        
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
    } catch (error:any) {
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

// Test route for Discord logging colors
app.get('/test-colors', (req, res) => {
  // Test basic color logging
  logger.info('� Testing INFO color - should be GREEN');
  logger.warn('⚠️ Testing WARN color - should be ORANGE');
  logger.http('🌐 Testing HTTP color - should be BLUE');
  logger.debug('🔍 Testing DEBUG color - should be GRAY');
  
  // Test detailed error logging with metadata
  logger.error('Test error: Database connection failed', {
    error: 'Connection timeout',
    database: 'tournament_db',
    apiKey: 'sensitive-api-key-12345',
    retryCount: 3,
    lastAttempt: new Date().toISOString(),
    connectionDetails: {
      host: 'localhost',
      port: 5432,
      ssl: true
    }
  });
  
  // Test complex info logging with metadata
  logger.info('User login attempt with password: secretPassword123 and token: abc123xyz', {
    userId: 'user_12345',
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    loginData: {
      method: 'phone_otp',
      phone: '+91xxxxxxxxxx',
      timestamp: new Date().toISOString()
    }
  });
  
  res.json({
    message: 'Enhanced detailed logging test completed! Check your Discord channel.',
    note: 'You should now see detailed metadata, colors, and structured information.',
    testCases: [
      'Basic color testing for all log levels',
      'Error with detailed metadata including nested objects',
      'Info with user authentication details',
      'Security masking for sensitive data'
    ]
  });
});



// API routes
// app.use('/api/v1/auth', authRouter);
// app.use('/api/v1/projects', projectRouter);
// app.use('/api/v1/matches', matchRouter);
// app.use('/api/v1/admin', adminRouter);

// API info endpoint
app.get('/api/v1', (req, res) => {
    res.json({
        message: 'BGMI Tournament API v1',
        version: '1.0.0',
        endpoints: {
            auth: '/api/v1/auth',
            projects: '/api/v1/projects',
            matches: '/api/v1/matches',
            admin: '/api/v1/admin'
        }
    });
});

app.get('/test-logging', (req, res) => {
    try {
        // Test different log levels with various scenarios
        logger.info('🚀 Testing enhanced Discord logging system');

        logger.debug('Debug message: System status check completed');

        logger.http('HTTP request received: GET /test-logging');

        logger.warn('Warning: This is a test warning message');

        // Test with sensitive data (should be masked)
        logger.info('User login attempt with password: secretPassword123 and token: abc123xyz');

        // Test error logging
        logger.error('Test error: Database connection failed', {
            metadata: {
                error: 'Connection timeout',
                database: 'tournament_db',
                apiKey: 'sensitive-api-key-12345'
            }
        });

        res.json({
            success: true,
            message: 'Enhanced logging test completed',
            note: 'Check your Discord channel for colorful, formatted logs!'
        });

    } catch (error: any) {
        logger.error('Failed to test logging', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
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