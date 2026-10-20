const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
const SUBJECT_TUESDAY_DEADLINES = new Set(['HGP', 'MAKABANSA', 'MAPEH']);

export function hasTuesdayTenDeadline(subject?: string | null, schoolName?: string | null): boolean {
    if (isFridayTenHgp(subject, schoolName)) return false;
    return SUBJECT_TUESDAY_DEADLINES.has(normalizeSubject(subject));
}

export function isBulusanHgp(subject?: string | null, schoolName?: string | null): boolean {
    const school = normalizeSchool(schoolName);
    return normalizeSubject(subject) === 'HGP' && /^BULUSAN(?: ELEMENTARY(?: SCHOOL)?| ES)?$/.test(school);
}

export function isGuinobatanHgp(subject?: string | null, schoolName?: string | null): boolean {
    const school = normalizeSchool(schoolName);
    return normalizeSubject(subject) === 'HGP' && /^GUINOBATAN(?: ELEMENTARY(?: SCHOOL)?| ES)?$/.test(school);
}

export function isFridayTenHgp(subject?: string | null, schoolName?: string | null): boolean {
    return isBulusanHgp(subject, schoolName) || isGuinobatanHgp(subject, schoolName);
}

export function effectiveDeadlineForSubject(
    calendarDeadline: Date | string,
    subject?: string | null,
    schoolName?: string | null
): Date {
    const base = new Date(calendarDeadline);
    if (isFridayTenHgp(subject, schoolName)) return deadlineOnWeekdayAtTenAM(base, 5);
    if (!hasTuesdayTenDeadline(subject, schoolName)) return deadlineAtTenAM(base);

    return deadlineOnWeekdayAtTenAM(base, 2);
}

export function deadlineAtTenAM(deadlineDate: Date | string): Date {
    return deadlineOnWeekdayAtTenAM(deadlineDate);
}

function deadlineOnWeekdayAtTenAM(deadlineDate: Date | string, weekday?: number): Date {
    const phDate = new Date(new Date(deadlineDate).getTime() + PH_OFFSET_MS);
    const phDay = phDate.getUTCDay();
    const daysAhead = weekday === undefined ? 0 : (weekday - phDay + 7) % 7;

    return new Date(Date.UTC(
        phDate.getUTCFullYear(),
        phDate.getUTCMonth(),
        phDate.getUTCDate() + daysAhead,
        2,
        0,
        0,
        0
    ));
}

function normalizeSubject(subject?: string | null): string {
    return String(subject || '').trim().toUpperCase();
}

function normalizeSchool(school?: string | null): string {
    return String(school || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
