import Transport from 'winston-transport';
import { Sentry } from './instrument';

// Map Winston levels to Sentry logger methods
const LEVEL_MAP: Record<string, keyof typeof Sentry.logger> = {
    error: 'error',
    warn: 'warn',
    info: 'info',
    http: 'info',
    debug: 'debug',
};

export class SentryTransport extends Transport {
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private static initialized = false;

    constructor() {
        super({ level: 'debug' });
        if (!SentryTransport.initialized) {
            SentryTransport.initialized = true;
            console.log('[SentryTransport] Transport registered — Sentry.logger available:', typeof Sentry.logger !== 'undefined');
        }
    }

    // Immediate for warn/error; 2s debounce for everything else
    private scheduleFlush(immediate = false): void {
        if (immediate) {
            if (this.flushTimer) clearTimeout(this.flushTimer);
            this.flushTimer = null;
            Sentry.flush(10000).catch(() => {});
            return;
        }
        // Always reset the debounce timer so the flush happens 2s after the LAST log
        if (this.flushTimer) clearTimeout(this.flushTimer);
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            Sentry.flush(10000).catch(() => {});
        }, 2000);
    }

    log(info: any, callback: () => void): void {
        setImmediate(() => this.emit('logged', info));

        // Use Symbol.for('level') — always the raw uncolorized level string,
        // because colorize() mutates info.level with ANSI escape codes
        const rawLevel: string = info[Symbol.for('level')] ?? 'info';
        const sentryMethod = LEVEL_MAP[rawLevel] ?? 'info';
        const sentryLog = Sentry.logger[sentryMethod] as (...args: any[]) => void;

        if (!sentryLog || typeof sentryLog !== 'function') {
            console.error('[SentryTransport] sentryLog is not a function for level:', rawLevel);
            callback();
            return;
        }

        // Strip Winston internal Symbol keys and non-serializable values from metadata
        const cleanMeta: Record<string, unknown> = {};
        for (const key of Object.keys(info)) {
            if (key !== 'level' && key !== 'message') {
                const val = info[key];
                if (val instanceof Error) {
                    cleanMeta[key] = val.message;
                } else if (typeof val !== 'function') {
                    cleanMeta[key] = val;
                }
            }
        }

        try {
            sentryLog.call(
                Sentry.logger,
                info.message,
                Object.keys(cleanMeta).length ? cleanMeta : undefined
            );
        } catch (e) {
            console.error('[SentryTransport] sentryLog threw:', e);
        }

        // Warn/error flush immediately; all others batch with 2s debounce
        this.scheduleFlush(rawLevel === 'warn' || rawLevel === 'error');

        callback();
    }
}
