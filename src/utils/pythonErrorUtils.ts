/**
 * Parse FastAPI / Python validation errors into a readable string.
 */
export function extractPythonErrorDetail(err: any): string {
    const data = err?.response?.data;
    if (!data) {
        return err?.message ?? 'Unknown Python AI error';
    }

    if (typeof data === 'string') {
        return data;
    }

    if (typeof data.detail === 'string') {
        return data.detail;
    }

    if (Array.isArray(data.detail)) {
        return data.detail
            .map((item: any) => {
                const loc = Array.isArray(item.loc) ? item.loc.join('.') : '';
                const msg = item.msg ?? JSON.stringify(item);
                return loc ? `${loc}: ${msg}` : msg;
            })
            .join('; ');
    }

    if (typeof data.message === 'string') {
        return data.message;
    }

    try {
        return JSON.stringify(data);
    } catch {
        return 'Unknown Python AI error';
    }
}

/** e.g. "16_teams" → 16 */
export function getExpectedTeamCount(formatType: string): number {
    const match = formatType.match(/^(\d+)_teams$/);
    if (!match) {
        throw new Error(`Invalid format type: ${formatType}`);
    }
    return parseInt(match[1], 10);
}

/** Smallest supported standings format that fits `teamCount` teams. */
export function resolveFormatTypeForTeamCount(teamCount: number): string {
    if (teamCount <= 8) return '8_teams';
    if (teamCount <= 16) return '16_teams';
    return '24_teams';
}

/** Split ranked team rows into one or more export chunks (e.g. 18 → [16, 2]). */
export function splitTeamDataIntoChunks<T>(items: T[], maxPerImage: number): T[][] {
    if (items.length === 0) return [];
    if (items.length <= maxPerImage) return [items];

    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += maxPerImage) {
        chunks.push(items.slice(i, i + maxPerImage));
    }
    return chunks;
}

/** Build output filename for a split export part. */
export function buildSplitOutputFilename(baseFilename: string | undefined, partIndex: number, totalParts: number): string | undefined {
    if (!baseFilename || totalParts <= 1) return baseFilename;

    const dotIndex = baseFilename.lastIndexOf('.');
    const stem = dotIndex >= 0 ? baseFilename.slice(0, dotIndex) : baseFilename;
    const ext = dotIndex >= 0 ? baseFilename.slice(dotIndex) : '.png';
    const suffix = partIndex === totalParts ? 'overflow' : `part${partIndex}`;

    return `${stem}_${suffix}${ext}`;
}
