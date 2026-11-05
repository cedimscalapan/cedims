/**
 * School-day arithmetic for leave requests. Dates stay as YYYY-MM-DD strings and
 * are read in UTC, so a device's time zone can never shift the day a teacher chose.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

function toUtc(day: string): Date {
    return new Date(`${day.slice(0, 10)}T00:00:00Z`);
}

function toKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function format(day: string, options: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(toUtc(day));
}

export function addDays(day: string, amount: number): string {
    return toKey(new Date(toUtc(day).getTime() + amount * DAY_MS));
}

export function isSchoolDay(day: string): boolean {
    const weekday = toUtc(day).getUTCDay();
    return weekday >= 1 && weekday <= 5;
}

/** Monday of the week holding this date. Saturday and Sunday belong to the week just ended. */
export function mondayOf(day: string): string {
    const weekday = toUtc(day).getUTCDay();
    return addDays(day, weekday === 0 ? -6 : 1 - weekday);
}

export interface SchoolDay { key: string; weekday: string; shortWeekday: string; date: string }

export function schoolWeek(monday: string): SchoolDay[] {
    return [0, 1, 2, 3, 4].map(offset => {
        const key = addDays(monday, offset);
        return {
            key,
            weekday: format(key, { weekday: 'long' }),
            shortWeekday: format(key, { weekday: 'short' }),
            date: format(key, { month: 'short', day: 'numeric' }),
        };
    });
}

/** "Nov 2 to 6, 2026", or "Nov 30 to Dec 4, 2026" when the week spans two months. */
export function weekRangeLabel(monday: string): string {
    const friday = addDays(monday, 4);
    const sameMonth = monday.slice(0, 7) === friday.slice(0, 7);
    const end = sameMonth
        ? format(friday, { day: 'numeric' })
        : format(friday, { month: 'short', day: 'numeric' });
    return `${format(monday, { month: 'short', day: 'numeric' })} to ${end}, ${friday.slice(0, 4)}`;
}

export function countSchoolDays(start: string, end: string): number {
    if (!start || !end || start > end) return 0;
    let count = 0;
    for (let day = start.slice(0, 10); day <= end.slice(0, 10); day = addDays(day, 1)) {
        if (isSchoolDay(day)) count += 1;
    }
    return count;
}

/** "Monday, November 2 to Wednesday, November 4, 2026 (3 school days)" */
export function formatLeaveRange(start?: string | null, end?: string | null): string {
    if (!start || !end) return 'Dates not set';
    const long = (day: string) => format(day, { weekday: 'long', month: 'long', day: 'numeric' });
    const count = countSchoolDays(start, end);
    const days = `${count} school day${count === 1 ? '' : 's'}`;
    if (start.slice(0, 10) === end.slice(0, 10)) return `${long(start)}, ${start.slice(0, 4)} (${days})`;
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    return `${long(start)}${sameYear ? '' : `, ${start.slice(0, 4)}`} to ${long(end)}, ${end.slice(0, 4)} (${days})`;
}

/**
 * First tap picks a day. A later tap extends the range to that day; tapping before
 * the start, or on a finished single day again, restarts from the tapped day.
 */
export function nextLeaveSelection(start: string, end: string, tapped: string): { start: string; end: string } {
    if (!start) return { start: tapped, end: tapped };
    if (start === end && tapped > start) return { start, end: tapped };
    return { start: tapped, end: tapped };
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
    return aStart.slice(0, 10) <= bEnd.slice(0, 10) && bStart.slice(0, 10) <= aEnd.slice(0, 10);
}
