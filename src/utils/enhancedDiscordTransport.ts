import Transport from 'winston-transport';
import axios from 'axios';
import { LogInfo, DiscordWebhookConfig, LogSecurity, LogInfoSchema, DiscordWebhookSchema } from './loggerValidation';

interface EnhancedLogInfo extends LogInfo {
    [key: string]: any;
}

interface EnhancedDiscordTransportOptions extends Transport.TransportStreamOptions {
    webhookUrl: string;
    username?: string;
    avatarUrl?: string;
    enableSecurity?: boolean;
}

class EnhancedDiscordTransport extends Transport {
    private webhookUrl: string;
    private username: string;
    private avatarUrl: string;
    private enableSecurity: boolean;
    private logBuffer: EnhancedLogInfo[] = [];
    private batchTimeout: NodeJS.Timeout | null = null;
    private readonly BATCH_DELAY = 3000; // 3 seconds

    constructor(options: EnhancedDiscordTransportOptions) {
        super(options);

        const validatedConfig = this.validateConfig(options);

        this.webhookUrl = validatedConfig.webhookUrl;
        this.username = validatedConfig.username || '🎮 BGMI Tournament API Enhanced';
        this.avatarUrl = validatedConfig.avatarUrl || '';
        this.enableSecurity = options.enableSecurity ?? true;

        console.log('✅ Enhanced Discord Transport initialized');
    }

    private validateConfig(options: EnhancedDiscordTransportOptions): DiscordWebhookConfig {
        try {
            const config = {
                webhookUrl: options.webhookUrl,
                username: options.username,
                avatarUrl: options.avatarUrl
            };
            return DiscordWebhookSchema.parse(config);
        } catch (error) {
            console.error('❌ Discord webhook validation failed:', error);
            throw new Error('Invalid Discord webhook configuration');
        }
    }

    log(info: EnhancedLogInfo, callback: () => void) {
        setImmediate(() => this.emit('logged', info));

        try {
            // Extract and clean all data from Winston's log object
            const { level, message, timestamp, stack, ...otherData } = info;

            // Clean ANSI codes from level and message
            const cleanLevel = this.cleanLogMessage(level || 'info');
            const cleanMessage = this.cleanLogMessage(message || 'No message');

            // Filter out invalid metadata keys (symbols, nulls, etc.)
            const cleanMetadata: Record<string, any> = {};
            for (const [key, value] of Object.entries(otherData)) {
                // Only include valid string keys and non-null values
                if (typeof key === 'string' && key.length > 0 && value !== null && value !== undefined) {
                    // Skip Winston's internal properties
                    if (!['level', 'message', 'timestamp', 'stack', 'splat', Symbol.for('level')].includes(key)) {
                        cleanMetadata[key] = value;
                    }
                }
            }

            const normalizedInfo = {
                level: cleanLevel,
                message: cleanMessage,
                timestamp: timestamp || new Date().toISOString(),
                stack: stack,
                metadata: cleanMetadata
            };

            // Debug: Log what we're processing
            // console.log('🔍 Processing cleaned log:', {
            //     level: normalizedInfo.level,
            //     message: normalizedInfo.message.substring(0, 100) + '...',
            //     hasMetadata: Object.keys(normalizedInfo.metadata).length > 0,
            //     metadataKeys: Object.keys(normalizedInfo.metadata)
            // });

            const validatedInfo = LogInfoSchema.parse(normalizedInfo);
            const processedInfo = this.enableSecurity ? this.applySecurityMasking(validatedInfo) : validatedInfo;

            this.logBuffer.push(processedInfo as EnhancedLogInfo);

            if (this.batchTimeout) clearTimeout(this.batchTimeout);

            this.batchTimeout = setTimeout(() => {
                this.sendEnhancedBatchedLogs();
            }, this.BATCH_DELAY);

        } catch (error) {
            console.error('❌ Log validation failed:', error);
            // Create a safe fallback log
            this.logBuffer.push({
                level: 'error',
                message: `[INVALID_LOG] ${this.cleanLogMessage(info.message || JSON.stringify(info, null, 2))}`,
                timestamp: new Date().toISOString(),
                metadata: {}
            } as EnhancedLogInfo);
        }

        callback();
    }

