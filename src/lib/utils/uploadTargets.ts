/** Bound metadata requests even when the browser reports online with no working connection. */
export async function requestUploadTargets<T>(
    request: (signal: AbortSignal) => PromiseLike<T>,
    timeoutMs = 8000,
): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            reject(new Error('Upload options request timed out'));
            controller.abort();
        }, timeoutMs);
    });
    try {
        return await Promise.race([Promise.resolve().then(() => request(controller.signal)), timeout]);
    } finally {
        clearTimeout(timer!);
    }
}

export interface UploadCalendarTarget {
    id: string;
    term: number;
    week_number: number;
    school_year?: string;
    deadline_date?: string | null;
    is_active?: boolean;
}

export type TrackerUploadTarget = { loadId: string; term: number; week: number };

export function parseTrackerUploadTarget(params: URLSearchParams): TrackerUploadTarget | null {
    const loadId = params.get('load')?.trim() || '';
    const termText = params.get('term') || '';
    const weekText = params.get('week') || '';
    if (!loadId || !/^\d+$/.test(termText) || !/^\d+$/.test(weekText)) return null;
    const term = Number(termText);
    const week = Number(weekText);
    return Number.isSafeInteger(term) && term > 0 && Number.isSafeInteger(week) && week > 0
        ? { loadId, term, week } : null;
}

export function openUploadTargets<T extends UploadCalendarTarget>(entries: T[], schoolYear: string): T[] {
    return entries.filter((entry) => entry.school_year === schoolYear && entry.is_active === true &&
        Number.isInteger(entry.term) && entry.term > 0 && Number.isInteger(entry.week_number) && entry.week_number > 0)
        .sort((a, b) => a.term - b.term || a.week_number - b.week_number);
}

/** Preserve the chosen term/week pair; week numbers may restart in each term. */
export function chooseUploadPeriod<T extends UploadCalendarTarget>(
    entries: T[], term?: number, week?: number, now = Date.now(),
): T | undefined {
    const selected = entries.find((entry) => entry.term === term && entry.week_number === week);
    if (selected) return selected;
    const candidates = term ? entries.filter((entry) => entry.term === term) : entries;
    const available = candidates.length ? candidates : entries;
    const dated = available.filter((entry) => entry.deadline_date && Number.isFinite(Date.parse(entry.deadline_date)))
        .sort((a, b) => Date.parse(a.deadline_date!) - Date.parse(b.deadline_date!));
    return dated.find((entry) => Date.parse(entry.deadline_date!) >= now) || dated.at(-1) || available[0];
}

/** Refresh options without choosing a destination for an unscanned/replaced file. */
export function preserveUploadPeriod<T extends UploadCalendarTarget>(entries: T[], term?: number, week?: number): T | undefined {
    if (term === undefined || week === undefined) return undefined;
    return entries.find(entry => entry.term === term && entry.week_number === week);
}
