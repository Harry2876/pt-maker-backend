
import db from "./database";
// Simple session interface for our phone auth
export interface AuthSession {
    userId: string;
    phoneNumber: string;
    issuedAt: number;
    expiresAt: number;
}

export interface AuthUser {
    id: string;
    phoneNumber: string;
    username: string;
    fullName: string;
    organization?: string;
}
