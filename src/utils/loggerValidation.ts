import { z } from 'zod';
import CryptoJS from 'crypto-js';

// Zod schemas for validation
export const LogInfoSchema = z.object({
    level: z.string(), // Accept any string level
    message: z.string().min(1),
    timestamp: z.string().optional(),
    stack: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional().default({}), // Default to empty object
}).passthrough(); // Allow additional properties that Winston might add

export const DiscordWebhookSchema = z.object({
    webhookUrl: z.string().url('Invalid Discord webhook URL'),
    username: z.string().min(1).max(80).optional(),
    avatarUrl: z.string().url().optional(),
});

export const DiscordEmbedSchema = z.object({
    title: z.string().max(256),
    description: z.string().max(4096),
    color: z.number().int().min(0).max(16777215),
    fields: z.array(z.object({
        name: z.string().max(256),
        value: z.string().max(1024),
        inline: z.boolean().optional(),
    })).max(25).optional(),
    timestamp: z.string().optional(),
    footer: z.object({
        text: z.string().max(2048),
        icon_url: z.string().url().optional(),
    }).optional(),
});

export type LogInfo = z.infer<typeof LogInfoSchema>;
export type DiscordWebhookConfig = z.infer<typeof DiscordWebhookSchema>;
export type DiscordEmbed = z.infer<typeof DiscordEmbedSchema>;

// Security utilities
export class LogSecurity {
    private static readonly ENCRYPTION_KEY = process.env.LOG_ENCRYPTION_KEY || 'default-key-change-in-production';

    /**
     * Encrypt sensitive data before logging
     */
    static encryptSensitive(data: string): string {
        try {
            return CryptoJS.AES.encrypt(data, this.ENCRYPTION_KEY).toString();
        } catch (error) {
            return '[ENCRYPTION_FAILED]';
        }
    }

    /**
     * Decrypt sensitive data (for debugging only)
     */
    static decryptSensitive(encryptedData: string): string {
        try {
            const bytes = CryptoJS.AES.decrypt(encryptedData, this.ENCRYPTION_KEY);
            return bytes.toString(CryptoJS.enc.Utf8);
        } catch (error) {
            return '[DECRYPTION_FAILED]';
        }
    }

    /**
     * Mask sensitive information in strings
     */
    static maskSensitiveInfo(message: string): string {
        // Mask common sensitive patterns
        return message
            .replace(/password["\s]*[:=]["\s]*[^"\s,}]+/gi, 'password: [MASKED]')
            .replace(/token["\s]*[:=]["\s]*[^"\s,}]+/gi, 'token: [MASKED]')
            .replace(/api[_\s]*key["\s]*[:=]["\s]*[^"\s,}]+/gi, 'api_key: [MASKED]')
            .replace(/secret["\s]*[:=]["\s]*[^"\s,}]+/gi, 'secret: [MASKED]')
            .replace(/phone["\s]*[:=]["\s]*[^"\s,}]+/gi, 'phone: [MASKED]')
            .replace(/otp["\s]*[:=]["\s]*[^"\s,}]+/gi, 'otp: [MASKED]')
            .replace(/webhook["\s]*[:=]["\s]*[^"\s,}]+/gi, 'webhook: [MASKED]');
    }

    /**
     * Validate webhook URL without exposing it
     */
    static validateWebhookUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            return parsed.hostname === 'discord.com' || parsed.hostname === 'discordapp.com';
        } catch {
            return false;
        }
    }
}

// Environment validation
export const validateEnvironment = () => {
    const envSchema = z.object({
        DISCORD_WEBHOOK_URL: z.string().url().optional(),
        DISCORD_LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
        DISCORD_DEV_WEBHOOK_URL: z.string().url().optional(),
        DISCORD_DEV_LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('debug'),
        NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
        LOG_ENCRYPTION_KEY: z.string().min(16).optional(),
    });

    try {
        return envSchema.parse(process.env);
    } catch (error) {
        console.error('❌ Environment validation failed:', error);
        throw new Error('Invalid environment configuration for logging');
    }
};
