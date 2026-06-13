/**
 * Fuzzy player-name matching for OCR roster reconciliation.
 * Shared by quickProcessingService and ocrReconciliationService.
 */

export function normalisePlayerName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function playerNamesMatch(a: string, b: string): boolean {
    const na = normalisePlayerName(a);
    const nb = normalisePlayerName(b);
    if (!na || !nb) return false;
    if (na === nb) return true;

    const shorter = na.length < nb.length ? na : nb;
    const longer = na.length < nb.length ? nb : na;

    if (shorter.length >= 4 && longer.startsWith(shorter)) return true;
    if (shorter.length >= 4 && longer.includes(shorter)) return true;

    if (shorter.length > 5) {
        const maxDist = shorter.length >= 12 ? 4 : shorter.length >= 9 ? 3 : 2;
        if (levenshtein(na, nb) <= maxDist) return true;
        if (bigramSimilarity(na, nb) >= 0.70) return true;
    }

    return false;
}

/** Minimum overlapping players required for a confident roster match. */
export function requiredRosterMatchCount(rosterSize: number): number {
    if (rosterSize >= 4) return 3;
    if (rosterSize === 3) return 2;
    if (rosterSize === 2) return 2;
    return 1;
}

export function countRosterOverlap(rosterA: string[], rosterB: string[]): number {
    let score = 0;
    for (const nameA of rosterA) {
        if (!nameA) continue;
        for (const nameB of rosterB) {
            if (!nameB) continue;
            if (playerNamesMatch(nameA, nameB)) {
                score++;
                break;
            }
        }
    }
    return score;
}

export function rosterKey(playerNames: string[]): string {
    return playerNames
        .map(normalisePlayerName)
        .filter(Boolean)
        .sort()
        .join('|');
}

function bigramSimilarity(a: string, b: string): number {
    const bigrams = (s: string) => {
        const set = new Map<string, number>();
        for (let i = 0; i < s.length - 1; i++) {
            const bg = s.slice(i, i + 2);
            set.set(bg, (set.get(bg) ?? 0) + 1);
        }
        return set;
    };
    const ba = bigrams(a);
    const bb = bigrams(b);
    let intersection = 0;
    for (const [bg, count] of ba) {
        intersection += Math.min(count, bb.get(bg) ?? 0);
    }
    const totalA = a.length - 1;
    const totalB = b.length - 1;
    if (totalA <= 0 || totalB <= 0) return 0;
    return (2 * intersection) / (totalA + totalB);
}

function levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
        }
    }
    return dp[m][n];
}
