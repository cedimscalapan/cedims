import { correctLabelWords, editDistance, predictGradeValue, predictSubjectValues, predictTitleSubject } from './fuzzyClassifier';

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

/** A misspelled Kindergarten name reads as one area, not as its separate words. */
function closestKindergartenArea(value: string): string | null {
    const written = value.toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (written.length < 12) return null;
    const names = ['LITERACY LANGUAGE AND COMMUNICATION', 'LANGUAGE LITERACY AND COMMUNICATION', 'SOCIO EMOTIONAL DEVELOPMENT', 'VALUES DEVELOPMENT',
        'PHYSICAL HEALTH AND MOTOR DEVELOPMENT', 'AESTHETIC CREATIVE DEVELOPMENT', 'AESTHETIC AND CREATIVE DEVELOPMENT', 'COGNITIVE DEVELOPMENT'];
    const close = names.find(name => editDistance(written, name) <= 3);
    return close ? kindergartenLearningArea(close) : null;
}

const labels = {
    subject: ['Learning Area', 'Learning Areas', 'Learning Area/s', 'Subject', 'Subject Area', 'Asignatura'],
    grade: ['Grade Level and Section', 'Grade Level & Section', 'Grade Level', 'Baitang at Seksyon', 'Baitang at Seksiyon', 'Baitang', 'Grade']
};
const labelWords = ['LEARNING', 'AREA', 'SUBJECT', 'ASIGNATURA', 'GRADE', 'LEVEL', 'SECTION', 'BAITANG', 'SEKSYON', 'SEKSIYON', 'PANGKAT', 'ANTAS'];
// "Subject Matter" is the lesson topic and "Grade Level Coordinator" is a person; neither is a value.
const labelPattern = /\b(?:LEARNING\s+AREA(?:S|\s*\/\s*S)?|SUBJECT(?:\s+AREA)?(?!\s+(?:MATTER|TEACHER|COORDINATOR|GROUP))|ASIGNATURA(?:NG)?|(?:GRADE(?:\s+LEVEL)?|GR\.?|YEAR|YR\.?)(?:\s*(?:(?:AND|&|\/)\s*)?SEC(?:TION|\.)?)?(?!\s+(?:COORDINATOR|CHAIR|HEAD|TEACHER|ADVISER))|BAITANG(?:\s*(?:AT|&|\/)\s*(?:SEKS(?:YON|IYON)|PANGKAT))?|ANTAS)(?=\b|[1-6]\b|[IV]+\b)/gi;
// Fields sharing a line: "Learning Area: Math  Teacher: Juan".
const nextField = /\b(?:TEACHER|GURO|SCHOOL|PAARALAN|DATES?|PETSA|TERM|TERMINO|TRIMESTER|QUARTER|MARKAHAN|WEEK|LINGGO|TIME|ORAS)\b/i;
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
    const body = lines.findIndex(line => /^\s*(?:(?:[A-Z]|[IVX]+|\d+)[.)]\s*|[IVX]+\s+)?(?:(?:MGA\s+)?LAYUNIN|OBJECTIVES|CONTENT\s+STANDARD|PAMANTAYAN|PROCEDURES|PAMAMARAAN|NILALAMAN)\b/i.test(line));
    text = correctLabelWords(lines.slice(0, body >= 0 ? Math.min(body, 40) : 40).join('\n'), labelWords);
    const values: { kind: 'subject' | 'grade'; value: string; rank?: number }[] = [];
    const matches = [...text.matchAll(labelPattern)];
    let pendingGradeRank = 0;
    const fieldValue = (value: string) => value.replace(/^[\s.:#/|()*_=\-\u2022\u2013\u2014]+/, '')
        .replace(/^(?:AND|AT)\s*\r?\n\s*/i, '').trimStart().split(/\r?\n/)[0]?.trim() || '';
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const remainder = text.slice(match.index! + match[0].length, matches[i + 1]?.index);
        const value = fieldValue(remainder);
        const kind = /LEARNING|ASIGNATURA|SUBJECT/i.test(match[0]) ? 'subject' : 'grade';
        const rank = /LEVEL|SECTION|SEKS/i.test(match[0]) ? 2 : 1;
        if (!value) { pendingGradeRank = kind === 'grade' ? Math.max(pendingGradeRank, rank) : 0; continue; }
        values.push({kind, value, rank:kind === 'grade' ? Math.max(rank,pendingGradeRank) : rank});
        pendingGradeRank = 0;
    }
    // "Sixth Grade", "6th Grade", "Ikaanim na Baitang", "Ika-6 na Baitang".
    for (const match of text.matchAll(/\b(\d(?:ST|ND|RD|TH)|FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|IKA[- ]?[A-Z0-9]+|UNANG?|PANG[A-Z-]+|PANLIMANG?|PANANIM)[ \t]+(?:NA[ \t]+)?(?:GRADE|BAITANG)\b/gi)) {
        if (predictGradeValue(match[1]).value) values.push({ kind: 'grade', value: match[1], rank: 2 });
    }
    // "G6" or "G-6", which only ever means a grade in a form header.
    for (const match of text.matchAll(/\bG\s?-?\s?([1-6])\b/gi)) values.push({ kind: 'grade', value: match[1], rank: 1 });
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
            const written = field.value.split(nextField)[0];
            const kinderArea = kindergartenLearningArea(written) || closestKindergartenArea(written);
            if (kinderArea) subjects.set(kinderArea, 100);
            for (const part of kinderArea ? [] : written.split(/[,;/+]/)) {
                for (const prediction of predictSubjectValues(part.slice(0, 80))) {
                    if (prediction.value) subjects.set(prediction.value, prediction.confidence);
                }
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
    // No labeled subject: accept a title line made only of a subject and grade.
    const titles = subjects.size ? [] : text.split('\n').slice(0, 15).map(predictTitleSubject).filter(title => !!title);
    for (const title of titles) subjects.set(title!.subject, 85);
    if (!grades.size) {
        const titleGrades = new Set(titles.map(title => title!.grade).filter(Boolean));
        if (titleGrades.size === 1) grades.add([...titleGrades][0]);
        else if (!titleGrades.size && /\bKINDER(?:GARTEN)?\b/i.test(text)) grades.add('Kinder');
    }
    return {
        subject: subjects.size === 1 ? [...subjects.keys()][0] : null,
        subjectConfidence: subjects.size === 1 ? [...subjects.values()][0] : 0,
        subjectCandidates: [...subjects.keys()],
        grade: grades.size === 1 ? [...grades][0] : '',
    };
}

/** The subject a file name states once its period, day and document words are removed. */
export function extractFileNameFields(fileName: string) {
    const name = fileName.replace(/\.pdf$/i, '').replace(/\(\d+\)/g, ' ').replace(/[_.]+/g, ' ')
        .replace(/\b(?:WEEK|WK|W|TERM|T|QUARTER|Q|MARKAHAN|LINGGO|DAY|ARAW)\s*-?\s*\d{1,2}\b/gi, ' ')
        .replace(/\b(?:DLL|DLP|DRAFT|FINAL|COPY|SCAN(?:NED)?|REVISED)\b/gi, ' ');
    const candidates = [...new Set(predictSubjectValues(name).map(prediction => prediction.value).filter((value): value is string => !!value))];
    const title = predictTitleSubject(name);
    return { subject: candidates.length === 1 ? candidates[0] : null, grade: title?.grade || '' };
}
