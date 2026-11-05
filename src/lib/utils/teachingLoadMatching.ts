import { extractTeachingLoadFields, kindergartenLearningArea } from './teachingLoadFields';

export interface UploadLoad { id: string; subject: string; grade_level?: string | null; is_active?: boolean; }
export interface UploadMetadata { subject?: string | null; subjectConfidence?: number; gradeLevel?: string | null; rawText?: string; }

export function canonicalSubject(value: string | null | undefined): string {
    const kinderArea = kindergartenLearningArea(value);
    if (kinderArea) return kinderArea.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const text = String(value || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/\b(?:MATHEMATICS|MATH|MATEMATIKA)\b/.test(text)) return 'MATHEMATICS';
    if (/\bHGP\b|HOMEROOM GUIDANCE/.test(text)) return 'HGP';
    if (/\bGMRC\b|PAGPAPAKATAO|\bVALUES\b|\bESP\b/.test(text)) return 'GMRC';
    if (/^AP(?: |$)|ARALING PANLIPUNAN|SOCIAL STUDIES/.test(text)) return 'AP';
    return text;
}

export function loadGrade(value: string | null | undefined): string {
    const text = String(value || '').trim().replace(/^(?:GRADE|BAITANG)\s*/i, '').toUpperCase();
    if (/^(?:K|KINDER|KINDERGARTEN)$/.test(text)) return 'K';
    const roman: Record<string, string> = { I: '1', II: '2', III: '3', IV: '4', V: '5', VI: '6' };
    return roman[text] || text.match(/\d+/)?.[0] || '';
}

/** "Grade 6" or "Kinder", however the load's grade level was typed. */
export function gradeLabel(value: string | null | undefined): string {
    const grade = loadGrade(value);
    if (grade === 'K') return 'Kinder';
    return grade ? `Grade ${grade}` : String(value || '').trim() || 'No grade';
}

