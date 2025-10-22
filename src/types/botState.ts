
export type BotState = 
    | 'ACTIVE'           // Bot is working normally in guild
    | 'REMOVED'          // Bot was kicked/removed from guild
    | 'REINSTALLED'      // Bot was re-added after removal
    | 'PERMISSION_CHANGED' // Bot permissions were modified
    | 'SUSPENDED'        // Bot suspended due to policy violation
    | 'MAINTENANCE';     // Bot temporarily disabled for maintenance

// State change reasons
export type StateChangeReason = 
    | 'BOT_KICKED'       // Bot was manually removed
    | 'BOT_INVITED'      // Bot was invited to guild
    | 'PERMISSIONS_UPDATED' // Bot permissions changed
    | 'GUILD_DELETED'    // Guild was deleted
    | 'OWNER_CHANGED'    // Guild ownership transferred
    | 'MAINTENANCE_MODE' // System maintenance
    | 'POLICY_VIOLATION'; // Terms of service violation

// Cache interface for bot state
export interface BotStateCache {
    id: string;
    guildId: string;
    state: BotState;
    previousState?: BotState;
    reason: StateChangeReason;
    changedAt: string;
    changedBy?: string; // User ID who caused the change
    metadata?: {
        permissions?: string[];
        previousPermissions?: string[];
        installationCount?: number;
        lastActiveAt?: string;
        [key: string]: any;
    };
    dbStatus: 'PENDING_SYNC' | 'SYNCED';
    createdAt: string;
    updatedAt: string;
}

// Create state data
export interface CreateBotStateData {
    guildId: string;
    state: BotState;
    reason: StateChangeReason;
    changedBy?: string;
    metadata?: BotStateCache['metadata'];
}

// Update state data  
export interface UpdateBotStateData {
    state?: BotState;
    reason?: StateChangeReason;
    changedBy?: string;
    metadata?: BotStateCache['metadata'];
}

// State history entry
export interface BotStateHistory {
    id: string;
    guildId: string;
    fromState?: BotState;
    toState: BotState;
    reason: StateChangeReason;
    changedAt: string;
    changedBy?: string;
    metadata?: Record<string, any>;
}

// State analytics
export interface BotStateAnalytics {
    guildId: string;
    totalInstallations: number;
    totalRemovals: number;
    currentState: BotState;
    stateHistory: BotStateHistory[];
    averageActiveTime?: number; // in milliseconds
    lastInstallationDate?: string;
    lastRemovalDate?: string;
}

export interface GlobalBotStateAnalytics {
    totalGuilds: number;
    activeGuilds: number;
    removedGuilds: number;
    recentInstalls: number;
    recentRemovals: number;
    stateDistribution: Record<string, number>;
    trends: Array<{
        date: string;
        installs: number;
        removals: number;
    }>;
}