    private applySecurityMasking(info: LogInfo): LogInfo {
        return {
            ...info,
            message: LogSecurity.maskSensitiveInfo(info.message),
            metadata: info.metadata ? this.maskMetadata(info.metadata) : {}
        };
    }

    private maskMetadata(metadata: Record<string, any>): Record<string, any> {
        const masked: Record<string, any> = {};
        for (const [key, value] of Object.entries(metadata)) {
            if (typeof value === 'string') masked[key] = LogSecurity.maskSensitiveInfo(value);
            else if (typeof value === 'object' && value !== null) masked[key] = '[OBJECT_MASKED]';
            else masked[key] = value;
        }
        return masked;
    }

    private sendEnhancedBatchedLogs() {
        if (this.logBuffer.length === 0) return;

        try {
            const groupedLogs = this.groupLogsByLevel(this.logBuffer);
            const embeds = this.createEnhancedEmbeds(groupedLogs);

            const alertContent = this.getAlertContent(groupedLogs);
            const payload: any = {
                username: this.username,
                avatar_url: this.avatarUrl || undefined,
                embeds: embeds.slice(0, 10),
                // only include content if we actually have a string (omit null)
                ...(alertContent ? { content: alertContent } : {})
            };

            const payloadClean = this.cleanPayload(payload);

            // debug: log embed colors (decimal + hex) for verification
            console.log('🔍 Discord payload preview:', {
                embeds: payloadClean.embeds?.map((embed: any) => {
                    const dec = Number(embed.color ?? 0);
                    return {
                        title: embed.title,
                        colorDecimal: dec,
                        colorHex: '0x' + dec.toString(16).padStart(6, '0')
                    };
                })
            });

            this.sendToDiscord(payloadClean);
        } catch (error) {
            console.error('❌ Failed to process batched logs:', error);
        } finally {
            this.logBuffer = [];
            this.batchTimeout = null;
        }
    }

    private groupLogsByLevel(logs: EnhancedLogInfo[]): Record<string, EnhancedLogInfo[]> {
        return logs.reduce((acc: Record<string, EnhancedLogInfo[]>, log: EnhancedLogInfo) => {
            const lvl = (log.level || 'info').toLowerCase();
            if (!acc[lvl]) acc[lvl] = [];
            acc[lvl].push(log);
            return acc;
        }, {});
    }

    private createEnhancedEmbeds(groupedLogs: Record<string, EnhancedLogInfo[]>) {
        return Object.entries(groupedLogs).map(([level, logs]) => {
            const colorNum = this.getVibrantColor(level);
            const colorSafe = this.ensureColorNumber(colorNum);

            // Create detailed description with metadata
            const description = this.createDetailedDescription(logs, level);

            // Create fields with metadata details
            const fields = this.createDetailedFields(logs);

            return {
                title: `${this.getEnhancedEmoji(level)} ${level.toUpperCase()} LOG`,
                description,
                color: colorSafe,
                fields: [
                    { name: '🎮 Service', value: 'BGMI Tournament API', inline: true },
                    { name: '🌍 Environment', value: process.env.NODE_ENV === 'production' ? '🔴 Production' : '🟡 Development', inline: true },
                    { name: '📊 Count', value: `${logs.length} message${logs.length > 1 ? 's' : ''}`, inline: true },
                    ...fields, // Add detailed metadata fields
                    { name: '⏰ Time Range', value: this.getTimeRange(logs), inline: false }
                ],
                timestamp: new Date().toISOString(),
                footer: {
                    text: `🚀 Enhanced Logger • ${new Date().toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        hour12: true
                    })} IST`
                }
            };
        });
    }

