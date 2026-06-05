import * as Sentry from '@sentry/node';
import { env } from '../config/env';

if (env.SENTRY_DSN) {
    Sentry.init({
        dsn: env.SENTRY_DSN,
        environment: env.NODE_ENV,
        sendDefaultPii: false,
        tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,

        // Capture console.warn and console.error as Sentry logs
        integrations: [
            Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
        ],

        // Enable structured log ingestion
        enableLogs: true,

        beforeSend(event) {
            if (event.level && !['error', 'warning', 'fatal'].includes(event.level)) {
                return null;
            }
            return event;
        },

    });
    console.log(`[Sentry] Initialized — env=${env.NODE_ENV}`);
} else {
    console.log('[Sentry] Skipped — SENTRY_DSN not set');
}

export { Sentry };
