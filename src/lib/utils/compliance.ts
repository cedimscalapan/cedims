export interface CalendarSlot {
    id: string; school_year: string; term: number; week_number: number;
    deadline_date: string; district_id?: string | null; is_active?: boolean;
}
export interface ComplianceLoad {
    id: string; user_id: string; subject: string; grade_level?: string; is_active?: boolean;
}
export interface ComplianceSubmission {
    id: string; user_id?: string; teaching_load_id?: string | null; school_year?: string | null;
    term_number?: number | null; week_number?: number | null; calendar_id?: string | null;
    file_path?: string | null; doc_type?: string | null; compliance_status?: string; created_at?: string;
    subject?: string | null;
}
export interface ComplianceReview {
    submission_id: string; status?: string | null; reviewer_comment?: string | null;
}
export interface Requirement {
    key: string; teacherId: string; load: ComplianceLoad; calendar: CalendarSlot;
    submission?: ComplianceSubmission; status: 'on-time' | 'late' | 'missing' | 'upcoming';
    review: 'checked' | 'for-checking' | 'none';
}

export function currentCompliancePeriod(calendar: CalendarSlot[], now = Date.now()) {
    const sorted = calendar.filter(c => c.is_active !== false && Number.isFinite(Date.parse(c.deadline_date)))
        .sort((a, b) => Date.parse(a.deadline_date) - Date.parse(b.deadline_date));
    const current = sorted.find(c => Date.parse(c.deadline_date) >= now) || sorted.at(-1);
    return { term: current ? String(current.term) : 'all', week: current ? String(current.week_number) : 'all' };
}

export function previousPeriodChange(rows: Requirement[], term: string, week: string): number | null {
    if (term === 'all' || week === 'all') return null;
    const periods = [...new Set(rows.map(r => `${r.calendar.term}|${r.calendar.week_number}`))]
        .sort((a, b) => Number(a.split('|')[0]) - Number(b.split('|')[0]) || Number(a.split('|')[1]) - Number(b.split('|')[1]));
    const index = periods.indexOf(`${term}|${week}`);
    if (index < 1) return null;
    const current = summarizeRequirements(rows.filter(r => `${r.calendar.term}|${r.calendar.week_number}` === periods[index]));
    const previous = summarizeRequirements(rows.filter(r => `${r.calendar.term}|${r.calendar.week_number}` === periods[index - 1]));
    return current.rate === null || previous.rate === null ? null : current.rate - previous.rate;
}

export function submissionTerm(s: Pick<ComplianceSubmission, 'term_number' | 'file_path'>): number | null {
    if (s.term_number && [1, 2, 3].includes(s.term_number)) return s.term_number;
    const match = s.file_path?.match(/(?:^|\/)Term_([1-3])(?:\/|$)/i);
    return match ? Number(match[1]) : null;
}

export function scopedCalendar(calendar: CalendarSlot[], districtId?: string | null): CalendarSlot[] {
    const slots = new Map<string, CalendarSlot>();
    for (const c of calendar) {
        if (c.is_active === false || (c.district_id && c.district_id !== districtId)) continue;
        const key = `${c.school_year}|${c.term}|${c.week_number}`;
        const previous = slots.get(key);
        if (!previous || (!previous.district_id && c.district_id)) slots.set(key, c);
    }
    return [...slots.values()].sort((a, b) => a.term - b.term || a.week_number - b.week_number);
}

export function hasRemarks(comment?: string | null) {
    return !!comment?.trim();
}

export function reviewState(submissionId: string, reviews: ComplianceReview[]): 'checked' | 'for-checking' {
    const review = reviews.find(r => r.submission_id === submissionId);
    return hasRemarks(review?.reviewer_comment) ? 'checked' : 'for-checking';
}

export function isCountedSubmission(status?: string | null) {
    return ['compliant', 'on-time', 'late'].includes(status || '');
}

export function periodSubmissionTerm(s: ComplianceSubmission): number | null {
    return submissionTerm(s);
}

export function filterSubmissionsByPeriod(submissions: ComplianceSubmission[], term: string, week: string) {
    return submissions.filter(s => {
        const sTerm = periodSubmissionTerm(s);
        return (term === 'all' || sTerm === Number(term)) && (week === 'all' || s.week_number === Number(week));
    });
}

export function summarizeSubmissionReviews(submissions: ComplianceSubmission[], reviews: ComplianceReview[]) {
    const reviewMap = new Map(reviews.map(r => [r.submission_id, r]));
    const reviewable = submissions.filter(s => isCountedSubmission(s.compliance_status));
    const checked = reviewable.filter(s => hasRemarks(reviewMap.get(s.id)?.reviewer_comment)).length;
    return { forChecking: reviewable.length - checked, checked, reviewable: reviewable.length };
}

export function buildRequirements(
    loads: ComplianceLoad[], calendar: CalendarSlot[], submissions: ComplianceSubmission[],
    reviews: ComplianceReview[] = [], now = Date.now(),
): Requirement[] {
    const reviewMap = new Map(reviews.map(r => [r.submission_id, r]));
    const candidates = new Map<string, ComplianceSubmission[]>();
    for (const s of submissions) {
        if (s.doc_type !== 'DLL' || !isCountedSubmission(s.compliance_status)) continue;
        const key = `${s.teaching_load_id}|${s.school_year}|${s.week_number}`;
        const group = candidates.get(key) || [];
        group.push(s);
        candidates.set(key, group);
    }
    return loads.filter(l => l.is_active !== false).flatMap(load => calendar.map(c => {
        const group = candidates.get(`${load.id}|${c.school_year}|${c.week_number}`) || [];
        const matching = group.filter(s => {
            const term = submissionTerm(s);
            // Explicit metadata wins; ambiguous legacy weeks never satisfy multiple terms.
            if (term !== null) return term === c.term;
            if (s.calendar_id) return s.calendar_id === c.id;
            return calendar.filter(w => w.school_year === c.school_year && w.week_number === c.week_number).length === 1;
        });
        const submission = matching.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
        const review = submission ? reviewMap.get(submission.id) : undefined;
        return {
            key: `${load.id}|${c.school_year}|${c.term}|${c.week_number}`, teacherId: load.user_id, load, calendar: c, submission,
            status: submission ? (submission.compliance_status === 'late' ? 'late' : 'on-time')
                : (Date.parse(c.deadline_date) <= now ? 'missing' : 'upcoming'),
            review: !submission ? 'none' : hasRemarks(review?.reviewer_comment) ? 'checked' : 'for-checking',
        } as Requirement;
    }));
}

