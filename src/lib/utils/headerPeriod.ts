import { effectiveDeadlineForSubject } from './deadlineRules';
import { correctLabelWords, isOrdinalWord, wordNumber } from './fuzzyClassifier';
import type { UploadCalendarTarget } from './uploadTargets';

const DAY = 86400000;
const MONTHS: [number, string[]][] = [
    [1, ['JANUARY', 'JAN', 'ENERO']], [2, ['FEBRUARY', 'FEB', 'PEBRERO', 'PEB']], [3, ['MARCH', 'MAR', 'MARSO']],
    [4, ['APRIL', 'APR', 'ABRIL', 'ABR']], [5, ['MAY', 'MAYO']], [6, ['JUNE', 'JUN', 'HUNYO', 'HUN']],
    [7, ['JULY', 'JUL', 'HULYO', 'HUL']], [8, ['AUGUST', 'AUG', 'AGOSTO', 'AGO']], [9, ['SEPTEMBER', 'SEPT', 'SEP', 'SETYEMBRE', 'SET']],
    [10, ['OCTOBER', 'OCT', 'OKTUBRE', 'OKT']], [11, ['NOVEMBER', 'NOV', 'NOBYEMBRE', 'NOB']], [12, ['DECEMBER', 'DEC', 'DISYEMBRE', 'DIS']],
];
const monthNumber = (name: string) => MONTHS.find(([, names]) => names.includes(name.toUpperCase()))?.[0] || 0;
const monthPattern = `(${MONTHS.flatMap(([, names]) => names).sort((a, b) => b.length - a.length).join('|')})`;
type DatePart = { month: number; day: number; year?: number };
type HeaderRange = { start: DatePart; end: DatePart };

// Longest first: "TERM" must not claim the start of "TERMINO".
const TERM_WORDS = 'TERMINO|TRIMESTER|TRIMESTRE|TERM|TRI|MARKAHAN|QUARTER|QTR|GRADING(?:\\s+PERIOD)?';
const WEEK_WORDS = 'WEEK|WK\\.?|LINGGO|LINGGUHAN';
const NEAR_SPELLED = ['TERM', 'TERMINO', 'TRIMESTER', 'TRIMESTRE', 'MARKAHAN', 'QUARTER', 'WEEK', 'LINGGO',
    'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'LUNES', 'MARTES', 'MIYERKULES', 'HUWEBES', 'BIYERNES',
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
    'ENERO', 'PEBRERO', 'MARSO', 'ABRIL', 'HUNYO', 'HULYO', 'AGOSTO', 'SETYEMBRE', 'OKTUBRE', 'NOBYEMBRE', 'DISYEMBRE'];
const LABEL_GAP = '(?:\\s*(?:NO\\.?|NUMBER|BLG\\.?|BILANG|[#:|=.-]))*\\s*';
const NUMBER_TOKEN = '\\d{1,2}(?:ST|ND|RD|TH)?|IKA[- ]\\d{1,2}|[A-Z][A-Z-]*';
const PERIOD_AFTER = new RegExp(`^\\s+(?:NA\\s+)?(?:${TERM_WORDS}|${WEEK_WORDS}|DAY|ARAW)\\b`, 'i');

/** "Term 2", "Term Two", "Week VII", "Linggo: Ikapito". A following period word means it belongs to that word. */
function numbersAfter(header: string, words: string): number[] {
    const found: number[] = [];
    for (const match of header.matchAll(new RegExp(`\\b(?:${words})${LABEL_GAP}(${NUMBER_TOKEN})\\b`, 'gi'))) {
        const after = header.slice(match.index! + match[0].length);
        if (!/^\d/.test(match[1])) {
            if (PERIOD_AFTER.test(after)) continue;
            // A word on the next line only counts when it stands alone: "Linggo\nUnang Araw" is not week 1.
            if (match[0].includes('\n') && !/^[ \t]*(?:\n|$)/.test(after)) continue;
        }
        const value = wordNumber(match[1]);
        if (value !== null) found.push(value);
    }
    return found;
}

