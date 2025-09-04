import { TournamentPermissions } from "./tournament";

export interface CollaborationInvitation {
    id: string;
    tournamentId: string;
    tournamentName: string;
    inviterName: string;
    inviterOrganization?: string;
    role: 'ADMIN' | 'MODERATOR' | 'RESULT_VERIFIER' | 'VIEWER';
    invitedAt: string;
    expiresAt: string;
}
export interface TournamentCollaboratorCache {
    id: string;
    tournamentId: string;
    userId: string;
    role: 'OWNER' | 'ADMIN' | 'MODERATOR' | 'RESULT_VERIFIER' | 'VIEWER';
    status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
    invitedBy: string;
    invitedAt: string;
    acceptedAt?: string;  // This matches the schema
    user: {
        id: string;
        username: string;
        phoneNumber: string; // This matches the schema - no email
    };
    tournament: {
        id: string;
        name: string;
        ownerId: string; // This will be populated manually
    };
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface CreateCollaboratorData {
    tournamentId: string;
    userId: string;
    role: 'ADMIN' | 'MODERATOR' | 'RESULT_VERIFIER' | 'VIEWER';
    invitedBy: string;
}

export interface UpdateCollaboratorData {
    role?: 'ADMIN' | 'MODERATOR' | 'RESULT_VERIFIER' | 'VIEWER';
    status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
}

export interface AcceptInvitationData {
    invitationId: string;
    accept: boolean;
}

export interface CollaboratorActivity {
    id: string;
    collaboratorId: string;
    action: string;
    details: any;
    timestamp: string;
    ipAddress?: string;
}

export interface RolePermissionMatrix {
    OWNER: TournamentPermissions;
    ADMIN: TournamentPermissions;
    MODERATOR: TournamentPermissions;
    RESULT_VERIFIER: TournamentPermissions;
    VIEWER: TournamentPermissions;
}

// Default permission matrix
export const DEFAULT_PERMISSIONS: RolePermissionMatrix = {
    OWNER: {
        canEditTournament: true,
        canDeleteTournament: true,
        canManageStages: true,
        canManageGroups: true,
        canManageSlots: true,
        canManageMatches: true,
        canProcessResults: true,
        canVerifyResults: true,
        canEditResults: true,
        canPublishResults: true,
        canViewResults: true,
        canManageCollaborators: true,
        canInviteUsers: true,
        canRemoveUsers: true,
        canChangeUserRoles: true,
        canViewAnalytics: true,
        canExportData: true,
        canManageSettings: true,
        canViewTournament: true,
    },
    ADMIN: {
        canEditTournament: true,
        canDeleteTournament: false,
        canManageStages: true,
        canManageGroups: true,
        canManageSlots: true,
        canManageMatches: true,
        canProcessResults: true,
        canVerifyResults: true,
        canEditResults: true,
        canPublishResults: true,
        canViewResults: true,
        canManageCollaborators: false,
        canInviteUsers: false,
        canRemoveUsers: false,
        canChangeUserRoles: false,
        canViewAnalytics: true,
        canExportData: true,
        canManageSettings: false,
        canViewTournament: true,
    },
    MODERATOR: {
        canEditTournament: false,
        canDeleteTournament: false,
        canManageStages: false,
        canManageGroups: true,
        canManageSlots: true,
        canManageMatches: true,
        canProcessResults: true,
        canVerifyResults: true,
        canEditResults: true,
        canPublishResults: false,
        canViewResults: true,
        canManageCollaborators: false,
        canInviteUsers: false,
        canRemoveUsers: false,
        canChangeUserRoles: false,
        canViewAnalytics: true,
        canExportData: false,
        canManageSettings: false,
        canViewTournament: true,
    },
    RESULT_VERIFIER: {
        canEditTournament: false,
        canDeleteTournament: false,
        canManageStages: false,
        canManageGroups: false,
        canManageSlots: false,
        canManageMatches: false,
        canProcessResults: false,
        canVerifyResults: true,
        canEditResults: true,
        canPublishResults: true,
        canViewResults: true,
        canManageCollaborators: false,
        canInviteUsers: false,
        canRemoveUsers: false,
        canChangeUserRoles: false,
        canViewAnalytics: false,
        canExportData: false,
        canManageSettings: false,
        canViewTournament: true,
    },
    VIEWER: {
        canEditTournament: false,
        canDeleteTournament: false,
        canManageStages: false,
        canManageGroups: false,
        canManageSlots: false,
        canManageMatches: false,
        canProcessResults: false,
        canVerifyResults: false,
        canEditResults: false,
        canPublishResults: false,
        canViewResults: true,
        canManageCollaborators: false,
        canInviteUsers: false,
        canRemoveUsers: false,
        canChangeUserRoles: false,
        canViewAnalytics: false,
        canExportData: false,
        canManageSettings: false,
        canViewTournament: true,
    },
};

// Helper function to get permissions
export function getUserPermissions(role: string): TournamentPermissions {
    return DEFAULT_PERMISSIONS[role as keyof RolePermissionMatrix] || DEFAULT_PERMISSIONS.VIEWER;
}