/**
 * Fuzzy String Matching Classifier — replaces Naive Bayes for header extraction
 *
 * Uses Dice coefficient (bigram overlap) for fuzzy matching against known values.
 * No training needed, zero model files, handles OCR typos naturally.
 */

// ─── Dice Coefficient ──────────────────────────────────────────────────────

function diceCoefficient(a: string, b: string): number {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < a.length - 1; i++) {
        const bg = a.substring(i, i + 2);
        bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
    }
    let intersection = 0;
    for (let i = 0; i < b.length - 1; i++) {
        const bg = b.substring(i, i + 2);
        const count = bigrams.get(bg) || 0;
        if (count > 0) {
            bigrams.set(bg, count - 1);
            intersection++;
        }
    }
    const total = a.length + b.length - 2;
    return total === 0 ? 0 : (2 * intersection) / total;
}

function normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// ─── Reference Lists ────────────────────────────────────────────────────────

const SUBJECTS = [
    'GMRC', 'Mathematics', 'Math', 'Filipino', 'MAPEH', 'English',
    'Science', 'Makabansa', 'AP', 'EPP', 'Language',
    'Reading and Literacy', 'Numeracy', 'Arts and Music',
    'Physical Development', 'Language Literacy and Communication',
    'TLE'
];

const GRADE_LEVELS: string[] = [];
for (let g = 1; g <= 6; g++) {
    GRADE_LEVELS.push(`Grade ${g}`);
}

const DOC_TYPES = ['DLL', 'ISP', 'ISR'];

const FIELD_LABELS = [
    'Learning Area', 'Asignatura', 'Subject',
    'Grade Level', 'Baitang', 'Grade',
    'Term', 'Week', 'Linggo',
    'Teacher', 'Guro',
    'School', 'Paaralan',
    'Date', 'Petsa'
];

// ─── Matching ───────────────────────────────────────────────────────────────

function bestMatch(input: string, candidates: string[], threshold: number = 0.3): { value: string | null; score: number } {
    const norm = normalize(input);
    if (!norm) return { value: null, score: 0 };

    let best: string | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
        const score = diceCoefficient(norm, normalize(candidate));
        if (score > bestScore) {
            bestScore = score;
            best = candidate;
        }
    }

    return {
        value: bestScore >= threshold ? best : null,
        score: Math.round(bestScore * 100)
    };
}

function fuzzyMatchAny(input: string, candidates: string[]): { value: string | null; score: number } {
    const norm = normalize(input);
    if (!norm) return { value: null, score: 0 };

    // Try to find the candidate as a substring first (exact match for short strings like "GMRC 1")
    for (const candidate of candidates) {
        if (norm.includes(normalize(candidate))) {
            return { value: candidate, score: 100 };
        }
    }

    // Otherwise fuzzy match the whole input against each candidate
    let best: string | null = null;
    let bestScore = 0;
    for (const candidate of candidates) {
        const score = diceCoefficient(norm, normalize(candidate));
        if (score > bestScore) {
            bestScore = score;
            best = candidate;
        }
    }

    return {
        value: bestScore >= 0.25 ? best : null,
        score: Math.round(bestScore * 100)
    };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface FuzzyPrediction {
    value: string | null;
    confidence: number;
}

export function predictSubject(text: string): FuzzyPrediction {
    // Priority 1: Look for explicit header field value (after "Asignatura:" or "Learning Area:")
    const header = text.match(/(?:ASIGNATURA|SUBJECT|LEARNING\s*AREA(?:\s*[\/]\s*ASIGNATURA)?)\s*[:\t]*\s*([^\n\t|]{3,30})/i);
    if (header) {
        const candidate = header[1].trim();
        // Extract the subject name (it's usually the first token before any number)
        const firstWord = candidate.split(/[\s,]+/)[0];
        const result = fuzzyMatchAny(firstWord, SUBJECTS);
        if (result.value) return { value: result.value, confidence: result.score };
    }

    // Try 2: scan the entire text for a known subject
    const result = fuzzyMatchAny(text, SUBJECTS);
    return result.value
        ? { value: result.value, confidence: result.score }
        : { value: null, confidence: 0 };
}

export function predictGradeLevel(text: string): FuzzyPrediction {
    // Try 1: explicit "Grade Level / Baitang" field
    const gradeField = text.match(/(?:GRADE\s*(?:LEVEL)?|BAITANG)\s*[:\t]*\s*(\d+|[IVX]+)/i);
    if (gradeField) {
        const num = parseInt(gradeField[1]);
        if (num >= 1 && num <= 6) return { value: `Grade ${num}`, confidence: 100 };
    }

    // Try 2: "GRADE X" pattern anywhere
    const gradeAnywhere = text.match(/\bGRADE\s*(\d+)\b/i);
    if (gradeAnywhere) {
        const num = parseInt(gradeAnywhere[1]);
        if (num >= 1 && num <= 6) return { value: `Grade ${num}`, confidence: 100 };
    }

    // Try 3: fuzzy match
    const result = fuzzyMatchAny(text, GRADE_LEVELS);
    return result.value
        ? { value: result.value, confidence: result.score }
        : { value: null, confidence: 0 };
}

export function predictDocType(text: string): FuzzyPrediction {
    const upper = text.toUpperCase();

    // Deterministic regex patterns (exact matches)
    if (/DAILY\s*LESSON\s*(LOG|PLAN)|D\.?L\.?L\.?|DETALYADONG\s*PLANO|ARAW-ARAW\s*LEKSYON|LINGGUHANG\s*ARALIN|BANGHAY\s*ARALIN|MATATAG/i.test(upper)) {
        return { value: 'DLL', confidence: 100 };
    }
    if (/INSTRUCTIONAL\s*SUPERVISORY\s*PLAN|I\.?S\.?P\.?|SUPERVISORY\s*PLAN/i.test(upper)) {
        return { value: 'ISP', confidence: 100 };
    }
    if (/INSTRUCTIONAL\s*SUPERVISORY\s*REPORT|I\.?S\.?R\.?|SUPERVISORY\s*REPORT/i.test(upper)) {
        return { value: 'ISR', confidence: 100 };
    }

    // Fallback: fuzzy on known patterns
    const result = fuzzyMatchAny(text, DOC_TYPES);
    return result.value
        ? { value: result.value, confidence: result.score }
        : { value: null, confidence: 0 };
}

/**
 * Fuzzy match a field label in OCR text to extract the value that follows it.
 * Handles OCR typos like "Le@rning Ar3a" matching "Learning Area".
 */
export function extractFieldValue(text: string, fieldName: string): string | null {
    const norm = normalize(fieldName);

    // Try each line of the text
    const lines = text.split('\n');
    let bestLine: string | null = null;
    let bestScore = 0;

    for (const line of lines) {
        // Check if the line starts with the field label
        const colonIdx = line.indexOf(':');
        if (colonIdx < 0) continue;

        const labelPart = line.substring(0, colonIdx).trim();
        const valuePart = line.substring(colonIdx + 1).trim();

        const score = diceCoefficient(normalize(labelPart), norm);
        if (score > bestScore) {
            bestScore = score;
            bestLine = valuePart;
        }
    }

    return bestScore >= 0.4 ? bestLine : null;
}