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
}
export interface Requirement {
    key: string; teacherId: string; load: ComplianceLoad; calendar: CalendarSlot;
    submission?: ComplianceSubmission; status: 'on-time' | 'late' | 'missing' | 'upcoming';
    review: 'approved' | 'returned' | 'needs-check' | 'none';
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

export function buildRequirements(
    loads: ComplianceLoad[], calendar: CalendarSlot[], submissions: ComplianceSubmission[],
    reviews: { submission_id: string; status: string }[] = [], now = Date.now(),
): Requirement[] {
    const reviewMap = new Map(reviews.map(r => [r.submission_id, r.status]));
    const candidates = new Map<string, ComplianceSubmission[]>();
    for (const s of submissions) {
        if (s.doc_type !== 'DLL' || !['compliant', 'on-time', 'late'].includes(s.compliance_status || '')) continue;
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
            review: !submission ? 'none' : review === 'approved' || review === 'returned' ? review : 'needs-check',
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
        approved: rows.filter(r => r.review === 'approved').length,
        returned: rows.filter(r => r.review === 'returned').length,
        pending: rows.filter(r => r.review === 'needs-check').length,
        rate: expected ? Math.round(submitted / expected * 100) : null,
        dueRate: due ? Math.round(dueSubmitted / due * 100) : null,
    };
}

export function riskReason(rows: Requirement[]): string {
    const overdue = rows.filter(r => r.status === 'missing');
    const weeks = new Set(overdue.map(r => `${r.calendar.term}|${r.calendar.week_number}`));
    if (weeks.size >= 2) return `Overdue in ${weeks.size} weeks`;
    if (overdue.length) return `${overdue.length} overdue requirement${overdue.length === 1 ? '' : 's'}`;
    if (rows.some(r => r.review === 'returned')) return 'Returned work needs attention';
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
