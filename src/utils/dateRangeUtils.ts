const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** Validates IANA timezone strings; falls back when invalid. */
export function resolveTimezone(timezone?: string): string {
    if (!timezone?.trim()) {
        return DEFAULT_TIMEZONE;
    }

    try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone.trim() });
        return timezone.trim();
    } catch {
        return DEFAULT_TIMEZONE;
    }
}

export function parseDashboardDate(value: string | undefined, fallback: Date): Date {
    if (!value?.trim()) {
        return fallback;
    }

    const parsed = new Date(value.trim());
    if (Number.isNaN(parsed.getTime())) {
        return fallback;
    }

    return parsed;
}

function getTimezoneOffsetMs(date: Date, timeZone: string): number {
    const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const zoned = new Date(date.toLocaleString('en-US', { timeZone }));
    return zoned.getTime() - utc.getTime();
}

/** Start/end of the calendar day containing `reference` in `timeZone`. */
export function getZonedDayBounds(
    reference: Date,
    timeZone: string
): { start: Date; end: Date } {
    const offsetMs = getTimezoneOffsetMs(reference, timeZone);
    const localMs = reference.getTime() + offsetMs;
    const local = new Date(localMs);
    const startLocalMs = Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate(),
        0,
        0,
        0,
        0
    );
    const start = new Date(startLocalMs - offsetMs);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
}

export function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

export function endOfDayUtc(date: Date): Date {
    const end = new Date(date);
    end.setUTCHours(23, 59, 59, 999);
    return end;
}

export interface DashboardWindow {
    from: Date;
    to: Date;
    timezone: string;
    preset: 'today' | 'yesterday' | 'week' | 'month' | 'custom';
    label: string;
    todayStart: Date;
    todayEnd: Date;
    yesterdayStart: Date;
    yesterdayEnd: Date;
}

const PRESET_LABELS: Record<DashboardWindow['preset'], string> = {
    today: 'Today',
    yesterday: 'Yesterday',
    week: 'Last 7 days',
    month: 'Last 30 days',
    custom: 'Custom range',
};

export function buildDashboardWindow(options: {
    from?: string;
    to?: string;
    timezone?: string;
    preset?: string;
}): DashboardWindow {
    const timezone = resolveTimezone(options.timezone);
    const now = new Date();
    const { start: todayStart, end: todayEnd } = getZonedDayBounds(now, timezone);
    const yesterdayRef = new Date(todayStart.getTime() - 1);
    const { start: yesterdayStart, end: yesterdayEnd } = getZonedDayBounds(
        yesterdayRef,
        timezone
    );

    const normalizedPreset = options.preset?.trim().toLowerCase();
    let from: Date;
    let to: Date = now;
    let preset: DashboardWindow['preset'] = 'custom';

    if (normalizedPreset === 'today') {
        from = todayStart;
        preset = 'today';
    } else if (normalizedPreset === 'yesterday') {
        from = yesterdayStart;
        to = new Date(yesterdayEnd.getTime() - 1);
        preset = 'yesterday';
    } else if (normalizedPreset === 'week') {
        from = addDays(todayStart, -6);
        preset = 'week';
    } else if (normalizedPreset === 'month') {
        from = addDays(todayStart, -29);
        preset = 'month';
    } else if (options.from || options.to) {
        to = endOfDayUtc(parseDashboardDate(options.to, now));
        const defaultFrom = addDays(to, -29);
        defaultFrom.setUTCHours(0, 0, 0, 0);
        from = parseDashboardDate(options.from, defaultFrom);
        from.setUTCHours(0, 0, 0, 0);
        preset = 'custom';
    } else {
        from = todayStart;
        preset = 'today';
    }

    return {
        from,
        to,
        timezone,
        preset,
        label: PRESET_LABELS[preset],
        todayStart,
        todayEnd,
        yesterdayStart,
        yesterdayEnd,
    };
}

export function formatDateKey(date: Date | string): string {
    if (typeof date === 'string') {
        return date.slice(0, 10);
    }

    return date.toISOString().slice(0, 10);
}
