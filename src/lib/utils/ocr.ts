import { readHeaderPeriod } from './headerPeriod';
import { extractTeachingLoadFields } from './teachingLoadFields';
/**
 * OCR Metadata Extraction — Tesseract.js (Client-Side)
 * Dynamically imported to avoid blocking initial bundle.
 * Scans the first page ROI to extract document type, week, and school year.
 */
import { predictSubject, predictGradeLevel, predictDocType, predictTermNumber } from './fuzzyClassifier';
import { PDFJS_VERSION } from './pdfjsVersion';

const OCR_DEBUG = false;
const debugLog = (...args: any[]) => { if (OCR_DEBUG) console.log(...args); };
const debugWarn = (...args: any[]) => { if (OCR_DEBUG) console.warn(...args); };

export interface DateRange {
    start: Date;
    end: Date;
    raw: string;
}

export interface DocMetadata {
    docType: 'DLL' | 'ISP' | 'ISR' | 'Unknown';
    termNumber: number | null;
    weekNumber: number | null;
    schoolYear: string | null;
    subject: string | null;
    subjectConfidence?: number;
    gradeLevel: string | null;
    rawText: string;
    confidence: number;
    language: 'English' | 'Filipino' | 'Unknown';
    school: string | null;
    teacher: string | null;
    date: string | null;
    day: string | null;
    dateRange: DateRange | null;
    weekSource?: 'calendar' | 'header-date' | 'regex' | 'none';
}