    /**
     * Create detailed description with main message and metadata
     */
    private createDetailedDescription(logs: EnhancedLogInfo[], level: string): string {
        if (logs.length === 0) return `**No ${level} logs**`;

        const descriptions = logs.map((log, index) => {
            let desc = `**${logs.length > 1 ? `${index + 1}. ` : ''}${this.cleanLogMessage(log.message)}**`;

            // Add stack trace if available
            if (log.stack) {
                desc += `\n\`\`\`\n${log.stack}\n\`\`\``;
            }

            return desc;
        });

        const combined = descriptions.join('\n\n');
        return combined.length > 2000 ? combined.substring(0, 1997) + '...' : combined;
    }

    /**
     * Create detailed fields from metadata
     */
    private createDetailedFields(logs: EnhancedLogInfo[]): any[] {
        const fields: any[] = [];

        logs.forEach((log, logIndex) => {
            if (log.metadata && Object.keys(log.metadata).length > 0) {
                // Skip the originalInfo to avoid circular reference
                const { originalInfo, ...cleanMetadata } = log.metadata;

                Object.entries(cleanMetadata).forEach(([key, value]) => {
                    if (key && value !== undefined && value !== null) {
                        let displayValue = '';

                        if (typeof value === 'object') {
                            try {
                                // Safe JSON stringify with circular reference handling
                                displayValue = `\`\`\`json\n${JSON.stringify(value, this.safeJsonReplacer, 2)}\n\`\`\``;
                            } catch (jsonError) {
                                // Fallback for circular references
                                displayValue = `\`[Object: ${value.constructor?.name || 'Unknown'}]\``;
                            }
                        } else {
                            displayValue = `\`${String(value)}\``;
                        }

                        // Ensure field values don't exceed Discord limits
                        if (displayValue.length > 1024) {
                            displayValue = displayValue.substring(0, 1021) + '...';
                        }

                        fields.push({
                            name: `📋 ${key}${logs.length > 1 ? ` (Log ${logIndex + 1})` : ''}`,
                            value: displayValue,
                            inline: true
                        });
                    }
                });
            }
        });

        // Limit to Discord's 25 field maximum, keeping space for our standard fields
        return fields.slice(0, 20);
    }

