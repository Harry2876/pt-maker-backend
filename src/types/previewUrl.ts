/** Options when issuing a signed preview URL */
export interface PreviewUrlIssueOptions {
    /** Defaults to 30 minutes if omitted */
    expiryMinutes?: number;
}

/** Result returned to services/controllers — maps to Android JSON fields in Step 4+ */
export interface PreviewUrlResult {
    fileId: string;
    previewUrl: string;
    expiresAt: string;
    previewUrlExpiresInSeconds: number;
}

/** Input for verifying ?exp=&sig= on incoming GET /files/:fileId (Step 3) */
export interface PreviewUrlVerifyInput {
    fileId: string;
    exp: string | number;
    sig: string;
}

/**
 * Android-compatible preview block — previewUrl first, signedUrl as fallback duplicate.
 * Use this helper when building API responses from Step 4 onward.
 */
export interface ClientPreviewFields {
    fileId: string;
    previewUrl: string;
    signedUrl: string;
    expiresAt: string;
    previewUrlExpiresInSeconds: number;
}