// pdf.min.js is a few hundred KB. On the broadband desktops were tested on,
// 10s was never a real constraint — but at the mobile data speeds this app
// actually gets used on in the field (screenshots as low as ~2 KB/s), a
// several-hundred-KB script can take well over a minute, so the old 10s
// timeout was guaranteed to fire on exactly the connections this matters
// most for, silently degrading every PDF upload to "Unknown" metadata
// detection instead of just taking longer to load.
let pdfJsLoading: Promise<void> | null = null;
export function loadPdfJs(timeoutMs: number = 45000): Promise<void> {
    if ((window as any).pdfjsLib) return Promise.resolve();
    if (pdfJsLoading) return pdfJsLoading;
    const request = new Promise<void>((resolve, reject) => {
        if ((window as any)['pdfjsLib']) {
            resolve();
            return;
        }
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error('Timed out loading PDF.js from CDN'));
        }, timeoutMs);
        const cleanup = () => clearTimeout(timer);
        const script = document.createElement('script');
        script.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
        script.onload = () => {
            if (settled) return;
            settled = true;
            cleanup();
            (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
                `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
            resolve();
        };
        script.onerror = () => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error('Failed to load PDF.js from CDN'));
        };
        document.head.appendChild(script);
    });
    pdfJsLoading = request;
    void request.catch(() => { if (pdfJsLoading === request) pdfJsLoading = null; });
    return request;
}

/** Warm the shared PDF reader only; image OCR is loaded only when needed. */
export async function warmPdfReader(): Promise<void> {
    await loadPdfJs();
}

export async function extractMetadata(file: File, options: { signal?: AbortSignal } = {}): Promise<DocMetadata> {
    const signal = options.signal;
    signal?.throwIfAborted();
    const ext = file.name.split('.').pop()?.toLowerCase();

    // PDF path: extract text directly, falling back to raster OCR if needed.
    if (file.type === 'application/pdf' || ext === 'pdf') {
        let pdfTask: any = null;
        const cancelPdf = () => { void pdfTask?.destroy().catch(() => {}); };
        try {
            let pdfjsLib = (window as any)['pdfjsLib'];
            if (!pdfjsLib) {
                debugWarn('[ocr] PDF.js not loaded. Loading from CDN...');
                await loadPdfJs();
                pdfjsLib = (window as any)['pdfjsLib'];
                if (!pdfjsLib) {
                    debugWarn('[ocr] Failed to load PDF.js. Using default metadata.');
                    return createDefaultMetadata();
                }
            }

            // Set worker source for pdf.js (crucial for some environments)
            if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                const version = pdfjsLib.version || '3.11.174';

                // Use the CDN if online (likely already cached by the browser), otherwise
                // fall back to /pdf.worker.min.js locally (only works if the user added it manually).
                if (navigator.onLine) {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`;
                } else {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.js`;
                }
            }

            signal?.throwIfAborted();
            const arrayBuffer = await file.arrayBuffer();
            signal?.throwIfAborted();
            pdfTask = pdfjsLib.getDocument({ data: arrayBuffer });
            signal?.addEventListener('abort', cancelPdf, { once: true });
            const pdf = await pdfTask.promise;
            const page = await pdf.getPage(1);
            const textContent = await page.getTextContent();
            signal?.throwIfAborted();
            const text = textContentToLines(textContent.items);
            debugLog(`[ocr] PDF text extracted (${text.length} chars):`, text.substring(0, 200) + '...');

            // If text is too short, fallback to raster OCR
            if (text.length < 50) {
                debugWarn('[ocr] PDF text too sparse. Falling back to raster OCR...');
                return await extractRasterMetadata(page, pdfjsLib, file.name, signal);
            }

            const metadata = parseMetadata(text, file.name);
            return { ...metadata, rawText: text, confidence: 100, language: detectLanguage(text) };
        } catch (err) {
            debugWarn('[ocr] PDF extraction skipped:', err);
            return createDefaultMetadata();
        } finally {
            signal?.removeEventListener('abort', cancelPdf);
            await pdfTask?.destroy().catch(() => {});
        }
    }

    // Image path: OCR via Tesseract (multilingual).
    if (!file.type.startsWith('image/')) {
        return createDefaultMetadata();
    }

    const objectUrl = URL.createObjectURL(file);

    try {
        // Tesseract.js automatically caches the worker and language data in IndexedDB,
        // so as long as it runs once while online, it keeps working offline.
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng+fil', 1, {
            logger: (m: any) => debugLog(m),
            errorHandler: (err: any) => debugWarn('[ocr] Tesseract worker skipped:', err)
        });

        try {
            // Manual thresholding for low-end mobile CPUs
            const { data } = await worker.recognize(objectUrl, {}, { text: true, blocks: true });
            const confidence = data.confidence;
            const text = ocrBlocksToLines(data.blocks, data.text);

            // Post-process language detection from result
            const language = detectLanguage(text);
            const metadata = parseMetadata(text, file.name);

            debugLog(`[ocr] Optimized single-pass OCR results (Language: ${language}, Confidence: ${confidence}%)`);
            return { ...metadata, confidence, language };
        } finally {
            await worker.terminate();
        }
    } catch (err) {
        debugWarn('[ocr] Optimized image OCR skipped:', err);
        return createDefaultMetadata();
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

export function createDefaultMetadata(): DocMetadata {
    return {
        docType: 'Unknown',
        termNumber: null,
        weekNumber: null,
        schoolYear: null,
        subject: null,
        subjectConfidence: 0,
        gradeLevel: null,
        rawText: '',
        confidence: 0,
        language: 'Unknown',
        school: null,
        teacher: null,
        date: null,
        day: null,
        dateRange: null,
        weekSource: 'none'
    };
}

function joinVisualRows(items: {x:number; y:number; text:string; height?:number}[], topDown: boolean): string {
    const rows: {y:number; height:number; items:typeof items}[] = [];
    const ordered = items.filter(item => item.text.trim()).sort((a,b) => topDown ? a.y-b.y : b.y-a.y);
    for (const item of ordered) {
        const last = rows[rows.length-1];
        const tolerance = Math.max(topDown ? 3 : 4, Math.min(item.height || 0,last?.height || 0)*0.35);
        if (last && Math.abs(item.y-last.y)<=tolerance) last.items.push(item);
        else rows.push({y:item.y,height:item.height || 0,items:[item]});
    }
    return rows.map(row => row.items.sort((a,b)=>a.x-b.x).map(item=>item.text.trim()).join(' ')).join('\n');
}

/** Preserve table rows even when italic labels and cell values have different baselines. */
export function textContentToLines(items: any[]): string {
    return joinVisualRows(items.map(item => ({
        x:Number(item.transform?.[4] || 0), y:Number(item.transform?.[5] || 0),
        height:Number(item.height || 0), text:String(item.str || '')
    })),false);
}

/** Recover visual reading order when scanned table cells arrive as separate OCR blocks. */
export function ocrBlocksToLines(blocks: any[] | null | undefined, fallback: string): string {
    const words: {x:number; y:number; height:number; text:string}[] = [];
    for (const block of blocks || []) for (const paragraph of block.paragraphs || []) for (const line of paragraph.lines || []) {
        for (const word of line.words || []) {
            if (!word.bbox || !word.text) continue;
            words.push({x:word.bbox.x0,y:word.bbox.y1,height:word.bbox.y1-word.bbox.y0,text:word.text});
        }
    }
    return words.length ? joinVisualRows(words,true) : fallback;
}

async function extractRasterMetadata(page: any, pdfjsLib: any, fileName: string = '', signal?: AbortSignal): Promise<DocMetadata> {
    let worker: Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> | null = null;
    let workerStopped: Promise<unknown> | null = null;
    let blobUrl: string | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let renderTask: any = null;
    const stop = () => {
        renderTask?.cancel();
        if (worker && !workerStopped) workerStopped = worker.terminate().catch(() => {});
    };
    signal?.addEventListener('abort', stop, { once: true });
    try {
        signal?.throwIfAborted();
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const viewport = page.getViewport({ scale: isMobile ? 1.0 : 2.5 });
        canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not get canvas context');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
        renderTask = null;
        signal?.throwIfAborted();
        if (isMobile) {
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < image.data.length; i += 4) {
                const value = (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3 > 128 ? 255 : 0;
                image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
                image.data[i + 3] = 255;
            }
            context.putImageData(image, 0, 0);
        }
        const blob = await new Promise<Blob>((resolve, reject) => canvas!.toBlob(value =>
            value ? resolve(value) : reject(new Error('Could not prepare this page for scanning')), 'image/png'));
        signal?.throwIfAborted();
        blobUrl = URL.createObjectURL(blob);
        const { createWorker } = await import('tesseract.js');
        signal?.throwIfAborted();
        worker = await createWorker('eng+fil');
        signal?.throwIfAborted();
        const { data } = await worker.recognize(blobUrl, {}, { text: true, blocks: true });
        const confidence = data.confidence;
        const text = ocrBlocksToLines(data.blocks, data.text);
        signal?.throwIfAborted();
        return { ...parseMetadata(text, fileName), rawText: text, confidence, language: detectLanguage(text) };
    } catch (error) {
        debugWarn('[ocr] Raster fallback skipped:', error);
        return createDefaultMetadata();
    } finally {
        signal?.removeEventListener('abort', stop);
        stop();
        if (workerStopped) await workerStopped;
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        if (canvas) { canvas.width = 0; canvas.height = 0; }
    }
}

function detectLanguage(text: string): 'English' | 'Filipino' | 'Unknown' {
    const upper = text.toUpperCase();

    // Filipino/Tagalog indicators
    const filipinoPatterns = [
        /PAARALAN|GURO|PETSA|ORAS|BAITANG|ASIGNATURA|MARKAHAN|LUNES|MARTES|MIYERKULES|HUWEBES|BIYERNES/,
        /NILALAMAN|PAMANTAYAN|KASANAYAN|KURIKULUM|LAYUNIN|GAWAIN/,
        /EDUKASYON\s*SA\s*PAGPAPAKATAO|ARALING\s*PANLIPUNAN|PILIPINAS/
    ];

    // English indicators  
    const englishPatterns = [
        /SCHOOL|TEACHER|DATE|TIME|GRADE|SUBJECT|MARK|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY/,
        /CONTENT|STANDARDS|COMPETENCIES|ACTIVITIES|ASSESSMENT|RESOURCES/,
        /LEARNING\s*OBJECTIVES|PERFORMANCE|QUARTER|WEEK/
    ];

    let filipinoScore = 0;
    let englishScore = 0;

    for (const pattern of filipinoPatterns) {
        const matches = text.match(pattern);
        filipinoScore += matches ? matches.length : 0;
    }

    for (const pattern of englishPatterns) {
        const matches = text.match(pattern);
        englishScore += matches ? matches.length : 0;
    }

    if (filipinoScore > englishScore && filipinoScore > 0) return 'Filipino';
    if (englishScore > filipinoScore && englishScore > 0) return 'English';
    return 'Unknown';
}

export function parseMetadata(text: string, fileName: string = ''): Omit<DocMetadata, 'confidence' | 'language'> {
    const upper = text.toUpperCase();
    const filenameText = fileName
        .replace(/\.[^.]+$/, '')
        .replace(/[_\-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const filenameUpper = filenameText.toUpperCase();
    const headerText = getHeaderText(text);
    const headerUpper = headerText.toUpperCase();
    const headerAndFilename = [headerText, filenameText].filter(Boolean).join('\n');
    const headerAndFilenameUpper = headerAndFilename.toUpperCase();

    // Helper to convert Roman numerals to numbers
    const romanToNum = (roman: string): string => {
        const map: Record<string, string> = {
            'I': '1', 'II': '2', 'III': '3', 'IV': '4', 'V': '5', 'VI': '6',
            'VII': '7', 'VIII': '8', 'IX': '9', 'X': '10', 'XI': '11', 'XII': '12'
        };
        return map[roman] || roman;
    };

    // Detect document type
    let docType: DocMetadata['docType'] = 'Unknown';
    // Tier 1: Regex-based detection (highest confidence)
    if (/DAILY\s*LESSON\s*(LOG|PLAN)|D\.?L\.?L\.?|DETALYADONG\s*PLANO|ARAW-ARAW\s*LEKSYON|LINGGUHANG\s*ARALIN|BANGHAY\s*ARALIN|MATATAG|PANG-ARAW-ARAW\s*NA\s*TALA|WEEKLY\s*LESSON\s*LOG/i.test(upper)) {
        docType = 'DLL';
    } else if (/INSTRUCTIONAL\s*SUPERVISORY\s*PLAN|I\.?S\.?P\.?|SUPERVISORY\s*PLAN/i.test(upper)) {
        docType = 'ISP';
    } else if (/INSTRUCTIONAL\s*SUPERVISORY\s*REPORT|I\.?S\.?R\.?|SUPERVISORY\s*REPORT/i.test(upper)) {
        docType = 'ISR';
    }

    // Tier 2: Fuzzy fallback (handles OCR typos like "DALY LESSON LOG")
    if (docType === 'Unknown') {
        const fuzzyDt = predictDocType(text);
        if (fuzzyDt.value) {
            docType = fuzzyDt.value as 'DLL' | 'ISP' | 'ISR';
            debugLog(`[ocr] Fuzzy matched doc type as ${docType} (confidence: ${fuzzyDt.confidence}%)`);
        }
    }

    // For ISP/ISR documents, skip subject/grade/week detection — they are supervisory docs
    let subject: string | null = null;
    let subjectConfidence = 0;
    let gradeLevel: string | null = null;
    let termNumber: number | null = null;
    let weekNumber: number | null = null;
    let weekSource: 'calendar' | 'header-date' | 'regex' | 'none' = 'none';

    if (docType === 'DLL') {
        // Load classification uses only the named subject and grade fields.
        const loadFields = extractTeachingLoadFields(text);
        subject = loadFields.subject;
        subjectConfidence = loadFields.subjectConfidence;
        gradeLevel = loadFields.grade || null;

        const headerPeriod = readHeaderPeriod(text);
        termNumber = headerPeriod.invalid ? null : headerPeriod.termNumber;
        weekNumber = headerPeriod.invalid ? null : headerPeriod.weekNumber;
        weekSource = weekNumber ? 'regex' : 'none';
    }

    // Extract school year
    const syMatch = headerAndFilename.match(/S\.?Y\.?\s*(\d{4}\s*[-–]\s*\d{4})/i) ||
        headerAndFilename.match(/(\d{4}\s*[-–]\s*\d{4})/);
    const schoolYear = syMatch ? syMatch[1].replace(/\s/g, '') : null;

    // Extract school name (Filipino: Paaralan, English: School)
    const schoolMatch = headerText.match(/(?:SCHOOL|PAARALAN)\s*[:\t\-]*\s*([^\n\t|]+)/i);
    const school = schoolMatch ? schoolMatch[1].trim() : null;

    // Extract teacher name (Filipino: Guro, English: Teacher)
    const teacherMatch = headerText.match(/(?:TEACHER|GURO|EDUCATOR)\s*[:\t\-]*\s*([^\n\t|]+)/i);
    const teacher = teacherMatch ? teacherMatch[1].trim() : null;

    const dateMatch = headerText.match(/(?:Teaching\s*Dates?(?:\s*and\s*Time)?|DATE|PETSA(?:\s*(?:at|[/|])\s*(?:ORAS|DATE))?(?:\s*ng\s*Pagtuturo)?)\s*[:\t\-\s]*\s*([^\n\t|]{5,})/i);
    const date = dateMatch ? dateMatch[1].trim() : null;
    const day = extractDay(headerAndFilename);

    const dateRange = parseDateRange(headerText);
    if (dateRange && !weekNumber) {
        weekSource = 'header-date';
        debugLog(`[ocr] Parsed date range: ${dateRange.start.toDateString()} - ${dateRange.end.toDateString()}`);
    }

    debugLog('[ocr] Extracted date raw:', dateMatch ? dateMatch[0] : 'NONE');
    debugLog('[ocr] Week detection source:', weekSource);

    return {
        docType,
        termNumber,
        weekNumber,
        schoolYear,
        subject,
        subjectConfidence,
        gradeLevel,
        rawText: text,
        school,
        teacher,
        date,
        day,
        dateRange,
        weekSource
    };
}

function getHeaderText(text: string): string {
    const normalized = text.replace(/\r/g, '\n');
    const lines = normalized
        .split('\n')
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    if (lines.length <= 35) return lines.join('\n');

    const headerEnd = lines.findIndex((line, index) =>
        index > 8 && /OBJECTIVES|LAYUNIN|CONTENT\s+STANDARD|PAMANTAYAN|PROCEDURES|PAMAMARAAN|LEARNING\s+COMPETENC/i.test(line)
    );

    return lines.slice(0, headerEnd > 0 ? Math.min(headerEnd, 35) : 35).join('\n');
}

function extractDay(text: string): string | null {
    const match = text.match(/\b(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY|LUNES|MARTES|MIYERKULES|MIERKULES|HUWEBES|BIYERNES|SABADO|LINGGO)\b/i);
    if (!match) return null;

    const normalized = match[1].toUpperCase();
    const map: Record<string, string> = {
        LUNES: 'Monday',
        MARTES: 'Tuesday',
        MIYERKULES: 'Wednesday',
        MIERKULES: 'Wednesday',
        HUWEBES: 'Thursday',
        BIYERNES: 'Friday',
        SABADO: 'Saturday',
        LINGGO: 'Sunday'
    };

    return map[normalized] || normalized.charAt(0) + normalized.slice(1).toLowerCase();
}

/**
 * Build subject regex patterns (shared between header regex and full-text fallback).
 */
function buildSubjectPatterns(_forHeader: boolean): { name: string; regex: RegExp }[] {
    return [
        { name: 'Makabansa', regex: /MAKABANSA/i },
        { name: 'HGP', regex: /\bH\.?G\.?P\.?\b|HOMEROOM\s+GUIDANCE(?:\s+PROGRAM)?/i },
        { name: 'English', regex: /ENGLISH|(?<!WIKANG\s)WIKA(?!NG\s*PILIPINO)/i },
        { name: 'Filipino', regex: /FILIPINO|TAGALOG|WIKANG\s*PILIPINO/i },
        { name: 'Mathematics', regex: /MATHEMATICS|MATH|MATEMATIKA/i },
        { name: 'Science', regex: /SCIENCE|AGHAM/i },
        { name: 'AP', regex: /ARALING\s*PANLIPUNAN|\bAP\b|SOCIAL\s*STUDIES/i },
        { name: 'GMRC', regex: /EDUKASYON\s*SA\s*PAGPAPAKATAO|E\.?S\.?P\.?|GMRC|VALUES|MORAL/i },
        { name: 'MAPEH', regex: /MAPEH|ARTS|MUSIC|PHYSICAL|HEALTH|PE/i },
        { name: 'EPP', regex: /E\.?P\.?P\.?|EDUKASYON.*PRODUKTIBO|VOCATIONAL/i },
        { name: 'TLE', regex: /T\.?L\.?E\.?|TECHNOLOGY.*LIVELIHOOD/i },
        { name: 'Reading and Literacy', regex: /READING\s*(?:AND|&)\s*LITERACY/i },
        { name: 'Language', regex: /(?<!READING\s+(?:AND|&)\s+)LANGUAGE(?!\s+(?:AND|&)\s+LITERACY|LITERACY)/i },
        { name: 'Numeracy', regex: /NUMERACY/i },
        { name: 'Language Literacy and Communication', regex: /LANGUAGE\s+LITERACY\s+AND\s+COMMUNICATION/i },
        { name: 'Arts and Music', regex: /ARTS\s+(?:AND|&)\s+MUSIC/i },
        { name: 'Physical Development', regex: /PHYSICAL\s+DEVELOPMENT/i },
    ];
}

const MONTH_MAP: Record<string, number> = {
    // English
    JANUARY: 0, FEBRUARY: 1, MARCH: 2, APRIL: 3, MAY: 4, JUNE: 5,
    JULY: 6, AUGUST: 7, SEPTEMBER: 8, OCTOBER: 9, NOVEMBER: 10, DECEMBER: 11,
    JAN: 0, FEB: 1, MAR: 2, APR: 3, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
    // Filipino
    ENERO: 0, PEBRERO: 1, MARSO: 2, ABRIL: 3, MAYO: 4, HUNYO: 5,
    HULYO: 6, AGOSTO: 7, SETYEMBRE: 8, OKTUBRE: 9, NOBYEMBRE: 10, DISYEMBRE: 11
};

/**
 * Parse date ranges from DLL/ISP headers.
 * Handles formats like:
 *   "FEBRUARY 9 - 13, 2026"
 *   "ENERO 15 - 19, 2026"  
 *   "FEBRUARY 25 - 29, 2026"
 *   "March 30 - April 3, 2026"
 *   "FEBRUARY 9-13, 2026"
 */
export function parseDateRange(text: string): DateRange | null {
    const upper = text.toUpperCase();

    // Build month name regex from our map
    const monthNames = Object.keys(MONTH_MAP).join('|');

    // Pattern 1: "MONTH DAY - DAY, YEAR" (same month)
    const sameMonth = new RegExp(
        `(${monthNames})\\s+(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})[,\\s]+(\\d{4})`,
        'i'
    );

    // Pattern 2: "MONTH DAY - MONTH DAY, YEAR" (cross-month)
    const crossMonth = new RegExp(
        `(${monthNames})\\s+(\\d{1,2})\\s*[-–]\\s*(${monthNames})\\s+(\\d{1,2})[,\\s]+(\\d{4})`,
        'i'
    );

    // Try cross-month first (more specific)
    let match = upper.match(crossMonth);
    if (match) {
        const startMonth = MONTH_MAP[match[1]];
        const startDay = parseInt(match[2]);
        const endMonth = MONTH_MAP[match[3]];
        const endDay = parseInt(match[4]);
        const year = parseInt(match[5]);

        if (startMonth !== undefined && endMonth !== undefined && !isNaN(year)) {
            const start = new Date(year, startMonth, startDay);
            const end = new Date(year, endMonth, endDay);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                return { start, end, raw: match[0] };
            }
        }
    }

    // Try same-month pattern
    match = upper.match(sameMonth);
    if (match) {
        const month = MONTH_MAP[match[1]];
        const startDay = parseInt(match[2]);
        const endDay = parseInt(match[3]);
        const year = parseInt(match[4]);

        if (month !== undefined && !isNaN(year)) {
            const start = new Date(year, month, startDay);
            const end = new Date(year, month, endDay);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                return { start, end, raw: match[0] };
            }
        }
    }

    return null;
}

/**
 * Resolve a parsed date range to an academic calendar week.
 * Compares the document's date range against the calendar's start/end dates.
 * Returns the matching week number and calendar ID, or null if no match.
 */
export function resolveWeekFromDates(
    dateRange: DateRange,
    calendar: { id?: string; week_number: number; deadline_date?: string }[]
): { weekNumber: number; calendarId?: string } | null {
    if (!calendar || calendar.length === 0) return null;

    const docStart = dateRange.start.getTime();
    const docEnd = dateRange.end.getTime();

    // Strategy 1: Deadline-based match — if doc end date is near the deadline
    for (const week of calendar) {
        if (week.deadline_date) {
            const deadline = new Date(week.deadline_date).getTime();
            // Assume the week starts 7 days before the deadline
            const weekStart = deadline - 7 * 24 * 60 * 60 * 1000;

            // Check if document dates overlap with this week window
            if (docStart <= deadline && docEnd >= weekStart) {
                debugLog(`[ocr] Date range matched calendar Week ${week.week_number} (deadline: ${week.deadline_date})`);
                return { weekNumber: week.week_number, calendarId: week.id };
            }
        }
    }

    // Strategy 2: Closest match — find the calendar week with the smallest distance to deadline
    let closest: { weekNumber: number; calendarId?: string; distance: number } | null = null;
    for (const week of calendar) {
        if (week.deadline_date) {
            const deadline = new Date(week.deadline_date).getTime();
            const distance = Math.abs(docEnd - deadline);
            if (!closest || distance < closest.distance) {
                closest = { weekNumber: week.week_number, calendarId: week.id, distance };
            }
        }
    }

    // Only accept closest match if within 7 days
    if (closest && closest.distance <= 7 * 24 * 60 * 60 * 1000) {
        debugLog(`[ocr] Date range closest-matched to calendar Week ${closest.weekNumber} (${Math.round(closest.distance / 86400000)}d distance to deadline)`);
        return { weekNumber: closest.weekNumber, calendarId: closest.calendarId };
    }

    return null;
}