/** "2nd Term", "Ikalawang Termino", "Ika-2 Markahan", "Ikapitong Linggo", "Ika 7 na Linggo". */
function ordinalsBefore(header: string, words: string): number[] {
    const found: number[] = [];
    for (const match of header.matchAll(new RegExp(`\\b(\\d{1,2}(?:ST|ND|RD|TH)|IKA[- ]?[A-Z0-9]+|[A-Z]+)\\s+(?:NA\\s+)?(?:${words})\\b`, 'gi'))) {
        if (isOrdinalWord(match[1])) found.push(wordNumber(match[1])!);
    }
    return found;
}

const WEEKDAYS: Record<string, string> = {
    MONDAY: 'Monday', TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday', THURSDAY: 'Thursday', FRIDAY: 'Friday',
    LUNES: 'Monday', MARTES: 'Tuesday', MIYERKULES: 'Wednesday', MIYERKOLES: 'Wednesday', MIERKULES: 'Wednesday', HUWEBES: 'Thursday', BIYERNES: 'Friday',
};
const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/** "Monday", "Lunes", "Monday to Friday", "Day 1" or "Unang Araw". Sunday is left out because Linggo also means week. */
function readHeaderDay(header: string): { day: string | null; dayNumber: number | null } {
    const days = new Set<string>();
    for (const match of header.matchAll(new RegExp(`\\b(${Object.keys(WEEKDAYS).join('|')})\\b`, 'gi'))) days.add(WEEKDAYS[match[1].toUpperCase()]);
    const ordered = WEEKDAY_ORDER.filter(day => days.has(day));
    const dayNumbers = new Set<number>([
        ...numbersAfter(header, 'DAY|ARAW'),
        ...ordinalsBefore(header, 'DAY|ARAW'),
    ].filter(value => value >= 1 && value <= 5));
    return {
        day: ordered.length > 1 ? `${ordered[0]} to ${ordered.at(-1)}` : ordered[0] || null,
        dayNumber: dayNumbers.size === 1 ? [...dayNumbers][0] : null,
    };
}

/** A file name in a form the period reader understands. "TERM2WEEK7_final.pdf" becomes "TERM2 WEEK7 final". */
export function fileNameAsHeaderText(fileName: string): string {
    return fileName.replace(/\.pdf$/i, '').replace(/\(\d+\)/g, ' ').replace(/_+/g, ' ')
        .replace(/(\d)(?!ST|ND|RD|TH)([A-Z])/gi, '$1 $2').replace(/\s+/g, ' ').trim();
}

