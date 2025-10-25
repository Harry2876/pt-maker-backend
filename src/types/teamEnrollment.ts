// Team Enrollment Cache Interface (following your cache patterns)
export interface TeamEnrollmentCache {
    id: string;
    guildId: string;
    teamName: string;
    leaderId: string;
    leaderIgn: string;
    leaderDiscord: string;
    players: TeamPlayer[];
    isVerified: boolean;
    isComplete: boolean;
    enrollmentStep: number;
    threadId?: string;
    enrolledBy: string;
    enrolledAt: string;
    verifiedAt?: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

// Team Player Interface
export interface TeamPlayer {
    ign: string;
    discordTag: string;
    discordId: string;  // Add this field
    userId?: string;
    role?: string;      // Add this field for player roles
}

// Create Team Data Interface
export interface CreateTeamEnrollmentData {
    guildId: string;
    teamName: string;
    leaderId: string;
    leaderIgn: string;
    leaderDiscord: string;
    players: TeamPlayer[];
    enrolledBy: string;
    threadId?: string;
}

// Update Team Data Interface
export interface UpdateTeamEnrollmentData {
    teamName?: string;
    leaderIgn?: string;
    leaderDiscord?: string;
    players?: TeamPlayer[];
    isVerified?: boolean;
    isComplete?: boolean;
    enrollmentStep?: number;
    verifiedAt?: string;
}

// Rate Limit Interface
export interface RateLimitData {
    userId: string;
    guildId: string;
    action: 'enrollment' | 'leadership_management';
    lastAttempt: string;
    attemptCount: number;
    cooldownUntil: string;
    isAdmin: boolean;
}

// Activity Log Interface
export interface TeamActivityData {
    teamId: string;
    guildId: string;
    action: 'enrollment' | 'leadership_transfer' | 'player_change' | 'name_change';
    performedBy: string;
    previousData?: any;
    newData?: any;
}

// Name Change Interface
export interface TeamNameChangeData {
    teamId: string;
    guildId: string;
    oldName: string;
    newName: string;
    changedBy: string;
}