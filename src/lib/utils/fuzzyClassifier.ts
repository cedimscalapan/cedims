/**
 * Fuzzy String Matching Classifier — replaces Naive Bayes for header extraction
 *
 * Uses Dice coefficient (bigram overlap) for fuzzy matching against known values.
 * No training needed, zero model files, handles OCR typos naturally.
 */

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

/** Letters OCR commonly swaps, so "Terrn" compares as "Term" and "Le@rning" as "Learning". */
function ocrForm(word: string): string {
    return word.toUpperCase().replace(/RN/g, 'M').replace(/VV/g, 'W').replace(/@|4/g, 'A').replace(/0/g, 'O')
        .replace(/1/g, 'I').replace(/3/g, 'E').replace(/5/g, 'S');
}

/** Edit distance that counts a swap of two neighbouring letters as one mistake. */
export function editDistance(a: string, b: string): number {
    const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) rows[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
        }
    }
    return rows[a.length][b.length];
}

function allowedMistakes(length: number): number {
    return length >= 12 ? 3 : length >= 7 ? 2 : 1;
}

/** Real words one letter from a label. Without this, "Grace V. Santos" would read as Grade 5. */
const NOT_LABELS = new Set(['GRACE', 'GRAPE', 'TEAM', 'WEAK', 'WEEP', 'LEVER', 'LEVEE', 'ARENA', 'LINES', 'TERN', 'LINGA']);

/** Replaces misspelled label words with the correct word. Values are left alone. */
export function correctLabelWords(text: string, vocabulary: string[]): string {
    const known = new Set(vocabulary);
    return text.replace(/[A-Za-z@][A-Za-z@01345]+[A-Za-z]/g, (word) => {
        const upper = word.toUpperCase();
        if (known.has(upper) || NOT_LABELS.has(upper)) return word;
        const form = ocrForm(word);
        let best = '';
        let bestDistance = Infinity;
        for (const target of vocabulary) {
            // "BaitangV" and "Grade5" are a correct label with its value attached.
            if (upper.startsWith(target) && /^(?:I{1,3}|IV|VI{0,3}|IX|X|\d+)$/.test(upper.slice(target.length))) return word;
            // A wrong first letter is rarely a typo of the same word.
            if (upper[0] !== target[0] && form[0] !== target[0]) continue;
            if (Math.abs(form.length - target.length) > 2 && Math.abs(upper.length - target.length) > 2) continue;
            // Compared both ways because some words really do contain "rn", such as "Lerning".
            const distance = Math.min(editDistance(form, target), editDistance(upper, target));
            if (distance <= allowedMistakes(target.length) && distance < bestDistance) {
                best = target;
                bestDistance = distance;
            }
        }
        return best || word;
    });
}

const NUMBER_WORDS: Record<string, number> = {};
[
    ['one', 'first', '1st', 'isa', 'una', 'ikaisa'],
    ['two', 'second', '2nd', 'dalawa', 'ikalawa', 'pangalawa', 'ikadalawa'],
    ['three', 'third', '3rd', 'tatlo', 'ikatlo', 'pangatlo', 'ikatatlo'],
    ['four', 'fourth', '4th', 'apat', 'ikaapat', 'pangapat'],
    ['five', 'fifth', '5th', 'lima', 'ikalima', 'panlima'],
    ['six', 'sixth', '6th', 'anim', 'ikaanim', 'pananim'],
    ['seven', 'seventh', '7th', 'pito', 'ikapito'],
    ['eight', 'eighth', '8th', 'walo', 'ikawalo'],
    ['nine', 'ninth', '9th', 'siyam', 'ikasiyam'],
    ['ten', 'tenth', '10th', 'sampu', 'ikasampu'],
    ['eleven', 'eleventh', '11th', 'labingisa', 'ikalabingisa'],
    ['twelve', 'twelfth', '12th', 'labindalawa', 'ikalabindalawa'],
    ['thirteen', 'thirteenth', '13th', 'labintatlo', 'ikalabintatlo'],
].forEach((words, index) => words.forEach((word) => { NUMBER_WORDS[word] = index + 1; }));
const ROMAN: Record<string, number> = { i: 1, l: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13 };

/** Reads 7, VII, seven, seventh, 7th, pito, ikapito, ikapitong, ika-7 or ika 7 as a number. */
export function wordNumber(token: string): number | null {
    const word = token.toLowerCase().replace(/[-\s]/g, '').replace(/[.:,]+$/, '');
    if (/^\d{1,2}$/.test(word)) return Number(word);
    const ika = word.match(/^ika(\d{1,2})(?:ng)?$/);
    if (ika) return Number(ika[1]);
    if (ROMAN[word]) return ROMAN[word];
    return NUMBER_WORDS[word] ?? NUMBER_WORDS[word.replace(/ng$/, '')] ?? null;
}