/** Filenames are only read through fileNameAsHeaderText, and lesson-body references never count. */
export function readHeaderPeriod(text: string) {
    const lines = text.replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean);
    const body = lines.findIndex(line => /^(?:(?:[A-Z]|[IVX]+|\d+)[.)]\s*|[IVX]+\s+)?(?:(?:MGA\s+)?LAYUNIN|OBJECTIVES|CONTENT\s+STANDARD|PAMANTAYAN|PROCEDURES|PAMAMARAAN|NILALAMAN)\b/i.test(line));
    let header = correctLabelWords(lines.slice(0, body >= 0 ? Math.min(body, 40) : 40).join('\n'), NEAR_SPELLED);
    const paired: [number, number][] = [];
    // "Term/Week: 2/7". Removed once read, so the 2 is not also taken as the week.
    header = header.replace(new RegExp(`\\b(?:${TERM_WORDS})\\s*(?:\\/|&|AND|AT)\\s*(?:${WEEK_WORDS})\\s*[:|=-]*\\s*(\\d)\\s*[/,-]\\s*(\\d{1,2})\\b`, 'gi'), (_, term, week) => {
        paired.push([Number(term), Number(week)]);
        return ' ';
    });
    const terms = new Set<number>([...paired.map(([term]) => term), ...numbersAfter(header, TERM_WORDS), ...ordinalsBefore(header, TERM_WORDS)]);
    const weeks = new Set<number>([...paired.map(([, week]) => week), ...numbersAfter(header, WEEK_WORDS), ...ordinalsBefore(header, WEEK_WORDS)]);
    for (const match of header.matchAll(/\bIKA[- ]?(\d{1,2})\s*LINGGO\b/gi)) weeks.add(Number(match[1]));
    // "T2W7" or "Q2 W7". A lone "T-1" is left alone because it is also a teacher position.
    for (const match of header.matchAll(/\b[TQ]\s*-?\s*([1-4])\s*[,/-]?\s*W(?:K|EEK)?\s*-?\s*(\d{1,2})\b/gi)) { terms.add(Number(match[1])); weeks.add(Number(match[2])); }
    for (const match of header.matchAll(/\bQ\s*-?\s*([1-4])\b/gi)) terms.add(Number(match[1]));
    for (const line of lines) { const only = line.match(/^T\s*-?\s*([1-3])$/i); if (only && lines.indexOf(line) < 40) terms.add(Number(only[1])); }
    for (const match of header.matchAll(/\bW\s*-?\s*(\d{1,2})\b/gi)) weeks.add(Number(match[1]));
    const ranges: HeaderRange[] = [];
    const toEnd = '(?:\\s*(?:[-\\u2013\\u2014]|TO|HANGGANG)\\s*(?:' + monthPattern + '\\.?\\s*)?(\\d{1,2})(?:ST|ND|RD|TH)?)?';
    const datePattern = new RegExp(String.raw`\b${monthPattern}\.?\s*(\d{1,2})(?:ST|ND|RD|TH)?${toEnd}(?:\s*,?\s*(20\d{2}))?\b`,'gi');
    for (const match of header.matchAll(datePattern)) {
        const startMonth = monthNumber(match[1]);
        const endMonth = match[3] ? monthNumber(match[3]) : startMonth;
        const year = match[5] ? Number(match[5]) : undefined;
        ranges.push({start:{month:startMonth,day:Number(match[2]),year:year && endMonth < startMonth ? year-1 : year},end:{month:endMonth,day:Number(match[4] || match[2]),year}});
    }
    // "25 October 2026"
    for (const match of header.matchAll(new RegExp(String.raw`\b(\d{1,2})(?:ST|ND|RD|TH)?\s+(?:OF\s+)?${monthPattern}\.?(?:\s*,?\s*(20\d{2}))?\b`,'gi'))) {
        const part = {month:monthNumber(match[2]),day:Number(match[1]),year:match[3] ? Number(match[3]) : undefined}; ranges.push({start:part,end:part});
    }
    for (const match of header.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) {
        const part = {year:Number(match[1]),month:Number(match[2]),day:Number(match[3])}; ranges.push({start:part,end:part});
    }
    for (const match of header.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g)) {
        const first=Number(match[1]),second=Number(match[2]);
        // Ambiguous numeric dates require confirmation instead of guessing a locale.
        if (first <= 12 && second <= 12 && first !== second) continue;
        const part={year:Number(match[3]),month:first>12?second:first,day:first>12?first:second};ranges.push({start:part,end:part});
    }
    const schoolYear = header.match(/(?:S\.?Y\.?|SCHOOL\s*YEAR|TAONG\s*PANURUAN)\s*[: -]*\s*(20\d{2})\s*[-\u2013]\s*(20\d{2})/i);
    return { header, termNumber:terms.size===1?[...terms][0]:null, weekNumber:weeks.size===1?[...weeks][0]:null,
        invalid:terms.size>1 || weeks.size>1 || [...terms].some(value=>value<1||value>3) || [...weeks].some(value=>value<1||value>14),
        ranges, schoolYear:schoolYear?`${schoolYear[1]}-${schoolYear[2]}`:null, ...readHeaderDay(header) };
}
function dayNumber(part: DatePart, year: number) {
    const date = new Date(Date.UTC(part.year || year, part.month-1, part.day));
    if (date.getUTCFullYear() !== (part.year || year) || date.getUTCMonth() !== part.month-1 || date.getUTCDate() !== part.day) return null;
    return date.getTime()/DAY;
}

