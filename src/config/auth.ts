import { betterAuth } from "better-auth";
import db from "./database";

export const auth = betterAuth({
    database: {
        provider: "postgresql",
        url: process.env.DATABASE_URL!
    },
    emailAndPassword: {
        enabled: false // Disable email/password since we're using phone
    },
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // 1 day
    }
});

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
