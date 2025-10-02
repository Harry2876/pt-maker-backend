declare module 'datadog-winston' {
  import { TransportOptions } from 'winston-transport';
  
  interface DatadogWinstonOptions extends TransportOptions {
    apiKey: string;
    hostname?: string;
    service?: string;
    ddsource?: string;
    ddtags?: string;
  }
  
  class DatadogWinston {
    constructor(options: DatadogWinstonOptions);
  }
  
  export = DatadogWinston;
}

declare module 'hot-shots' {
  interface StatsDOptions {
    host?: string;
    port?: number;
    prefix?: string;
    globalTags?: Record<string, string>;
    errorHandler?: (error: Error) => void;
    maxBufferSize?: number;
    bufferFlushInterval?: number;
    telegraf?: boolean;
  }
  
  class StatsD {
    constructor(options?: StatsDOptions);
    increment(stat: string, value?: number, tags?: Record<string, string>, callback?: (error?: Error) => void): void;
    histogram(stat: string, value: number, tags?: Record<string, string>, callback?: (error?: Error) => void): void;
    gauge(stat: string, value: number, tags?: Record<string, string>, callback?: (error?: Error) => void): void;
    timing(stat: string, value: number, tags?: Record<string, string>, callback?: (error?: Error) => void): void;
    set(stat: string, value: number, tags?: Record<string, string>, callback?: (error?: Error) => void): void;
    close(): void;
  }
  
  export = StatsD;
}

declare module 'dd-trace' {
  interface TracerOptions {
    service?: string;
    env?: string;
    version?: string;
    hostname?: string;
    port?: number;
    logInjection?: boolean;
    runtimeMetrics?: boolean;
    profiling?: boolean;
    plugins?: Record<string, any>;
  }
  
  interface Tracer {
    init(options?: TracerOptions): void;
    trace<T>(name: string, fn: () => T): T;
    trace<T>(name: string, options: any, fn: () => T): T;
  }
  
  const tracer: Tracer;
  export = tracer;
}