    private cleanLogMessage(message: string): string {
        if (!message) return '';

        return message
            // Remove all ANSI escape sequences
            .replace(/\u001b\[[0-9;]*[mGKHfJABCDHlrsu]/g, '')
            .replace(/\u001B\[[0-9;]*[mGKHfJABCDHlrsu]/g, '')
            .replace(/\x1b\[[0-9;]*[mGKHfJABCDHlrsu]/g, '')
            .replace(/\x1B\[[0-9;]*[mGKHfJABCDHlrsu]/g, '')
            // Remove bracket sequences
            .replace(/\[[0-9;]*[mGKHfJABCDHlrsu]/g, '')
            // Remove specific color codes
            .replace(/\[39m|\[32m|\[31m|\[33m|\[35m|\[36m|\[37m|\[90m|\[91m|\[92m|\[93m|\[94m|\[95m|\[96m|\[97m/g, '')
            // Remove duplicate emojis
            .replace(/⚫|⚪|🔴|🟡|🟢|🔵/g, '')
            .trim();
    }

    private formatLogDescription(cleanMessages: string[], level: string): string {
        const filtered = cleanMessages.filter(m => m.length > 0);
        if (filtered.length === 0) return `**No message content for ${level} log**`;
        if (filtered.length === 1) return `\`\`\`\n${filtered[0]}\n\`\`\``;
        const desc = filtered.map((m, i) => `**${i + 1}.** ${m}`).join('\n');
        return desc.length > 4000 ? desc.substring(0, 3997) + '...' : desc;
    }

    private getEnhancedEmoji(level: string): string {
        const emojis: { [key: string]: string } = {
            error: '🚨', warn: '⚠️', info: '💡', http: '🌐', debug: '🔍'
        };
        return emojis[level.toLowerCase()] || '📝';
    }

    private getVibrantColor(level: string): number {
        // Remove ANSI escape codes using regex (no external dependencies)
        const cleanLevel = level.replace(/\u001b\[[0-9;]*m/g, '').toLowerCase();

        const colors: Record<string, number> = {
            error: 0xD32F2F,  // deep red
            warn: 0xFBC02D,  // amber
            info: 0x1976D2,  // blue
            http: 0x0288D1,  // cyan blue
            debug: 0x616161   // cool gray
        };

        return colors[cleanLevel] ?? 0x000000;
    }

    /**
     * Robustly ensure color is a number between 0 and 0xFFFFFF.
     */
    private ensureColorNumber(v: any): number {
        if (typeof v === 'string') {
            // accept "0xFF0000" or "FF0000" or decimal string
            const cleaned = v.startsWith('0x') ? v.slice(2) : v;
            if (/^[0-9a-fA-F]+$/.test(cleaned)) return parseInt(cleaned, 16) & 0xFFFFFF;
            const n = Number(v);
            return Number.isFinite(n) ? (Math.floor(n) & 0xFFFFFF) : 0;
        }
        if (typeof v === 'number' && Number.isFinite(v)) {
            return Math.floor(v) & 0xFFFFFF;
        }
        return 0;
    }

    private getTimeRange(logs: EnhancedLogInfo[]): string {
        if (logs.length === 1) {
            return new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
        }
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
        return `${timeStr} (${logs.length} logs)`;
    }

    private getAlertContent(groupedLogs: Record<string, EnhancedLogInfo[]>): string | null {
        const errorCount = groupedLogs.error?.length || 0;
        const warnCount = groupedLogs.warn?.length || 0;
        if (errorCount > 0) return `🚨 **ALERT**: ${errorCount} error${errorCount > 1 ? 's' : ''} detected!`;
        if (warnCount > 3) return `⚠️ **WARNING**: High warning count (${warnCount})`;
        return null;
    }

    /**
     * Recursively remove null/undefined values from payload so Discord doesn't receive "content": null etc.
     */
    private cleanPayload(obj: any): any {
        if (Array.isArray(obj)) return obj.map(item => this.cleanPayload(item)).filter(i => i !== null && i !== undefined);
        if (obj && typeof obj === 'object') {
            const out: any = {};
            for (const [k, v] of Object.entries(obj)) {
                if (v === null || v === undefined) continue;
                const cleaned = this.cleanPayload(v);
                if (cleaned === null || cleaned === undefined) continue;
                out[k] = cleaned;
            }
            return Object.keys(out).length ? out : undefined;
        }
        return obj;
    }

    private async sendToDiscord(payload: any) {
        if (!this.webhookUrl) {
            console.error('🚫 No webhook URL configured — aborting sendToDiscord');
            return;
        }

        try {
            const body = JSON.stringify(payload);

            const response = await axios.post(this.webhookUrl, body, {
                timeout: 10000,
                headers: { 'Content-Type': 'application/json' }
            });

            console.log('✅ Sent batch to Discord, status:', response.status);
        } catch (error: any) {
            console.error('❌ Failed to send batch to Discord:', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                message: error.message
            });

            if (error.response?.status === 404) {
                console.error('🚫 Discord webhook URL is invalid - disabling transport');
                this.webhookUrl = '';
            }
        }
    }

        private safeJsonReplacer(key: string, value: any): any {
        // Handle circular references and problematic objects
        if (value === null || value === undefined) {
            return value;
        }

        // Skip circular reference prone objects
        if (typeof value === 'object') {
            // Skip axios request/response objects
            if (value.constructor?.name === 'ClientRequest' || 
                value.constructor?.name === 'IncomingMessage' ||
                value.constructor?.name === 'Socket' ||
                key === 'request' || key === 'response' || key === 'config') {
                return '[Circular Reference Removed]';
            }

            // Handle axios errors specifically
            if (value.isAxiosError) {
                return {
                    isAxiosError: true,
                    message: value.message,
                    status: value.response?.status,
                    statusText: value.response?.statusText,
                    data: value.response?.data
                };
            }

            // Handle standard errors
            if (value instanceof Error) {
                return {
                    name: value.name,
                    message: value.message,
                    stack: value.stack?.split('\n').slice(0, 5) // Truncate stack trace
                };
            }
        }

        return value;
    }
}



export default EnhancedDiscordTransport;