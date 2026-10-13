const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
const SUBJECT_TUESDAY_DEADLINES = new Set(['HGP', 'MAKABANSA', 'MAPEH']);

export function hasTuesdayTenDeadline(subject?: string | null): boolean {
    return SUBJECT_TUESDAY_DEADLINES.has(normalizeSubject(subject));
}

export function effectiveDeadlineForSubject(
    calendarDeadline: Date | string,
    subject?: string | null
): Date {
    const base = new Date(calendarDeadline);
    if (!hasTuesdayTenDeadline(subject)) return deadlineAtTenAM(base);

    const phDate = new Date(base.getTime() + PH_OFFSET_MS);
    const phDay = phDate.getUTCDay();
    const daysUntilTuesday = (2 - phDay + 7) % 7;

    return new Date(Date.UTC(
        phDate.getUTCFullYear(),
        phDate.getUTCMonth(),
        phDate.getUTCDate() + daysUntilTuesday,
        2,
        0,
        0,
        0
    ));
}

export function deadlineAtTenAM(deadlineDate: Date | string): Date {
    const phDate = new Date(new Date(deadlineDate).getTime() + PH_OFFSET_MS);

    return new Date(Date.UTC(
        phDate.getUTCFullYear(),
        phDate.getUTCMonth(),
        phDate.getUTCDate(),
        2,
        0,
        0,
        0
    ));
}

function normalizeSubject(subject?: string | null): string {
    return String(subject || '').trim().toUpperCase();
}
