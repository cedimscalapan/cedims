/** Duplicate decisions must always use current database rows, never browser history. */
export class DuplicateUploadError extends Error {
    constructor(location = '') {
        super(`This exact file is already in your archive${location ? ` under ${location}` : ''}. A different grade or subject needs its own file. If it was filed in the wrong place, delete that submission first.`);
        this.name = 'DuplicateUploadError';
    }
}

export async function assertNoDatabaseDuplicate(
    database: any, userId: string, contentHash: string, verificationHash: string
): Promise<void> {
    const { data, error } = await database.from('submissions')
        .select('id, subject, term_number, week_number, teaching_loads ( subject, grade_level )')
        .eq('user_id', userId).eq('content_hash', contentHash)
        .neq('file_hash', verificationHash).limit(1);
    if (error) throw new Error(`Could not check existing submissions: ${error.message}`);
    if (data?.length) {
        const row = data[0];
        const subject = row.teaching_loads?.subject || row.subject;
        const grade = row.teaching_loads?.grade_level;
        const period = row.term_number && row.week_number ? `Term ${row.term_number}, Week ${row.week_number}` : '';
        throw new DuplicateUploadError([subject, grade, period].filter(Boolean).join(' · '));
    }
}
