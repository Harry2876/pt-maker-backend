/** Canonical team key for series aggregation and lookups. */
export function normalizeTeamName(name: string): string {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function teamsMatch(a: string, b: string): boolean {
    return normalizeTeamName(a) === normalizeTeamName(b);
}

/** Normalized slot roster fingerprint for cross-match comparison in a series. */
export function buildSlotFingerprint(
    slots: Array<{ slotNumber: number; teamName: string }>
): string {
    return slots
        .slice()
        .sort((a, b) => a.slotNumber - b.slotNumber)
        .map(s => `${s.slotNumber}:${normalizeTeamName(s.teamName)}`)
        .join('|');
}

export function slotFingerprintsMatch(a: string, b: string): boolean {
    return a.length > 0 && a === b;
}
