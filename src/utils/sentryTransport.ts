import Transport from 'winston-transport';
import { Sentry } from './instrument';

export class SentryTransport extends Transport {
    constructor() {
        super({ level: 'debug' });
    }

    log(info: any, callback: () => void): void {
        setImmediate(() => this.emit('logged', info));

        const { level, message, ...meta } = info;

        const sentryLog = (Sentry.logger as any)[level] ?? Sentry.logger.info;

        // Strip Winston internal Symbol keys
        const cleanMeta: Record<string, unknown> = {};
        for (const key of Object.keys(meta)) {
            cleanMeta[key] = meta[key];
        }

        sentryLog.call(
            Sentry.logger,
            message,
            Object.keys(cleanMeta).length ? cleanMeta : undefined
        );

        // Flush immediately for warn/error so they appear in Sentry right away
        if (level === 'warn' || level === 'error') {
            Sentry.flush(2000).catch(() => {});
        }

        callback();
    }
}
