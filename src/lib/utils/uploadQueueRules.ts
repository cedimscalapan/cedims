/** Decides what happens to a queued upload after a failed attempt. */
export const MAX_QUEUE_ATTEMPTS = 6;
export const QUEUE_RETRY_MS = 30_000;

/** The server answered and will refuse this document however many times it is sent. */
export class UploadRejectedError extends Error {
    /** False when sending the same document again cannot help, such as a duplicate. */
    canRedo: boolean;
    constructor(message: string, canRedo = true) {
        super(message);
        this.name = 'UploadRejectedError';
        this.canRedo = canRedo;
    }
}

// Timeouts, rate limits and gateway failures clear up by themselves.
const TEMPORARY_STATUS = new Set([408, 425, 429, 502, 503, 504]);
const NETWORK_MESSAGE = /failed to fetch|fetch failed|network|load failed|timed? ?out|stalled|offline|aborted|connection/i;

export type QueueFailure = 'auth' | 'network' | 'rejected';

export function classifyQueueFailure(error: unknown): QueueFailure {
    if (error instanceof UploadRejectedError) return 'rejected';
    const failure = error as { status?: number | string; code?: string; message?: string; name?: string } | null;
    if (failure?.name === 'DuplicateUploadError') return 'rejected';
    const status = Number(failure?.status || 0);
    const code = String(failure?.code || '');
    const message = String(failure?.message || error || '');
    if (status === 401 || status === 403 || code === 'PGRST301' || /not authenticated|jwt expired|signed out/i.test(message)) return 'auth';
    if (TEMPORARY_STATUS.has(status) || NETWORK_MESSAGE.test(message)) return 'network';
    // Two uploads raced for the counted slot. The next attempt files this one as supplementary.
    if (code === '23505' && message.includes('uniq_counted_dll_slot')) return 'network';
    if (status >= 400 || code) return 'rejected';
    return 'network';
}

export function httpUploadFailure(status: number, detail = ''): Error {
    return Object.assign(new Error(`The server refused this upload (${status})${detail ? `: ${detail}` : '.'}`), { status });
}

/** 30 seconds, then doubling to a 5 minute ceiling. */
export function nextAttemptDelay(attempts: number): number {
    return Math.min(QUEUE_RETRY_MS * 2 ** Math.max(0, attempts - 1), 5 * 60 * 1000);
}

export function shouldCancelAfter(attempts: number): boolean {
    return attempts >= MAX_QUEUE_ATTEMPTS;
}

export function redoMessage(reason: string): string {
    return `${reason.trim().replace(/[.\s]*$/, '.')} Upload cancelled. Please upload the document again.`;
}