/** Explicit header period wins. Date fallback includes up to three calendar days late. */
export function resolveHeaderUploadPeriod<T extends UploadCalendarTarget>(text: string, calendar: T[], options: {schoolYear: string; subject?: string | null; schoolName?: string | null}) {
    const header = readHeaderPeriod(text);
    if (header.invalid || header.schoolYear && header.schoolYear !== options.schoolYear) return null;
    const candidates = calendar.filter(entry => entry.school_year === options.schoolYear && Number.isInteger(entry.term) && entry.term >= 1 && entry.term <= 3 && Number.isInteger(entry.week_number) && entry.week_number >= 1 && entry.week_number <= 14 &&
        (!header.termNumber || entry.term === header.termNumber) && (!header.weekNumber || entry.week_number === header.weekNumber));
    if (header.weekNumber && candidates.length === 1) return candidates[0].is_active === true ? candidates[0] : null;
    if (!candidates.length) return null;
    // Only one of term or week was written: it is enough when a single matching period is Open.
    if (!header.ranges.length) {
        if (!header.termNumber && !header.weekNumber) return null;
        const open = candidates.filter(entry => entry.is_active === true);
        return open.length === 1 ? open[0] : null;
    }
    const scores: {entry:T; score:number}[] = [];
    for (const entry of candidates) {
        if (!entry.deadline_date) continue;
        const deadline = effectiveDeadlineForSubject(entry.deadline_date, options.subject, options.schoolName);
        if (!Number.isFinite(deadline.getTime())) continue;
        const ph = new Date(deadline.getTime()+8*3600000);
        const due = Date.UTC(ph.getUTCFullYear(),ph.getUTCMonth(),ph.getUTCDate())/DAY;
        let best=Infinity;
        for (const range of header.ranges) for (const year of [ph.getUTCFullYear()-1,ph.getUTCFullYear(),ph.getUTCFullYear()+1]) {
            const start=dayNumber(range.start,year);
            const endYear=range.end.month<range.start.month?year+1:year;
            const end=dayNumber(range.end,endYear);
            if(start===null||end===null||end<start||end-start>14)continue;
            const signed = start>due ? start-due : end<due ? end-due : 0;
            if(signed < -7 || signed > 3)continue;
            best=Math.min(best,Math.abs(signed));
        }
        if(Number.isFinite(best))scores.push({entry,score:best});
    }
    scores.sort((a,b)=>a.score-b.score);
    if (!scores.length || scores[1]?.score === scores[0].score) return null;
    return scores[0].entry.is_active === true ? scores[0].entry : null;
}

/** Use the calendar only when the PDF has no conflicting period evidence. */
export function resolveUniqueOpenUploadPeriod<T extends UploadCalendarTarget>(text: string, calendar: T[], schoolYear: string,
    options: { subject?: string | null; schoolName?: string | null } = {}): T | null {
    const header = readHeaderPeriod(text);
    if (header.invalid || (header.schoolYear && header.schoolYear !== schoolYear) ||
        (header.termNumber && header.weekNumber)) return null;
    const open = calendar.filter(entry => entry.school_year === schoolYear && entry.is_active === true &&
        Number.isInteger(entry.term) && entry.term >= 1 && entry.term <= 3 &&
        Number.isInteger(entry.week_number) && entry.week_number >= 1 && entry.week_number <= 14);
    if (open.length !== 1) return null;
    const only = open[0];
    if (header.termNumber && header.termNumber !== only.term) return null;
    if (header.weekNumber && header.weekNumber !== only.week_number) return null;
    if (header.ranges.length) {
        const years = new Set(schoolYear.split('-').map(Number));
        if (header.ranges.some(range => [range.start.year, range.end.year].some(year => year && !years.has(year)))) return null;
        const dated = resolveHeaderUploadPeriod(text, calendar.map(entry => ({...entry, is_active: true})),
            { schoolYear, subject: options.subject, schoolName: options.schoolName });
        if (dated && (dated.term !== only.term || dated.week_number !== only.week_number)) return null;
    }
    return only;
}
