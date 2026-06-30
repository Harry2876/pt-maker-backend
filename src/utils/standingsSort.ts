import { QuickMatchResultCache } from '../types/quickResult';
import { SeriesTeamStanding } from '../types/quickSeries';

export interface StandingsSortFields {
    totalPoints: number;
    positionPoints: number;
    finishPoints: number;
    rank?: number;
    position?: number;
    slotNumber?: number;
}

/**
 * Default standings order: total points (desc), then position points (desc),
 * then finish/kill points (desc), then better in-game placement.
 */
export function compareStandingsByPoints(a: StandingsSortFields, b: StandingsSortFields): number {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.positionPoints !== a.positionPoints) return b.positionPoints - a.positionPoints;
    if (b.finishPoints !== a.finishPoints) return b.finishPoints - a.finishPoints;

    const aPlacement = a.rank ?? a.position ?? a.slotNumber ?? Number.MAX_SAFE_INTEGER;
    const bPlacement = b.rank ?? b.position ?? b.slotNumber ?? Number.MAX_SAFE_INTEGER;
    return aPlacement - bPlacement;
}

export function toMatchResultSortFields(result: QuickMatchResultCache): StandingsSortFields {
    return {
        totalPoints: result.totalPoints,
        positionPoints: result.positionPoints,
        finishPoints: result.killPoints,
        rank: result.rank,
        position: result.position,
        slotNumber: result.slotNumber,
    };
}

export function toSeriesStandingSortFields(standing: SeriesTeamStanding): StandingsSortFields {
    return {
        totalPoints: standing.totalPoints,
        positionPoints: standing.positionPoints ?? 0,
        finishPoints: standing.finishPoints ?? 0,
        position: standing.bestPosition,
    };
}

export function sortMatchResultsForStandings(results: QuickMatchResultCache[]): QuickMatchResultCache[] {
    return [...results].sort((a, b) =>
        compareStandingsByPoints(toMatchResultSortFields(a), toMatchResultSortFields(b))
    );
}

export function sortSeriesStandingsForLeaderboard(standings: SeriesTeamStanding[]): SeriesTeamStanding[] {
    return [...standings].sort((a, b) =>
        compareStandingsByPoints(toSeriesStandingSortFields(a), toSeriesStandingSortFields(b))
    );
}