export function summarizeRequirements(rows: Requirement[], now = Date.now()) {
    const submitted = rows.filter(r => r.submission).length;
    const missing = rows.filter(r => r.status === 'missing').length;
    const upcoming = rows.filter(r => r.status === 'upcoming').length;
    const expected = rows.length;
    const due = rows.filter(r => Date.parse(r.calendar.deadline_date) <= now).length;
    const dueSubmitted = rows.filter(r => r.submission && Date.parse(r.calendar.deadline_date) <= now).length;
    return {
        expected, submitted, missing, upcoming,
        onTime: rows.filter(r => r.status === 'on-time').length,
        late: rows.filter(r => r.status === 'late').length,
        forChecking: rows.filter(r => r.review === 'for-checking').length,
        checked: rows.filter(r => r.review === 'checked').length,
        rate: expected ? Math.round(submitted / expected * 100) : null,
        dueRate: due ? Math.round(dueSubmitted / due * 100) : null,
    };
}

export function weekMix(rows: Requirement[]) {
    const summary = summarizeRequirements(rows);
    return { onTime: summary.onTime, late: summary.late, missing: summary.missing, upcoming: summary.upcoming };
}

export function documentTypeCounts(submissions: ComplianceSubmission[]) {
    const labels = new Map<string, string>([
        ['DLL', 'DLP'],
        ['DLP', 'DLP'],
        ['ISP', 'ISP'],
        ['ISR', 'ISR'],
    ]);
    const counts = new Map<string, number>([['DLP', 0], ['ISP', 0], ['ISR', 0]]);
    for (const s of submissions) {
        const key = labels.get((s.doc_type || '').toUpperCase());
        if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].map(([label, value]) => ({ label, value }));
}

export function uploadDayCounts(submissions: ComplianceSubmission[], calendar: CalendarSlot[], term: string, week: string) {
    const selected = term !== 'all' && week !== 'all'
        ? calendar.find(c => c.term === Number(term) && c.week_number === Number(week))
        : null;
    const deadline = selected && Number.isFinite(Date.parse(selected.deadline_date)) ? new Date(selected.deadline_date) : null;
    const end = deadline ? new Date(deadline) : null;
    if (end) end.setHours(23, 59, 59, 999);
    const start = end ? new Date(end) : null;
    if (start) start.setDate(start.getDate() - 6), start.setHours(0, 0, 0, 0);
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const counts = labels.map(day => ({ day, total: 0, DLP: 0, ISP: 0, ISR: 0 }));
    for (const s of submissions) {
        if (!s.created_at) continue;
        const created = new Date(s.created_at);
        if (start && end && (created < start || created > end)) continue;
        const jsDay = created.getDay();
        const index = jsDay === 0 ? 6 : jsDay - 1;
        const doc = (s.doc_type || '').toUpperCase() === 'DLL' ? 'DLP' : (s.doc_type || '').toUpperCase();
        if (doc !== 'DLP' && doc !== 'ISP' && doc !== 'ISR') continue;
        counts[index].total += 1;
        counts[index][doc as 'DLP' | 'ISP' | 'ISR'] += 1;
    }
    return counts;
}

export function overdueByWeek(rows: Requirement[]) {
    const groups = new Map<string, { term: number; week: number; missing: number }>();
    for (const r of rows) {
        const key = `${r.calendar.term}|${r.calendar.week_number}`;
        const group = groups.get(key) || { term: r.calendar.term, week: r.calendar.week_number, missing: 0 };
        if (r.status === 'missing') group.missing += 1;
        groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => a.term - b.term || a.week - b.week);
}

export function riskReason(rows: Requirement[]): string {
    const missing = rows.filter(r => r.status === 'missing');
    const weeks = new Set(missing.map(r => `${r.calendar.term}|${r.calendar.week_number}`));
    if (weeks.size >= 2) return `Missing in ${weeks.size} weeks`;
    if (missing.length) return `${missing.length} missing requirement${missing.length === 1 ? '' : 's'}`;
    if (rows.some(r => r.review === 'for-checking')) {
        const count = rows.filter(r => r.review === 'for-checking').length;
        return `${count} file${count === 1 ? '' : 's'} waiting for remarks`;
    }
    return '';
}

/** PostgREST caps a response; reports must fetch every page before calculating totals. */
export async function fetchAllRows<T>(query: () => any): Promise<T[]> {
    const result: T[] = [];
    for (let start = 0; ; start += 500) {
        const { data, error } = await query().range(start, start + 499);
        if (error) throw error;
        result.push(...(data || []));
        if (!data || data.length < 500) return result;
    }
}

export async function fetchRowsForIds<T>(ids: string[], query: (batch: string[]) => any): Promise<T[]> {
    const rows: T[] = [];
    const uniqueIds = [...new Set(ids)];
    for (let i = 0; i < uniqueIds.length; i += 100) {
        rows.push(...await fetchAllRows<T>(() => query(uniqueIds.slice(i, i + 100))));
    }
    return rows;
}
