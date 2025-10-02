import tracer from 'dd-trace';
import StatsD from 'hot-shots';
import { env } from './env';

// Production-ready Datadog tracer initialization
if (env.ENABLE_DATADOG && env.DD_API_KEY) {
    try {
        tracer.init({
            service: env.DD_SERVICE,
            env: env.DD_ENV,
            version: env.DD_VERSION,
            hostname: env.DD_AGENT_HOST,
            port: env.DD_TRACE_AGENT_PORT,
            logInjection: true, // Correlate logs with traces
            runtimeMetrics: true, // CPU, memory, GC metrics
            profiling: true, // Continuous profiler
            plugins: {
                // Enable automatic instrumentation
                express: {
                    blocklist: ['/health', '/metrics', '/favicon.ico']
                },
                redis: {
                    enabled: true
                },
                http: {
                    enabled: true,
                    blocklist: [
                        'datadog.com',
                        'datadoghq.com'
                    ]
                },
                fs: false, // Disable file system tracing for performance
                dns: false // Disable DNS tracing for performance
            }
        });
        console.log('✅ Datadog APM tracer initialized for production');
    } catch (error) {
        console.error('❌ Failed to initialize Datadog tracer:', error);
    }
} else {
    console.log('⚠️ Datadog tracer not initialized - missing API key or disabled');
}

// Production-ready StatsD client
export const datadogMetrics = new StatsD({
    host: env.DD_AGENT_HOST,
    port: env.DD_DOGSTATSD_PORT,
    prefix: 'pt_maker.',
    globalTags: {
        service: env.DD_SERVICE,
        env: env.DD_ENV,
        version: env.DD_VERSION,
        region: process.env.AWS_REGION || 'unknown',
        instance: process.env.HOSTNAME || 'unknown'
    },
    errorHandler: (error) => {
        console.error('StatsD error:', error);
    },
    // Production optimizations
    maxBufferSize: 1024,
    bufferFlushInterval: 1000,
    telegraf: false
});

// Health check for Datadog metrics
export const healthCheckDatadog = (): Promise<boolean> => {
    return new Promise((resolve) => {
        datadogMetrics.increment('health.check', 1, {}, (error) => {
            if (error) {
                console.error('Datadog health check failed:', error);
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });
};

export default tracer;