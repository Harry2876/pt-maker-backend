export interface DiscordRegistrationSessionCache {
    id: string;
    guildId: string;
    channelId: string;
    name: string;
    groupId: number;
    isActive: boolean;
    maxSlots: number;
    currentSlots: number;
    startedAt?: string;
    endedAt?: string;
    duration: number;
    status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

// Registration Queue Entry Interface
export interface DiscordRegistrationQueueEntry {
    id: string;
    sessionId: string;
    guildId: string;
    teamName: string;
    userId: string;
    userDiscord: string;
    merit: number;
    position: number;
    status: 'QUEUED' | 'ASSIGNED' | 'WAITING_LIST' | 'EXPIRED';
    joinedAt: string;
    assignedSlot?: number;
    assignedAt?: string;
    processedAt?: string;
}

// Team Merit Interface
export interface DiscordTeamMeritCache {
    id: string;
    guildId: string;
    teamName: string;
    currentMerit: number;
    totalEarned: number;
    totalLost: number;
    lastAction?: 'GOOD_REGISTRATION' | 'ATTENDED_MATCH' | 'SLOT_WASTE' | 'BAN_VIOLATION' | 'ADMIN_ADJUSTMENT';
    lastUpdated: string;
    updatedBy?: string;
    notes?: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

// Registration Delay Interface
export interface DiscordRegistrationDelayCache {
    id: string;
    guildId: string;
    teamName?: string; // null for server-wide delays
    delayType: 'REGISTRATION_COOLDOWN' | 'PUNISHMENT_DELAY' | 'ADMIN_IMPOSED';
    delayMinutes: number;
    reason: string;
    expiresAt: string;
    setBy: string;
    setByName: string;
    isActive: boolean;
    createdAt: string;
    createdBy: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

// Registration Toggle Interface
export interface DiscordRegistrationToggleCache {
    id: string;
    guildId: string;
    enabled: boolean;
    toggledBy: string;
    toggledByName: string;
    toggledAt: string;
    toggleCount: number;
    reason?: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

// Team Ban Interface
export interface DiscordTeamBanCache {
    id: string;
    guildId: string;
    teamName: string;
    punishmentType: 'TEMPORARY_BAN' | 'PERMANENT_BAN' | 'SLOT_WASTE_BAN' | 'MERIT_REDUCTION' | 'WARNING';
    reason: string;
    bannedBy: string;
    bannedByName: string;
    bannedAt: string;
    endTime?: string;
    isActive: boolean;
    appealNotes?: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}


// Create Registration Session Data
export interface CreateRegistrationSessionData {
    guildId: string;
    channelId: string;
    name: string;
    groupId: number;
    duration?: number;
    maxSlots?: number;
    createdBy: string;
}

// Join Queue Data
export interface JoinQueueData {
    sessionId: string;
    guildId: string;
    teamName: string;
    userId: string;
    userDiscord: string;
}

// Update Merit Data
export interface UpdateMeritData {
    guildId: string;
    teamName: string;
    meritChange: number;
    action: 'GOOD_REGISTRATION' | 'ATTENDED_MATCH' | 'SLOT_WASTE' | 'BAN_VIOLATION' | 'ADMIN_ADJUSTMENT';
    reason: string;
    updatedBy: string;
}

// Set Registration Delay Data
export interface SetRegistrationDelayData {
    guildId: string;
    teamName?: string;
    delayMinutes: number;
    reason: string;
    setBy: string;
    setByName: string;
    delayType?: 'REGISTRATION_COOLDOWN' | 'PUNISHMENT_DELAY' | 'ADMIN_IMPOSED';
}

// Ban Team Data
export interface BanTeamData {
    guildId: string;
    teamName: string;
    punishmentType: 'TEMPORARY_BAN' | 'PERMANENT_BAN' | 'SLOT_WASTE_BAN' | 'MERIT_REDUCTION' | 'WARNING';
    reason: string;
    bannedBy: string;
    bannedByName: string;
    duration?: number; // hours for temporary bans
}

// Toggle Registration Data
export interface ToggleRegistrationData {
    guildId: string;
    enabled: boolean;
    toggledBy: string;
    toggledByName: string;
    reason?: string;
}


// Guild Registration Sessions Cache
export interface GuildRegistrationSessionsCache {
    sessions: DiscordRegistrationSessionCache[];
    totalCount: number;
    activeCount: number;
    lastUpdated: string;
}

// Guild Queue Cache
export interface GuildQueueCache {
    entries: DiscordRegistrationQueueEntry[];
    totalCount: number;
    queuedCount: number;
    assignedCount: number;
    waitingListCount: number;
    lastUpdated: string;
}

// Guild Merit Rankings Cache
export interface GuildMeritRankingsCache {
    rankings: DiscordTeamMeritCache[];
    totalTeams: number;
    averageMerit: number;
    lastUpdated: string;
}

// Processed Queue Result
export interface ProcessedQueueResult {
    assignedSlots: { [slotNumber: string]: string }; // slot -> team name
    waitingList: DiscordRegistrationQueueEntry[];
    processedCount: number;
    waitingCount: number;
}

// Merit Rankings Query Options
export interface MeritRankingsOptions {
    limit?: number;
    sortBy?: 'currentMerit' | 'totalEarned' | 'lastUpdated';
    includeInactive?: boolean;
}

// Queue Status Query Options
export interface QueueStatusOptions {
    status?: 'QUEUED' | 'ASSIGNED' | 'WAITING_LIST' | 'EXPIRED';
    limit?: number;
    sessionId?: string;
}

export interface GuildDelayCache {
    delays: DiscordRegistrationDelayCache[];
    totalCount: number;
    activeCount: number;
    lastUpdated: string;
}

export interface GuildBanCache {
    bans: DiscordTeamBanCache[];
    totalCount: number;
    activeCount: number;
    lastUpdated: string;
}

export interface QueuePosition {
    teamName: string;
    position: number;
    merit: number;
    estimatedWaitTime?: number;
}

export interface SessionMetrics {
    totalRegistrations: number;
    averageWaitTime: number;
    slotUtilization: number;
    popularTimes: string[];
}

export type MeritAction = 'GOOD_REGISTRATION' | 'ATTENDED_MATCH' | 'SLOT_WASTE' | 'BAN_VIOLATION' | 'ADMIN_ADJUSTMENT';

// Create Merit Data Interface  
export interface CreateMeritData {
    guildId: string;
    teamName: string;
    initialMerit?: number;
    createdBy: string;
    notes?: string;
}

// Create Delay Data Interface
export interface CreateDelayData {
    guildId: string;
    teamName?: string;
    delayMinutes: number;
    reason: string;
    createdBy: string;
    delayType?: 'REGISTRATION_COOLDOWN' | 'PUNISHMENT_DELAY' | 'ADMIN_IMPOSED';
}