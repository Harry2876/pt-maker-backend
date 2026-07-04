// Sentry MUST be imported before everything else
import { Sentry } from './utils/instrument';
import crypto from 'crypto';

import express from 'express';

import cors from 'cors';
import helmet from 'helmet';
import logger from './utils/logger';
import { dbManager } from './config/database';
import healthRoutes from './routes/health';
// Import route modules
import authRouter from './routes/authRoutes';
import tournamentRouter from './routes/tournamentRoutes';
import matchRouter from './routes/matchRoutes';
import uploadRouter from './routes/uploadRoutes';
import { matchResultRouter } from './routes/matchResultRoutes';
import groupRouter from './routes/groupRoutes';
import tournamentStageRouter from './routes/tournamentStageRoutes'; // Add this
import teamRegistrationRouter from './routes/teamRegistrationRoutes';
import teamAdvancementRouter from './routes/teamAdvancementRoutes';
import slotManagementRouter from './routes/slotManagementRoutes';
import leaderboardRouter from './routes/leaderboardRoutes';
import quickPTRouter from './routes/quickPTRoutes';
import teamLogoPresetRouter from './routes/teamLogoPresetRoutes';
import templatePresetRouter from './routes/templatePresetRoutes';
import revenueCatWebhookRouter from './routes/revenueCatWebhookRoutes';
import whatsappRouter from './routes/whatsappRoutes';
import redis from './config/redis';
import { templateService } from './services/templateService';
import { WorkersManager } from './workers';
import { QueueService } from './services/queueService';
import { globalErrorHandler } from './middleware/commonMiddleware';
import { validateEnvironment } from './config/envValidator';
import swaggerUi from 'swagger-ui-express';
import { specs } from './config/swagger';
import { swaggerBasicAuth } from './middleware/swaggerAuth';
import devRouter from './routes/devRoutes';

import { loadSpec } from './config/docsloader';
import { env } from './config/env';

validateEnvironment();

const workersManager = new WorkersManager();

const app = express();
const PORT = process.env.PORT || 3000;

function parseCommaSeparatedOrigins(value: string | undefined, fallback: string[]): string[] {
    if (!value?.trim()) return fallback;
    const origins = value.split(',').map((origin) => origin.trim()).filter(Boolean);
    return origins.length > 0 ? origins : fallback;
}

const productionOrigins = parseCommaSeparatedOrigins(process.env.PRODUCTION_ORIGINS, [
    'https://scrymzengineservice.site',
    'https://www.scrymzengineservice.site',
]);

const developmentOrigins = parseCommaSeparatedOrigins(process.env.ALLOWED_ORIGINS, [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
]);

// Configure CORS securely
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' ? productionOrigins : developmentOrigins,
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    maxAge: 86400, // 24 hours preflight cache
};

// Middleware
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'", 'https://cdn.jsdelivr.net'],
                fontSrc: ["'self'", 'https://cdn.jsdelivr.net'],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"],
            },
        },
        crossOriginEmbedderPolicy: false, // For API compatibility
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        },
    })
);
app.use(cors(corsOptions)); // Enable CORS

