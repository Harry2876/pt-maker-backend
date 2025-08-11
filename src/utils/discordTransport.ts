import Transport from 'winston-transport';
import axios from 'axios';

interface LogInfo {
    level: string;
    message: string;
    timestamp?: string;
    stack?: string;
    [key: string]: any;
}

interface DiscordTransportOptions extends Transport.TransportStreamOptions {
    webhookUrl: string;
    username?: string;
    avatarUrl?: string;
}

class DiscordTransport extends Transport {
    private webhookUrl: string;
    private username: string;
    private avatarUrl: string;
    private logBuffer: any[] = [];
    private batchTimeout: NodeJS.Timeout | null = null;

    constructor(options: DiscordTransportOptions) {
        super(options);
        this.webhookUrl = options.webhookUrl;
        this.username = options.username || '🎮 BGMI Tournament API';
        this.avatarUrl = options.avatarUrl || '';
    }

    log(info: LogInfo, callback: () => void) {
        setImmediate(() => {
            this.emit('logged', info);
        });

        // Add to buffer for batching (to reduce spam)
        this.logBuffer.push(info);

        // Clear existing timeout and set new one
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
        }

        // Send batched logs after 5 seconds of inactivity (reduced spam)
        this.batchTimeout = setTimeout(() => {
            this.sendBatchedLogs();
        }, 5000);

        callback();
    }

    private sendBatchedLogs() {
        if (this.logBuffer.length === 0) return;

        // Group logs by level
        const groupedLogs = this.logBuffer.reduce((acc: { [key: string]: any[] }, log: any) => {
            if (!acc[log.level]) acc[log.level] = [];
            acc[log.level].push(log);
            return acc;
        }, {} as { [key: string]: any[] });

        // Create embeds for each log level
        const embeds = Object.entries(groupedLogs).map(([level, logs]: [string, any[]]) => {
            const cleanMessages = logs.map((log: any) => {
                // Remove ALL possible ANSI codes and formatting
                let cleaned = log.message
                    .replace(/\u001b\[[0-9;]*[mGKHfJABCDHlrsu]/g, '')  // Remove ANSI escape sequences
                    .replace(/\[[0-9;]*[mGKHfJABCDHlrsu]/g, '')        // Remove bracket sequences
                    .replace(/\[39m|\[32m|\[31m|\[33m|\[35m|\[36m|\[37m|\[90m|\[91m|\[92m|\[93m|\[94m|\[95m|\[96m|\[97m/g, '') // Remove all color codes
                    .replace(/⚫|⚪|🔴|🟡|🟢|🔵/g, '') // Remove duplicate emojis from title
                    .trim();
                
                // Remove any remaining ANSI sequences
                cleaned = cleaned.replace(/\x1b\[[0-9;]*m/g, '');
                
                return cleaned;
            });

            // Filter out empty messages
            const filteredMessages = cleanMessages.filter(msg => msg.length > 0);
            
            // Better formatting for multiple messages
            const description = filteredMessages.length > 1
                ? filteredMessages.map((msg: string, i: number) => `**${i + 1}.** ${msg}`).join('\n')
                : `**${filteredMessages[0] || 'No message'}**`;

            return {
                title: `${this.getLevelEmoji(level)} ${level.toUpperCase()}`,
                description: description.length > 2000 ? description.substring(0, 1997) + '...' : description,
                color: this.getColorByLevel(level),
                fields: [
                    {
                        name: '🏷️ Service: BGMI Tournament Backend',
                        value: '\u200B', // invisible character for inline formatting
                        inline: true,
                    },
                    {
                        name: `🌍 Environment: ${process.env.NODE_ENV === 'production' ? '🔴 Production' : '🟡 Development'}`,
                        value: '\u200B',
                        inline: true,
                    },
                    {
                        name: `📊 Count: ${logs.length}`,
                        value: '\u200B',
                        inline: true,
                    }
                ],
                timestamp: new Date().toISOString(),
                footer: {
                    text: `🚀 Pt Maker API • ${new Date().toLocaleString('en-US', {
                        timeZone: 'Asia/Kolkata',
                        hour12: true
                    })} IST`
                }
            };
        });        const payload = {
            username: this.username,
            avatar_url: this.avatarUrl,
            embeds: embeds.slice(0, 10), // Discord limit of 10 embeds per message
        };

        // Send to Discord
        axios.post(this.webhookUrl, payload)
            .then(() => {
                console.log(`✅ Sent batch of ${this.logBuffer.length} logs to Discord`);
            })
            .catch((error) => {
                console.error(`❌ Failed to send batch to Discord:`, error.message);
            });

        // Clear buffer
        this.logBuffer = [];
        this.batchTimeout = null;
    }

    private getLevelEmoji(level: string): string {
        const emojis: { [key: string]: string } = {
            error: '🔴',
            warn: '🟡',
            info: '🟢',
            http: '🔵',
            debug: '⚪',
        };
        return emojis[level] || '⚫';
    }

    private getColorByLevel(level: string): number {
        const colors: { [key: string]: number } = {
            error: 0xff4444,   // Red
            warn: 0xffaa00,    // Orange
            info: 0x44ff44,    // Green
            http: 0x4444ff,    // Blue
            debug: 0x888888,   // Gray
        };
        return colors[level] || 0x000000;
    }
}

export default DiscordTransport;