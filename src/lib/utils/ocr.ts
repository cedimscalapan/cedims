/**
 * OCR Metadata Extraction — Tesseract.js (Client-Side)
 * Dynamically imported to avoid blocking initial bundle.
 * Scans the first page ROI to extract document type, week, and school year.
 */
import { predictSubject, predictGradeLevel, predictDocType } from './fuzzyClassifier';
import { createWorker } from 'tesseract.js';
import { PDFJS_VERSION } from './pdfjsVersion';

export interface DateRange {
    start: Date;
    end: Date;
    raw: string;
}

export interface DocMetadata {
    docType: 'DLL' | 'ISP' | 'ISR' | 'Unknown';
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
function loadPdfJs(timeoutMs: number = 45000): Promise<void> {
    return new Promise((resolve, reject) => {
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
}

export async function extractMetadata(file: File): Promise<DocMetadata> {
    const ext = file.name.split('.').pop()?.toLowerCase();

    // 1. Handle PDF OCR/Extraction
    if (file.type === 'application/pdf' || ext === 'pdf') {
        try {
            let pdfjsLib = (window as any)['pdfjsLib'];
            if (!pdfjsLib) {
                console.warn('[ocr] PDF.js not loaded. Loading from CDN...');
                await loadPdfJs();
                pdfjsLib = (window as any)['pdfjsLib'];
                if (!pdfjsLib) {
                    console.warn('[ocr] Failed to load PDF.js. Using default metadata.');
                    return createDefaultMetadata();
                }
            }

            // Set worker source for pdf.js (crucial for some environments)
            if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                const version = pdfjsLib.version || '3.11.174';

                // Priority 1: Use CDN if online (likely already cached by browser)
                if (navigator.onLine) {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`;
                } else {
                    // Priority 2: Try local fallback (will only work if user has manually added it)
                    // We use /pdf.worker.min.js as a convention
                    pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.js`;
                }
            }

            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);
            const textContent = await page.getTextContent();
            const text = textContent.items.map((item: any) => item.str).join(' ');
            console.log(`[ocr] PDF text extracted (${text.length} chars):`, text.substring(0, 200) + '...');

            // If text is too short, fallback to raster OCR
            if (text.length < 50) {
                console.warn('[ocr] PDF text too sparse. Falling back to raster OCR...');
                return await extractRasterMetadata(page, pdfjsLib);
            }

            const metadata = parseMetadata(text);
            return { ...metadata, rawText: text, confidence: 100, language: 'Unknown' };
        } catch (err) {
            console.error('[ocr] PDF extraction failed:', err);
            return createDefaultMetadata();
        }
    }

    // 2. Handle Image OCR (Tesseract - multilingual)
    if (!file.type.startsWith('image/')) {
        console.warn('[ocr] Skipping OCR for unsupported file type:', file.type || 'unknown');
        return createDefaultMetadata();
    }

    const objectUrl = URL.createObjectURL(file);

    try {
        // SINGLE PASS OPTIMIZATION (WBS 14.5 Mobile)
        // Tesseract.js automatically caches worker and langs in IndexedDB.
        // As long as it's run once while online, it works offline.
        const worker = await createWorker('eng+fil', 1, {
            logger: (m: any) => console.log(m),
            errorHandler: (err: any) => console.error('[ocr] Tesseract Worker Error:', err)
        });

        try {
            // OPTIMIZATION: Manual thresholding for low-end mobile CPUs
            const { data: { text, confidence } } = await worker.recognize(objectUrl);

            // Post-process language detection from result
            const language = detectLanguage(text);
            const metadata = parseMetadata(text);

            console.log(`[ocr] Optimized single-pass OCR results (Language: ${language}, Confidence: ${confidence}%)`);
            return { ...metadata, confidence, language };
        } finally {
            await worker.terminate();
        }
    } catch (err) {
        console.error('[ocr] Optimized Image OCR failed:', err);
        return createDefaultMetadata();
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function createDefaultMetadata(): DocMetadata {
    return {
        docType: 'Unknown',
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
        dateRange: null,
        weekSource: 'none'
    };
}

async function extractRasterMetadata(page: any, pdfjsLib: any): Promise<DocMetadata> {
    try {
        console.log('[ocr] Starting raster OCR fallback...');

        // Detect mobile to use a lower scale if needed
        // Low-End Mobile Optimization: Force 1.0x scale for mobile to save CPU/RAM
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const scale = isMobile ? 1.0 : 2.5;

        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not get canvas context');

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport }).promise;

        // ADAPTIVE PRE-PROCESSING: Convert to Grayscale + Threshold for low-end CPUs
        // This makes Tesseract's job MUCH easier and faster
        if (isMobile) {
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                // Thresholding: Black or White only (Binary)
                const val = avg > 128 ? 255 : 0;
                data[i] = data[i + 1] = data[i + 2] = val;
                data[i + 3] = 255; // Ensure alpha is solid
            }
            context.putImageData(imageData, 0, 0);
        }

        return new Promise<DocMetadata>((resolve, reject) => {
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    reject(new Error('Canvas toBlob failed'));
                    return;
                }
                const blobUrl = URL.createObjectURL(blob);
                const { createWorker } = await import('tesseract.js');
                const worker = await createWorker('eng+fil');
                
                try {
                    const { data: { text, confidence } } = await worker.recognize(blobUrl);
                    console.log(`[ocr] Raster OCR complete (${text.length} chars), scale: ${scale}, confidence:`, confidence);
                    const metadata = parseMetadata(text);
                    resolve({ ...metadata, rawText: text, confidence, language: detectLanguage(text) });
                } catch (e) {
                    reject(e);
                } finally {
                    await worker.terminate();
                    URL.revokeObjectURL(blobUrl);
                }
            }, 'image/png');
        });
    } catch (err) {
        console.error('[ocr] Raster fallback failed:', err);
        return createDefaultMetadata();
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

export function parseMetadata(text: string): Omit<DocMetadata, 'confidence' | 'language'> {
    const upper = text.toUpperCase();

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
            console.log(`[ocr] Fuzzy matched doc type as ${docType} (confidence: ${fuzzyDt.confidence}%)`);
        }
    }

    // For ISP/ISR documents, skip subject/grade/week detection — they are supervisory docs
    let subject: string | null = null;
    let subjectConfidence = 0;
    let gradeLevel: string | null = null;
    let weekNumber: number | null = null;
    let weekSource: 'calendar' | 'header-date' | 'regex' | 'none' = 'none';

    if (docType === 'DLL') {
        // --- PRIORITY SUBJECT DETECTION ---
        const explicitSubjectMatch = upper.match(/(?:ASIGNATURA|SUBJECT|LEARNING\s*AREA(?:\s*[\/]\s*ASIGNATURA)?)\s*[:\t]*\s*([^\n\t|]{3,20})/i);
        if (explicitSubjectMatch) {
            const candidate = explicitSubjectMatch[1].trim();
            const subjectPatterns = buildSubjectPatterns(true);

            for (const p of subjectPatterns) {
                if (p.regex.test(candidate)) {
                    subject = p.name;
                    subjectConfidence = 100;
                    break;
                }
            }
        }

        if (!subject) {
            const fuzzy = predictSubject(text);
            subject = fuzzy.value;
            subjectConfidence = fuzzy.confidence;
            if (subject) console.log(`[ocr] Fuzzy matched subject as ${subject} (confidence: ${fuzzy.confidence}%)`);
        }

        if (!subject) {
            const subjectPatterns = buildSubjectPatterns(false);

            for (const p of subjectPatterns) {
                if (p.regex.test(upper)) {
                    subject = p.name;
                    break;
                }
            }
        }

        // Detect Grade/Level
        const gradeMatch = upper.match(/(?:GRADE|GR\.?|BAITANG|ANTAS)\s*[/]?\s*(?:LEVEL|ANTAS)?\s*[:\t]*\s*([IVX1-9]+)/i);
        gradeLevel = gradeMatch ? gradeMatch[1].trim() : null;
        if (gradeLevel && isNaN(parseInt(gradeLevel))) {
            gradeLevel = romanToNum(gradeLevel);
        }

        if (!gradeLevel) {
            const fuzzy = predictGradeLevel(text);
            if (fuzzy.value) {
                gradeLevel = fuzzy.value;
                console.log(`[ocr] Fuzzy matched grade as ${gradeLevel} (confidence: ${fuzzy.confidence}%)`);
            }
        }

        // Extract week number
        const weekMatch = upper.match(/(?:WEEK|LINGGO)\s*[#:]*\s*(\d+)/i) ||
            upper.match(/IKA-\s*(\d+)\s*LINGGO/i);
        weekNumber = weekMatch ? parseInt(weekMatch[1], 10) : null;
        weekSource = weekNumber ? 'regex' : 'none';
    }

    // Extract school year
    const syMatch = text.match(/S\.?Y\.?\s*(\d{4}\s*[-–]\s*\d{4})/i) ||
        text.match(/(\d{4}\s*[-–]\s*\d{4})/);
    const schoolYear = syMatch ? syMatch[1].replace(/\s/g, '') : null;

    // Extract school name (Filipino: Paaralan, English: School)
    const schoolMatch = text.match(/(?:SCHOOL|PAARALAN)\s*[:\t]*\s*([^\n\t|]+)/i);
    const school = schoolMatch ? schoolMatch[1].trim() : null;

    // Extract teacher name (Filipino: Guro, English: Teacher)
    const teacherMatch = text.match(/(?:TEACHER|GURO|EDUCATOR)\s*[:\t]*\s*([^\n\t|]+)/i);
    const teacher = teacherMatch ? teacherMatch[1].trim() : null;

    // Extract date string (Filipino: Petsa, English: Date)
    const dateMatch = text.match(/(?:Teaching\s*Dates?(?:\s*and\s*Time)?|DATE|PETSA(?:\s*(?:at|[/|])\s*(?:ORAS|DATE))?(?:\s*ng\s*Pagtuturo)?)\s*[:\t\-\s]*\s*([^\n\t|]{5,})/i);
    const date = dateMatch ? dateMatch[1].trim() : null;

    // Tier 0: Parse date range from header for calendar-based resolution
    const dateRange = parseDateRange(text);
    if (dateRange && !weekNumber) {
        weekSource = 'header-date';
        console.log(`[ocr] Parsed date range: ${dateRange.start.toDateString()} - ${dateRange.end.toDateString()}`);
    }

    console.log('[ocr] Extracted date raw:', dateMatch ? dateMatch[0] : 'NONE');
    console.log('[ocr] Week detection source:', weekSource);

    return {
        docType,
        weekNumber,
        schoolYear,
        subject,
        subjectConfidence,
        gradeLevel,
        rawText: text,
        school,
        teacher,
        date,
        dateRange,
        weekSource
    };
}

/**
 * Build subject regex patterns (shared between header regex and full-text fallback).
 */
function buildSubjectPatterns(_forHeader: boolean): { name: string; regex: RegExp }[] {
    return [
        { name: 'Makabansa', regex: /MAKABANSA/i },
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

// ─── Date Range Parsing ─────────────────────────────────────────────────────

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
                console.log(`[ocr] Date range matched calendar Week ${week.week_number} (deadline: ${week.deadline_date})`);
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
        console.log(`[ocr] Date range closest-matched to calendar Week ${closest.weekNumber} (${Math.round(closest.distance / 86400000)}d distance to deadline)`);
        return { weekNumber: closest.weekNumber, calendarId: closest.calendarId };
    }

    return null;
}