/** The grade a file name states outright, as in "WEEK 7 TERM 2 MATH G6.pdf". */
export function gradeFromFileName(fileName: string): string {
    const name = fileName.replace(/\.pdf$/i, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ');
    const found = [...name.matchAll(/\b(?:GRADE|GR|G|BAITANG) ?([1-6]|III|II|IV|VI|V|I)\b/g)].map(match => loadGrade(match[1]));
    return new Set(found).size === 1 ? found[0] : '';
}

/** Recognize named Kinder subjects, including Mathematics, in PDF filenames. */
export function kindergartenAreasFromFileName(fileName: string): string[] {
    const name = fileName.replace(/\.pdf$/i, '').toUpperCase().replace(/&/g, ' AND ')
        .replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    const patterns: [RegExp, string][] = [
        [/\b(?:LITERACY LANGUAGE AND COMMUNICATION|LANGUAGE LITERACY AND COMMUNICATION|LLC)\b/, 'Literacy, Language, and Communication'],
        [/\b(?:SOCIO EMOTIONAL DEVELOPMENT|SOCIOEMOTIONAL DEVELOPMENT|SED)\b/, 'Socio-Emotional Development'],
        [/\b(?:VALUES DEVELOPMENT|VD)\b/, 'Values Development'],
        [/\b(?:PHYSICAL HEALTH AND MOTOR DEVELOPMENT|PHMD)\b/, 'Physical Health and Motor Development'],
        [/\b(?:AESTHETIC (?:AND )?CREATIVE DEVELOPMENT|ACD)\b/, 'Aesthetic/Creative Development'],
        [/\b(?:COGNITIVE DEVELOPMENT|COG DEV)\b/, 'Cognitive Development'],
        [/\b(?:MATHEMATICS|MATH|MATEMATIKA)\b/, 'Mathematics'],
    ];
    return patterns.filter(([pattern]) => pattern.test(name)).map(([, area]) => area);
}

export function inferUploadSubject(metadata: UploadMetadata, fileName = ''): string | null {
    const fields = extractTeachingLoadFields(metadata.rawText || '');
    const areas = kindergartenAreasFromFileName(fileName);
    const filenameArea = areas.length === 1 ? areas[0] : null;
    if (filenameArea && (!fields.grade || loadGrade(fields.grade) === 'K') &&
        (/\bKINDER(?:GARTEN)?\b/i.test(fileName) || loadGrade(fields.grade) === 'K')) return filenameArea;
    if (fields.subject) return fields.subject;
    if ((fields.grade && loadGrade(fields.grade) !== 'K') ||
        fields.subjectCandidates.some(candidate => !kindergartenLearningArea(candidate))) return null;
    if (areas.length !== 1) return null;
    if (!kindergartenLearningArea(areas[0]) && !/\bKINDER(?:GARTEN)?\b/i.test(fileName) && loadGrade(fields.grade) !== 'K') return null;
    if (fields.subjectCandidates.length && !fields.subjectCandidates.some(candidate =>
        canonicalSubject(candidate) === canonicalSubject(areas[0]))) return null;
    return areas[0];
}

/** HGP may use GMRC only when no active HGP assignment exists. */
export function acceptsUploadSubject(load: UploadLoad, subject: string, loads: UploadLoad[]): boolean {
    const target = canonicalSubject(load.subject);
    const detected = canonicalSubject(subject);
    return target === detected || (detected === 'HGP' && target === 'GMRC' &&
        !loads.some(item => item.is_active !== false && canonicalSubject(item.subject) === 'HGP'));
}

export function validAssignedLoad(load: UploadLoad | undefined): load is UploadLoad {
    return !!load && load.is_active !== false && !!load.subject?.trim() && /^(?:K|[1-6])$/.test(loadGrade(load.grade_level));
}

export function resolveTeachingLoadMatch(metadata: UploadMetadata, loads: UploadLoad[], fileName = '') {
    const fields = extractTeachingLoadFields(metadata.rawText || '');
    const filenameAreas = kindergartenAreasFromFileName(fileName);
    const filenameArea = filenameAreas.length === 1 ? filenameAreas[0] : null;
    const headerKinderCandidates = fields.subjectCandidates.filter(candidate => kindergartenLearningArea(candidate));
    const filenameCanHelp = (!fields.grade || loadGrade(fields.grade) === 'K') &&
        (!!kindergartenLearningArea(filenameArea) || /\bKINDER(?:GARTEN)?\b/i.test(fileName) || loadGrade(fields.grade) === 'K') &&
        !fields.subjectCandidates.some(candidate => !kindergartenLearningArea(candidate));
    const filenameIsKinder = /\bKINDER(?:GARTEN)?\b/i.test(fileName) || loadGrade(fields.grade) === 'K';
    const preferFilename = !!filenameArea && filenameIsKinder && (!fields.grade || loadGrade(fields.grade) === 'K');
    const subject = preferFilename ? filenameArea : fields.subject || (filenameCanHelp ? filenameArea : null);
    // A header subject with no readable grade can take the grade the file name states.
    // This is what separates Math Grade 5 from Math Grade 6 on a scanned page.
    const grade = fields.grade || (filenameArea && (preferFilename || (filenameCanHelp && !fields.subject)) ? 'K' : '')
        || (subject ? gradeFromFileName(fileName) : '');
    if (!subject && loadGrade(grade) === 'K') {
        const areaCandidates = headerKinderCandidates;
        const eligible = loads.filter(load => validAssignedLoad(load) && loadGrade(load.grade_level) === 'K' &&
            areaCandidates.some(candidate => acceptsUploadSubject(load, candidate, loads)));
        if (eligible.length === 1) return { loadId: eligible[0].id, subject: eligible[0].subject, grade, reason: 'matched' as const };
        if (eligible.length > 1) return { loadId: null, subject: null, grade, reason: 'ambiguous' as const };
    }
    if (!preferFilename && !fields.subject && filenameArea && headerKinderCandidates.length > 1 &&
        !headerKinderCandidates.some(candidate => canonicalSubject(candidate) === canonicalSubject(filenameArea))) {
        return { loadId: null, subject: null, grade, reason: 'ambiguous' as const };
    }
    if (!subject) return { loadId: null, subject, grade, reason: 'unrecognized' as const };
    if (!grade) return { loadId: null, subject, grade, reason: 'missing_grade' as const };
    const candidates = loads.filter(load => validAssignedLoad(load) && acceptsUploadSubject(load, subject, loads));
    if (!candidates.length) return { loadId: null, subject, grade, reason: 'no_subject_match' as const };
    const matching = grade ? candidates.filter(load => loadGrade(load.grade_level) === loadGrade(grade)) : candidates;
    if (!matching.length) return { loadId: null, subject, grade, reason: 'grade_mismatch' as const };
    if (matching.length !== 1) return { loadId: null, subject, grade, reason: 'ambiguous' as const };
    return { loadId: matching[0].id, subject, grade, reason: 'matched' as const };
}

function joinWithAnd(items: string[]): string {
    return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** Explains why no load was filled in, naming the teacher's loads for that subject. */
export function teachingLoadNotice(
    match: { subject?: string | null; grade?: string | null; reason: string }, loads: UploadLoad[],
): string {
    const subject = match.subject || '';
    const sameSubject = subject ? loads.filter(load => validAssignedLoad(load) && acceptsUploadSubject(load, subject, loads)) : [];
    const grades = joinWithAnd([...new Set(sameSubject.map(load => gradeLabel(load.grade_level)))]);
    const detected = match.grade ? gradeLabel(match.grade) : '';
    switch (match.reason) {
        case 'missing_grade':
            return sameSubject.length > 1
                ? `Detected ${subject}, but the grade could not be read. You teach ${subject} in ${grades}. Choose the correct one below.`
                : `Detected ${subject}, but the grade could not be read. Choose the teaching load below.`;
        case 'grade_mismatch':
            return `This document says ${subject} ${detected}, but your ${subject} ${sameSubject.length > 1 ? 'loads are' : 'load is'} ${grades}. Choose the correct load, or update your Teaching Load if ${detected} was assigned to you.`;
        case 'no_subject_match':
            return `This document says ${subject}${detected ? ` ${detected}` : ''}, which is not in your active teaching loads. Choose the correct load below, or update your Teaching Load.`;
        case 'ambiguous':
            return subject
                ? `You have more than one active ${subject} ${detected} load. Choose the correct one below.`
                : 'This document lists several learning areas that match your loads. Choose the correct teaching load below.';
        default:
            return 'The Learning Area / Asignatura field could not identify one subject. Choose the correct teaching load below.';
    }
}
