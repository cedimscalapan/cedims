import { predictSubject, predictGradeValue } from './fuzzyClassifier';

/** Match full Kindergarten learning-area names before splitting list punctuation. */
export function kindergartenLearningArea(value: string | null | undefined): string | null {
    const normalized = String(value || '').toUpperCase().replace(/&/g, ' AND ')
        .replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    const areas: Record<string, string> = {
        'LITERACY LANGUAGE AND COMMUNICATION': 'Literacy, Language, and Communication',
        'LANGUAGE LITERACY AND COMMUNICATION': 'Literacy, Language, and Communication',
        'SOCIO EMOTIONAL DEVELOPMENT': 'Socio-Emotional Development',
        'VALUES DEVELOPMENT': 'Values Development',
        'PHYSICAL HEALTH AND MOTOR DEVELOPMENT': 'Physical Health and Motor Development',
        'AESTHETIC CREATIVE DEVELOPMENT': 'Aesthetic/Creative Development',
        'AESTHETIC AND CREATIVE DEVELOPMENT': 'Aesthetic/Creative Development',
        'COGNITIVE DEVELOPMENT': 'Cognitive Development',
    };
    return areas[normalized] || null;
}

const labels = {
    subject: ['Learning Area', 'Learning Areas', 'Learning Area/s', 'Asignatura'],
    grade: ['Grade Level and Section', 'Grade Level & Section', 'Grade Level', 'Baitang at Seksyon', 'Baitang at Seksiyon', 'Baitang', 'Grade']
};
const labelPattern = /\b(?:LEARNING\s+AREA(?:S|\s*\/\s*S)?|ASIGNATURA|GRADE(?:\s+LEVEL)?(?:\s*(?:(?:AND|&|\/)\s*)?SECTION)?|BAITANG(?:\s*(?:AT|&)\s*SEKS(?:YON|IYON))?)(?=\b|[1-6]\b|[IV]+\b)/gi;
function normalized(value: string) { return value.toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function similarity(a: string, b: string) {
    a = normalized(a); b = normalized(b);
    const pairs = new Map<string, number>();
    for (let i = 0; i < a.length - 1; i++) pairs.set(a.slice(i, i + 2), (pairs.get(a.slice(i, i + 2)) || 0) + 1);
    let shared = 0;
    for (let i = 0; i < b.length - 1; i++) { const pair = b.slice(i, i + 2); const count = pairs.get(pair) || 0; if (count) { shared++; pairs.set(pair, count - 1); } }
    return a.length + b.length > 2 ? 2 * shared / (a.length + b.length - 2) : 0;
}

/** Only values attached to these form fields may determine a teaching load. */
export function extractTeachingLoadFields(text: string) {
    const lines = text.replace(/\r/g, '').split('\n');
    const body = lines.findIndex(line => /^\s*(?:(?:[IVX]+|\d+)[.)]?\s*)?(?:OBJECTIVES|LAYUNIN|CONTENT\s+STANDARD|PAMANTAYAN|PROCEDURES|PAMAMARAAN)\b/i.test(line));
    text = lines.slice(0, body >= 0 ? Math.min(body, 40) : 40).join('\n');
    const values: { kind: 'subject' | 'grade'; value: string; rank?: number }[] = [];
    const matches = [...text.matchAll(labelPattern)];
    let pendingGradeRank = 0;
    const fieldValue = (value: string) => value.replace(/^[\s:#/|()*_=\-\u2022\u2013\u2014]+/, '')
        .replace(/^(?:AND|AT)\s*\r?\n\s*/i, '').trimStart().split(/\r?\n/)[0]?.trim() || '';
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const remainder = text.slice(match.index! + match[0].length, matches[i + 1]?.index);
        const value = fieldValue(remainder);
        const kind = /LEARNING|ASIGNATURA/i.test(match[0]) ? 'subject' : 'grade';
        const rank = /LEVEL|SECTION|SEKS/i.test(match[0]) ? 2 : 1;
        if (!value) { pendingGradeRank = kind === 'grade' ? Math.max(pendingGradeRank, rank) : 0; continue; }
        values.push({kind, value, rank:kind === 'grade' ? Math.max(rank,pendingGradeRank) : rank});
        pendingGradeRank = 0;
    }
    // Fuzzy matching is restricted to short field labels, never the lesson body.
    for (const line of text.split(/\r?\n/)) {
        const colon = line.indexOf(':');
        if (colon < 1 || colon > 45) continue;
        const label = line.slice(0, colon).trim();
        let best: { kind: 'subject' | 'grade'; score: number } | null = null;
        for (const kind of ['subject', 'grade'] as const) for (const known of labels[kind]) {
            const score = similarity(label, known);
            if (score >= 0.8 && (!best || score > best.score)) best = { kind, score };
        }
        if (best) values.push({ kind: best.kind, value: fieldValue(line.slice(colon + 1)), rank: /LEVEL|SECTION|SEKS/i.test(label) ? 2 : 1 });
    }
    const subjects = new Map<string, number>();
    const grades = new Set<string>();
    const gradeRank = Math.max(0, ...values.filter(field => field.kind === 'grade').map(field => field.rank || 1));
    for (const field of values) {
        if (field.kind === 'subject') {
            const kinderArea = kindergartenLearningArea(field.value);
            if (kinderArea) subjects.set(kinderArea, 100);
            for (const part of kinderArea ? [] : field.value.split(/[,;/+]/)) {
                const prediction = predictSubject(part.slice(0, 80).replace(/MATEMATIKA/gi, 'Mathematics').replace(/ARALING PANLIPUNAN/gi, 'AP'));
                if (prediction.value && prediction.confidence >= 75) subjects.set(prediction.value, prediction.confidence);
            }
        } else if ((field.rank || 1) === gradeRank) {
            const prediction = predictGradeValue(field.value);
            if (prediction.value) grades.add(prediction.value.replace(/^Grade\s*/i, ''));
        }
    }
    if (!subjects.size && grades.size === 1 && /^KINDER$/i.test([...grades][0])) {
        const headings = new Set(text.split('\n').map(line => kindergartenLearningArea(line)).filter((area): area is string => !!area));
        for (const area of headings) subjects.set(area, 100);
    }
    return {
        subject: subjects.size === 1 ? [...subjects.keys()][0] : null,
        subjectConfidence: subjects.size === 1 ? [...subjects.values()][0] : 0,
        subjectCandidates: [...subjects.keys()],
        grade: grades.size === 1 ? [...grades][0] : '',
    };
}
