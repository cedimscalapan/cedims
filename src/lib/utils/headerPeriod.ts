import { effectiveDeadlineForSubject } from './deadlineRules';
import type { UploadCalendarTarget } from './uploadTargets';

const DAY = 86400000;
const months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
type DatePart = { month: number; day: number; year?: number };
type HeaderRange = { start: DatePart; end: DatePart };
const termNames: Record<string, number> = {I:1,II:2,III:3,IV:4,FIRST:1,SECOND:2,THIRD:3,'1ST':1,'2ND':2,'3RD':3,UNANG:1,IKALAWANG:2,IKATLONG:3};
const number = (value: string) => termNames[value.toUpperCase()] || Number(value);

/** Ignore filenames and lesson-body references when reading a document's period. */
export function readHeaderPeriod(text: string) {
    const lines = text.replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean);
    const body = lines.findIndex(line => /^(?:[IVX]+[.)]?\s*)?(?:OBJECTIVES|LAYUNIN|CONTENT\s+STANDARD|PAMANTAYAN|PROCEDURES|PAMAMARAAN)\b/i.test(line));
    const header = lines.slice(0, body >= 0 ? Math.min(body, 40) : 40).join('\n');
    const terms = new Set<number>(); const weeks = new Set<number>();
    for (const match of header.matchAll(/\b(?:TERM|TRIMESTER|MARKAHAN|QUARTER)\s*(?:NO\.?|NUMBER|#|:|-)?\s*(FIRST|SECOND|THIRD|UNANG|IKALAWANG|IKATLONG|IV|III|II|I|[1-9])\b/gi)) terms.add(number(match[1]));
    for (const match of header.matchAll(/\b(FIRST|SECOND|THIRD|1ST|2ND|3RD|UNANG|IKALAWANG|IKATLONG)\s+(?:TERM|TRIMESTER|MARKAHAN)\b/gi)) terms.add(number(match[1]));
    for (const match of header.matchAll(/\b(?:WEEK|WK\.?|LINGGO|LINGGUHAN)\s*(?:NO\.?|NUMBER|#|:|-)?\s*(\d{1,2})\b/gi)) weeks.add(Number(match[1]));
    for (const match of header.matchAll(/\bIKA[- ]?(\d{1,2})\s*LINGGO\b/gi)) weeks.add(Number(match[1]));
    const ranges: HeaderRange[] = [];
    const monthPattern = '(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)';
    const datePattern = new RegExp(String.raw`\b${monthPattern}\.?\s*(\d{1,2})(?:ST|ND|RD|TH)?(?:\s*[-\u2013]\s*(?:${monthPattern}\.?\s*)?(\d{1,2})(?:ST|ND|RD|TH)?)?(?:\s*,?\s*(20\d{2}))?\b`,'gi');
    for (const match of header.matchAll(datePattern)) {
        const startMonth = months.findIndex(month => month.startsWith(match[1].slice(0,3).toUpperCase())) + 1;
        const endMonth = match[3] ? months.findIndex(month => month.startsWith(match[3].slice(0,3).toUpperCase())) + 1 : startMonth;
        const year = match[5] ? Number(match[5]) : undefined;
        ranges.push({start:{month:startMonth,day:Number(match[2]),year:year && endMonth < startMonth ? year-1 : year},end:{month:endMonth,day:Number(match[4] || match[2]),year}});
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
        invalid:terms.size>1 || weeks.size>1 || [...terms].some(value=>value<1||value>3) || [...weeks].some(value=>value<1||value>39),
        ranges, schoolYear:schoolYear?`${schoolYear[1]}-${schoolYear[2]}`:null };
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
    const candidates = calendar.filter(entry => entry.school_year === options.schoolYear && Number.isInteger(entry.term) && entry.term >= 1 && entry.term <= 3 && Number.isInteger(entry.week_number) && entry.week_number >= 1 && entry.week_number <= 39 &&
        (!header.termNumber || entry.term === header.termNumber) && (!header.weekNumber || entry.week_number === header.weekNumber));
    if (header.weekNumber && candidates.length === 1) return candidates[0].is_active === true ? candidates[0] : null;
    if (!header.ranges.length || !candidates.length) return null;
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
        Number.isInteger(entry.week_number) && entry.week_number >= 1 && entry.week_number <= 39);
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
