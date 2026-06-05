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

    constructor() {
        super({ level: 'debug' });
    }

    // Debounced flush — waits 800ms after last log, then flushes the whole batch
    // Warn/error bypass the debounce and flush immediately
    private scheduleFlush(immediate = false): void {
        if (immediate) {
            if (this.flushTimer) clearTimeout(this.flushTimer);
            this.flushTimer = null;
            Sentry.flush(2000).catch(() => {});
            return;
        }
        if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => {
                this.flushTimer = null;
                Sentry.flush(2000).catch(() => {});
            }, 800);
        }
    }

    log(info: any, callback: () => void): void {
        setImmediate(() => this.emit('logged', info));

        // Use Symbol.for('level') — always the raw uncolorized level string,
        // because colorize() mutates info.level with ANSI escape codes
        const rawLevel: string = info[Symbol.for('level')] ?? 'info';
        const sentryMethod = LEVEL_MAP[rawLevel] ?? 'info';
        const sentryLog = Sentry.logger[sentryMethod] as (...args: any[]) => void;

        // Strip Winston internal Symbol keys and non-serializable values from metadata
        const cleanMeta: Record<string, unknown> = {};
        for (const key of Object.keys(info)) {
            if (key !== 'level' && key !== 'message') {
                const val = info[key];
                // Skip Error objects and functions — Sentry attributes must be primitives
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

        // Warn/error flush immediately; info/debug/http batch and flush after 800ms
        this.scheduleFlush(rawLevel === 'warn' || rawLevel === 'error');

        callback();
    }
}
