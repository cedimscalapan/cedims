/** Duplicate decisions must always use current database rows, never browser history. */
export class DuplicateUploadError extends Error {
    constructor() {
        super('This document is already in your archive. Delete the existing submission before uploading it again.');
        this.name = 'DuplicateUploadError';
    }
}

export async function assertNoDatabaseDuplicate(
    database: any, userId: string, contentHash: string, verificationHash: string
): Promise<void> {
    const { data, error } = await database.from('submissions')
        .select('id').eq('user_id', userId).eq('content_hash', contentHash)
        .neq('file_hash', verificationHash).limit(1);
    if (error) throw new Error(`Could not check existing submissions: ${error.message}`);
    if (data?.length) throw new DuplicateUploadError();
}