// Add after CORS middleware
app.use((req, res, next) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

app.use(express.json({ limit: '50mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Parse URL-encoded bodies

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

// Capture unhandled crashes before the process dies
process.on('uncaughtException', (error) => {
    logger.error('💥 Uncaught Exception — process will exit', error);
    Sentry.captureException(error, { tags: { type: 'uncaughtException' } });
    Sentry.flush(10000).finally(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('💥 Unhandled Promise Rejection', error);
    Sentry.captureException(error, { tags: { type: 'unhandledRejection' } });
    Sentry.flush(10000).finally(() => process.exit(1));
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('🛑 Received SIGTERM, shutting down gracefully');
    await workersManager.stopAllWorkers();
    await redis.disconnect();
    process.exit(0);
});

app.use((req, res, next) => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID().slice(0, 8);

    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);

    const originalEnd = res.end.bind(res);
    res.end = function (chunk?: any, encoding?: any) {
        const duration = Date.now() - startTime;

        if (!req.url.startsWith('/health') && !req.url.startsWith('/api-docs')) {
            logger.http(
                `${req.method} ${req.url} ${res.statusCode} ${duration}ms [${requestId}]`
            );
        }
        return originalEnd(chunk, encoding);
    };
    next();
});
// Health check route
app.use('/', healthRoutes);

app.use(
    '/api-docs',
    swaggerBasicAuth,
    swaggerUi.serve,
    swaggerUi.setup(specs, {
        explorer: true,
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'BGMI Tournament API Docs - Secure Access',
        swaggerOptions: {
            persistAuthorization: true,
        },
    })
);

app.get('/openapi.json', swaggerBasicAuth, (req, res) => {
    try {
        res.json(loadSpec());
    } catch (err) {
        res.status(500).json({ error: 'Could not load API spec' });
    }
});

let scalarHandler: any = null;
let scalarInitPromise: Promise<void> | null = null;

app.use('/api-docs-v2', swaggerBasicAuth, async (req, res, next) => {
    try {
        if (!scalarHandler) {
            if (!scalarInitPromise) {
                scalarInitPromise = (async () => {
                    const scalar = await new Function(
                        "return import('@scalar/express-api-reference')"
                    )();

                    scalarHandler = scalar.apiReference({
                        spec: { url: '/openapi.json' },
                        theme: 'bluePlanet',
                        layout: 'modern',
                        pageTitle: 'BGMI Tournament API',
                        darkMode: true,
                        authentication: {
                            preferredSecurityScheme: 'bearerAuth',
                            http: {
                                bearer: {
                                    token: env.DOCS_TEST_TOKEN ?? '',
                                },
                            },
                        },
                    });
                })();
            }

            await scalarInitPromise;
        }

        return scalarHandler(req, res, next);
    } catch (error) {
        return next(error);
    }
});

// Dev routes — only when ENABLE_DEV_ROUTES=true in .env
if (env.ENABLE_DEV_ROUTES) {
    app.use('/api/v1/dev', devRouter);
}

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/tournaments', tournamentRouter);
app.use('/api/v1/matches', matchRouter);
app.use('/api/v1/uploads', uploadRouter);
app.use('/api/v1/groups', groupRouter);
app.use('/api/v1/team-registrations', teamRegistrationRouter);
app.use('/api/v1/match-results', matchResultRouter);
app.use('/api/v1/tournament-stages', tournamentStageRouter);
app.use('/api/v1/team-advancement', teamAdvancementRouter);
app.use('/api/v1/slot-management', slotManagementRouter);
app.use('/api/v1/leaderboards', leaderboardRouter);
app.use('/api/v1/quick-pt', quickPTRouter);
app.use('/api/v1/quick-pt/logo-presets', teamLogoPresetRouter);
app.use('/api/v1/quick-pt/template-presets', templatePresetRouter);
app.use('/api/v1/whatsapp', whatsappRouter);
app.use('/api/v1/webhooks', revenueCatWebhookRouter);

// app.use('/api/v1/admin', adminRouter);

// Sentry error handler — must be before globalErrorHandler
Sentry.setupExpressErrorHandler(app);



// Error handling middleware
app.use(globalErrorHandler);

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
        await dbManager.connect();

        const server = app.listen(PORT, () => {
            logger.info(`🚀 Server running on port ${PORT}`);
            logger.info(`💾 Database connected successfully`);
            // Force-flush all startup logs to Sentry after they've had time to queue
            setTimeout(() => Sentry.flush(10000).catch(() => {}), 3000);
            // Pre-warm template cache so no user hits a cold-cache R2 burst
            templateService.getAllTemplates()
                .then(() => logger.info('✅ Template cache pre-warmed'))
                .catch(err => logger.warn('⚠️  Template cache pre-warm failed (non-fatal):', err));
        });

        // OCR batch + standings generation can take up to ~90s.
        // Python AI client already has a 300s axios timeout — the HTTP server
        // must stay alive at least that long so long-running routes aren't
        // killed mid-request by the Node.js idle timeout.
        server.timeout = 310_000;        // 310 s — just above Python AI axios timeout
        server.keepAliveTimeout = 65_000; // keep-alive > any proxy (nginx default: 60s)
        server.headersTimeout = 320_000;  // must be > server.timeout
    } catch (error) {
        logger.error('❌ Failed to start server:', error);
        Sentry.captureException(error, { tags: { phase: 'startup' } });
        Sentry.flush(2000).catch(() => {});
        process.exit(1);
    }
}

// Start the application
startServer();