/** Ordinal forms only. "Seven Term" is not a term number, while "Second Term" is. */
export function isOrdinalWord(token: string): boolean {
    const word = token.toLowerCase().replace(/[-\s]/g, '');
    return /^(?:\d{1,2}(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|ika.+|pang.+|pan(?:lima|anim)g?|unang?)$/.test(word)
        && wordNumber(token) !== null;
}

/** Every way a subject is written, in English, Tagalog and common shorthand. */
const SUBJECT_NAMES: [string, string[]][] = [
    ['Mathematics', ['mathematics', 'mathematic', 'maths', 'math', 'matematika', 'matematik']],
    ['Science', ['science', 'sci', 'agham', 'siyensya', 'syensya']],
    ['English', ['english', 'eng', 'engl', 'ingles']],
    ['Filipino', ['filipino', 'fil', 'pilipino', 'wikang filipino']],
    ['AP', ['ap', 'araling panlipunan', 'aral pan', 'aralpan', 'social studies', 'sibika']],
    ['GMRC', ['gmrc', 'good manners and right conduct', 'edukasyon sa pagpapakatao', 'pagpapakatao', 'esp', 'values education', 'kagandahang asal', 'wastong pag uugali']],
    ['MAPEH', ['mapeh', 'music', 'arts', 'pe', 'physical education', 'health', 'musika', 'sining', 'kalusugan', 'edukasyong pangkatawan']],
    ['Arts and Music', ['arts and music']],
    ['HGP', ['hgp', 'homeroom guidance program', 'homeroom guidance', 'homeroom', 'patnubay', 'patnubay sa silid', 'patnubay sa silid aralan']],
    ['EPP/TLE', ['epp', 'tle', 'edukasyong pantahanan at pangkabuhayan', 'technology and livelihood education']],
    ['Makabansa', ['makabansa']],
    ['Language', ['language', 'wika']],
    ['Reading and Literacy', ['reading and literacy', 'reading', 'pagbasa', 'pagbasa at literasi', 'literasi']],
    ['Numeracy', ['numeracy']],
    ['Physical Development', ['physical development']],
    ['Literacy, Language, and Communication', ['literacy language and communication', 'language literacy and communication']],
    ['Socio-Emotional Development', ['socio emotional development']],
    ['Values Development', ['values development']],
    ['Physical Health and Motor Development', ['physical health and motor development']],
    ['Aesthetic/Creative Development', ['aesthetic creative development', 'aesthetic and creative development']],
    ['Cognitive Development', ['cognitive development']],
];
const SUBJECT_ALIASES = SUBJECT_NAMES
    .flatMap(([subject, names]) => names.map((name) => ({ subject, tokens: name.split(' '), name })))
    .sort((a, b) => b.tokens.length - a.tokens.length || b.name.length - a.name.length);

function subjectTokens(value: string): string[] {
    return value.toLowerCase().replace(/&/g, ' and ').replace(/\.(?=\S|$)/g, '')
        .replace(/([a-z])(\d)/g, '$1 $2').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

function takeExactSubjects(tokens: string[], used: boolean[]): string[] {
    const found: string[] = [];
    for (const alias of SUBJECT_ALIASES) {
        for (let start = 0; start + alias.tokens.length <= tokens.length; start++) {
            const range = alias.tokens.map((_, offset) => start + offset);
            if (range.some((index) => used[index] || tokens[index] !== alias.tokens[index - start])) continue;
            range.forEach((index) => { used[index] = true; });
            found.push(alias.subject);
        }
    }
    return found;
}

const SUBJECT_FILLER = new Set(['and', 'at', 'of', 'the', 'in', 'sa', 'ng', 'for', 'grade', 'level', 'baitang', 'section', 'lesson', 'log', 'plan', 'daily', 'weekly']);

/** Subjects named in a labeled field. The label makes a misspelled value safe to accept. */
export function predictSubjectValues(value: string): FuzzyPrediction[] {
    const tokens = subjectTokens(value);
    const used = tokens.map(() => false);
    const results = takeExactSubjects(tokens, used).map((subject) => ({ value: subject, confidence: 100 }));
    for (let start = 0; start < tokens.length; start++) {
        if (used[start] || SUBJECT_FILLER.has(tokens[start]) || /^\d/.test(tokens[start])) continue;
        let best: { subject: string; size: number; distance: number } | null = null;
        for (const alias of SUBJECT_ALIASES) {
            const size = alias.tokens.length;
            // Short names such as "AP" or "Math" are too close to ordinary words to guess at.
            if (alias.name.length < 5 || start + size > tokens.length) continue;
            const window = tokens.slice(start, start + size);
            if (window.some((_, offset) => used[start + offset])) continue;
            const written = window.join(' ');
            if (written[0] !== alias.name[0]) continue;
            const distance = editDistance(written, alias.name);
            if (distance > allowedMistakes(alias.name.length)) continue;
            if (!best || distance < best.distance || (distance === best.distance && size > best.size)) best = { subject: alias.subject, size, distance };
        }
        if (!best) continue;
        for (let offset = 0; offset < best.size; offset++) used[start + offset] = true;
        results.push({ value: best.subject, confidence: 80 });
    }
    return results;
}

const TITLE_WORDS = /^(?:daily|weekly|detailed|lesson|log|plan|dll|dlp|banghay|aralin|matatag|grade|baitang|level|in|sa|for|ng|of|the|g|gr)$/;
const GRADE_TOKEN = /^(?:[1-6]|i|ii|iii|iv|v|vi)$/;

/**
 * An unlabeled title such as "MATH 6" or "BANGHAY ARALIN SA FILIPINO 3". Every word must
 * be accounted for, so a lesson line like "Mathematics Grade 5 exercises" never qualifies.
 */
export function predictTitleSubject(line: string): { subject: string; grade: string } | null {
    const tokens = subjectTokens(line);
    const used = tokens.map(() => false);
    const subjects = [...new Set(takeExactSubjects(tokens, used))];
    if (subjects.length !== 1) return null;
    const rest = tokens.filter((_, index) => !used[index]);
    if (rest.some((token) => !TITLE_WORDS.test(token) && !GRADE_TOKEN.test(token))) return null;
    const grades = [...new Set(rest.filter((token) => GRADE_TOKEN.test(token)))];
    return { subject: subjects[0], grade: grades.length === 1 ? String(wordNumber(grades[0])) : '' };
}

const SUBJECTS = [
    'GMRC', 'HGP', 'Homeroom Guidance', 'Homeroom Guidance Program', 'Mathematics', 'Math', 'Filipino', 'MAPEH', 'English',
    'Science', 'Makabansa', 'AP', 'EPP', 'Language',
    'Reading and Literacy', 'Numeracy', 'Arts and Music',
    'Physical Development', 'Language Literacy and Communication',
    'Literacy, Language, and Communication', 'Socio-Emotional Development',
    'Values Development', 'Physical Health and Motor Development',
    'Aesthetic/Creative Development', 'Cognitive Development',
    'TLE'
];

const DOC_TITLES: [string, string][] = [
    ['DAILY LESSON LOG', 'DLL'], ['DAILY LESSON PLAN', 'DLL'], ['WEEKLY LESSON LOG', 'DLL'], ['DETAILED LESSON PLAN', 'DLL'],
    ['BANGHAY ARALIN', 'DLL'], ['INSTRUCTIONAL SUPERVISORY PLAN', 'ISP'], ['INSTRUCTIONAL SUPERVISORY REPORT', 'ISR'],
];

const TERMS = [
    'Term 1', 'Term 2', 'Term 3',
    '1st Term', '2nd Term', '3rd Term',
    'First Term', 'Second Term', 'Third Term',
    'Unang Term', 'Ikalawang Term', 'Ikatlong Term'
];

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

export interface FuzzyPrediction {
    value: string | null;
    confidence: number;
}

export function predictSubject(text: string): FuzzyPrediction {
    // Look for an explicit header field first, falling back to a fuzzy scan of the whole text.
    const header = text.match(/(?:ASIGNATURA|SUBJECT|LEARNING\s*AREA(?:\s*[\/]\s*ASIGNATURA)?)\s*[:\t]*\s*([^\n\t|]{3,30})/i);
    if (header) {
        const candidate = header[1].trim();
        // Extract the subject name (it's usually the first token before any number)
        const result = predictExplicitSubject(candidate);
        if (result.value) return result;
    }

    if (/\bH\.?G\.?P\.?\b|HOMEROOM\s+GUIDANCE(?:\s+PROGRAM)?/i.test(text)) {
        return { value: 'HGP', confidence: 100 };
    }

    // Use whole-word/phrase matches, longest first. Substring matching caused
    // short subjects such as "AP" to be found inside unrelated words (e.g. "KaPamana").
    const explicit = predictExplicitSubject(text);
    if (explicit.value) return explicit;

    // Fuzzy fallback is limited to short text fragments, avoiding a long OCR
    // page accidentally scoring as a subject based on a few shared letters.
    const fragments = text
        .split(/[\r\n|,;]+/)
        .flatMap((part) => {
            const words = part.trim().split(/\s+/).filter(Boolean);
            const windows: string[] = [];
            for (let start = 0; start < words.length; start++) {
                for (let size = 1; size <= 4 && start + size <= words.length; size++) {
                    const window = words.slice(start, start + size).join(' ');
                    // Short acronyms are matched explicitly above; fuzzy matching
                    // them against arbitrary words is too prone to false positives.
                    if (normalize(window).replace(/\s/g, '').length >= 4) windows.push(window);
                }
            }
            return windows;
        });
    let best: FuzzyPrediction = { value: null, confidence: 0 };
    for (const fragment of fragments) {
        const result = bestMatch(fragment, SUBJECTS, 0.72);
        if (result.value && result.score > best.confidence) {
            best = { value: result.value, confidence: result.score };
        }
    }
    return best;
}

function predictExplicitSubject(text: string): FuzzyPrediction {
    const matches = [...SUBJECTS]
        .sort((a, b) => b.length - a.length)
        .filter((subject) => {
            const escaped = subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
            return new RegExp(`(?:^|[^A-Z0-9])${escaped}(?:$|[^A-Z0-9])`, 'i').test(text);
        });
    if (!matches.length) return { value: null, confidence: 0 };
    const value = matches[0];
    if (value === 'Homeroom Guidance' || value === 'Homeroom Guidance Program') {
        return { value: 'HGP', confidence: 100 };
    }
    if (value === 'Math') return { value: 'Mathematics', confidence: 100 };
    return { value, confidence: 100 };
}

function romanToNumber(value: string): number | null {
    const roman = normalize(value).toUpperCase();
    const map: Record<string, number> = {
        I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6
    };
    return map[roman] || null;
}

function gradeFromToken(value: string): FuzzyPrediction {
    const raw = value.trim();
    const digit = raw.match(/\b([1-6])\b/);
    if (digit) return { value: `Grade ${digit[1]}`, confidence: 100 };

    const roman = raw.match(/\b(I|II|III|IV|V|VI)\b/i);
    if (roman) {
        const num = romanToNumber(roman[1]);
        if (num) return { value: `Grade ${num}`, confidence: 100 };
    }

    const words: Record<string, number> = {
        one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
        una: 1, isa: 1, dalawa: 2, ikalawa: 2, tatlo: 3, ikatlo: 3,
        apat: 4, ikaapat: 4, lima: 5, ikalima: 5, anim: 6, ikaanim: 6
    };
    const word = normalize(raw).split(' ').find(token => words[token]);
    return word ? { value: `Grade ${words[word]}`, confidence: 95 } : { value: null, confidence: 0 };
}

/** Read only the grade token at the start of a labeled grade value. */
export function predictGradeValue(value: string): FuzzyPrediction {
    const cleaned = value.replace(/^[\s.:#/|()*_=\[\]\-\u2022\u2013\u2014]+/, '')
        .replace(/^(?:GRADE(?:\s+LEVEL)?|BAITANG)\s*[:#-]?\s*/i, '');
    if (/^(?:KINDERGARTEN|KINDER|K)(?=$|[^A-Z0-9])/i.test(cleaned)) return { value: 'Kinder', confidence: 100 };
    const numeric = cleaned.match(/^([1-6])(?!\d|\.\d)/);
    if (numeric) return gradeFromToken(numeric[1]);
    const token = cleaned.match(/^(VI|IV|III|II|I|V|[1-6]|one|two|three|four|five|six|isa|dalawa|tatlo|apat|lima|anim)(?=$|[^A-Z0-9])/i);
    if (token) return gradeFromToken(token[1]);
    const ordinal = cleaned.match(/^(ika[- ]?[a-z0-9]+|pang?[a-z-]+|unang?|\d(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth)(?=$|[^A-Z0-9])/i);
    const number = ordinal && isOrdinalWord(ordinal[1]) ? wordNumber(ordinal[1]) : null;
    return number && number <= 6 ? { value: `Grade ${number}`, confidence: 95 } : { value: null, confidence: 0 };
}

export function predictGradeLevel(text: string): FuzzyPrediction {
    const lines = text.replace(/\r/g, '').split('\n');
    const stop = lines.findIndex(line => /^\s*(?:(?:[IVX]+|\d+)[.)]?\s*)?(?:OBJECTIVES|LAYUNIN|CONTENT\s+STANDARD|PAMANTAYAN|PROCEDURES|PAMAMARAAN)\b/i.test(line));
    const header = lines.slice(0, stop >= 0 ? Math.min(stop, 40) : 40).join('\n');
    const pattern = /\b(?:GRADE(?:\s+LEVEL)?(?:\s*(?:AND|&)\s*SECTION)?|BAITANG(?:\s*(?:AT|&)\s*SEKS(?:YON|IYON))?)(?=\b|[1-6]\b|[IV]+\b)/gi;
    const results: { grade: string; rank: number }[] = [];
    for (const label of header.matchAll(pattern)) {
        const prediction = predictGradeValue(header.slice(label.index! + label[0].length));
        if (prediction.value) results.push({ grade: prediction.value, rank: /LEVEL|SECTION|SEKS/i.test(label[0]) ? 2 : 1 });
    }
    const rank = Math.max(0, ...results.map(result => result.rank));
    const grades = new Set(results.filter(result => result.rank === rank).map(result => result.grade));
    return grades.size === 1 ? { value: [...grades][0], confidence: 100 } : { value: null, confidence: 0 };
}

export function predictDocType(text: string): FuzzyPrediction {
    const upper = text.toUpperCase();

    // Word boundaries matter: "DISPLAY" contains ISP and must not make a lesson plan an ISP.
    if (/DAILY\s*LESSON\s*(LOG|PLAN)|\bD\.?L\.?L\b|\bD\.?L\.?P\b|DETALYADONG\s*PLANO|ARAW-ARAW\s*LEKSYON|LINGGUHANG\s*ARALIN|BANGHAY\s*ARALIN|MATATAG/i.test(upper)) {
        return { value: 'DLL', confidence: 100 };
    }
    if (/INSTRUCTIONAL\s*SUPERVISORY\s*PLAN|\bI\.?S\.?P\b|SUPERVISORY\s*PLAN/i.test(upper)) {
        return { value: 'ISP', confidence: 100 };
    }
    if (/INSTRUCTIONAL\s*SUPERVISORY\s*REPORT|\bI\.?S\.?R\b|SUPERVISORY\s*REPORT/i.test(upper)) {
        return { value: 'ISR', confidence: 100 };
    }

    // Misspelled titles only, line by line, so a shared letter in the lesson text cannot decide.
    let best: FuzzyPrediction = { value: null, confidence: 0 };
    for (const line of upper.split(/\r?\n/).slice(0, 15)) {
        const written = normalize(line);
        if (written.length < 8 || written.length > 50) continue;
        for (const [title, doc] of DOC_TITLES) {
            const score = Math.round(diceCoefficient(written, normalize(title)) * 100);
            if (score >= 75 && score > best.confidence) best = { value: doc, confidence: score };
        }
    }
    return best;
}

export function predictTermNumber(text: string): { value: number | null; confidence: number } {
    const upper = text.toUpperCase();
    const explicit = upper.match(/\b(?:TERM|TRIMESTER|MARKAHAN)\s*(?:NO\.?|NUMBER|#|:)?\s*(1|2|3|I|II|III|FIRST|SECOND|THIRD|UNANG|IKALAWANG|IKATLONG)\b/i) ||
        upper.match(/\b(1ST|2ND|3RD|FIRST|SECOND|THIRD|UNANG|IKALAWANG|IKATLONG)\s*(?:TERM|TRIMESTER|MARKAHAN)\b/i);

    if (explicit) {
        const raw = normalize(explicit[1]);
        if (raw === '1' || raw === 'i' || raw === '1st' || raw === 'first' || raw === 'unang') return { value: 1, confidence: 100 };
        if (raw === '2' || raw === 'ii' || raw === '2nd' || raw === 'second' || raw === 'ikalawang') return { value: 2, confidence: 100 };
        if (raw === '3' || raw === 'iii' || raw === '3rd' || raw === 'third' || raw === 'ikatlong') return { value: 3, confidence: 100 };
    }

    const result = fuzzyMatchAny(text, TERMS);
    if (!result.value) return { value: null, confidence: 0 };
    if (/1|1st|first|unang/i.test(result.value)) return { value: 1, confidence: result.score };
    if (/2|2nd|second|ikalawang/i.test(result.value)) return { value: 2, confidence: result.score };
    if (/3|3rd|third|ikatlong/i.test(result.value)) return { value: 3, confidence: result.score };
    return { value: null, confidence: 0 };
}

/**
 * Fuzzy match a field label in OCR text to extract the value that follows it.
 * Handles OCR typos like "Le@rning Ar3a" matching "Learning Area".
 */
export function extractFieldValue(text: string, fieldName: string): string | null {
    const norm = normalize(fieldName);

    const lines = text.split('\n');
    let bestLine: string | null = null;
    let bestScore = 0;

    for (const line of lines) {
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
