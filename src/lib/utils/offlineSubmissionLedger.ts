/**
 * Offline Submission Ledger — IndexedDB-backed
 * 
 * Tracks all submissions (online + offline) for strict enforcement:
 * - One upload per teaching load per week per doc type (no duplicates)
 * - SHA-256 hash deduplication (no identical content)
 * - Survives browser refresh, cache clear, and offline periods
 * - Syncs with server when online for ground-truth consistency
 * 
 * Uses idb-keyval with dedicated prefixes to avoid conflicts with
 * the sync queue or other cached data.
 */

import { get, set, del, keys } from 'idb-keyval';
import { getCurrentSchoolYear } from './schoolYear';

// ─── Prefixes ────────────────────────────────────────────────────────────────

/** Tracks (teachingLoadId + weekNumber + schoolYear + docType) → submission info */
const SLOT_PREFIX = 'ledger_slot_';

/** Tracks fileHash → submission info (content deduplication) */
const HASH_PREFIX = 'ledger_hash_';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LedgerEntry {
    teachingLoadId: string;
    weekNumber: number;
    schoolYear: string;
    docType: string;
    fileHash: string;
    fileName: string;
    timestamp: number;
    /** 'pending' = queued offline, 'synced' = confirmed on server */
    status: 'pending' | 'synced';
}

// ─── Key Builders ────────────────────────────────────────────────────────────

function slotKey(teachingLoadId: string, weekNumber: number, schoolYear: string, docType: string): string {
    return `${SLOT_PREFIX}${teachingLoadId}_w${weekNumber}_${schoolYear}_${docType}`;
}

function hashKey(fileHash: string): string {
    return `${HASH_PREFIX}${fileHash}`;
}

// ─── Core Operations ─────────────────────────────────────────────────────────

/**
 * Record a submission in the local ledger.
 * Called after both online upload success and offline queue enqueue.
 */
export async function recordSubmission(entry: LedgerEntry): Promise<void> {
    const slot = slotKey(entry.teachingLoadId, entry.weekNumber, entry.schoolYear, entry.docType);
    const hash = hashKey(entry.fileHash);

    await Promise.all([
        set(slot, entry),
        set(hash, entry)
    ]);

    console.log(`[ledger] Recorded: ${entry.docType} Week ${entry.weekNumber} (${entry.status})`);
}

/**
 * Check if a submission slot is already taken.
 * Returns the existing entry if found, null otherwise.
 * 
 * This enforces: ONE upload per teaching load per week per doc type.
 */
export async function hasSubmission(
    teachingLoadId: string,
    weekNumber: number,
    schoolYear: string,
    docType: string
): Promise<LedgerEntry | null> {
    const slot = slotKey(teachingLoadId, weekNumber, schoolYear, docType);
    const entry = await get<LedgerEntry>(slot);
    return entry || null;
}

/**
 * Check if a file hash already exists in the ledger.
 * Returns the existing entry if found, null otherwise.
 * 
 * This enforces: NO identical document content (even across different weeks).
 */
export async function hasHash(fileHash: string): Promise<LedgerEntry | null> {
    const entry = await get<LedgerEntry>(hashKey(fileHash));
    return entry || null;
}

/**
 * Mark a pending ledger entry as synced (confirmed on server).
 */
export async function markSynced(fileHash: string): Promise<void> {
    const entry = await get<LedgerEntry>(hashKey(fileHash));
    if (entry) {
        entry.status = 'synced';
        await recordSubmission(entry);
        console.log(`[ledger] Marked synced: ${entry.fileName}`);
    }
}

/**
 * Remove a ledger entry by file hash.
 * Used when a sync fails permanently and the item should be retryable.
 */
export async function removeLedgerEntry(fileHash: string): Promise<void> {
    const entry = await get<LedgerEntry>(hashKey(fileHash));
    if (entry) {
        const slot = slotKey(entry.teachingLoadId, entry.weekNumber, entry.schoolYear, entry.docType);
        await Promise.all([
            del(slot),
            del(hashKey(fileHash))
        ]);
        console.log(`[ledger] Removed: ${entry.fileName}`);
    }
}

/**
 * Get all ledger entries (for debugging or display).
 */
export async function getAllLedgerEntries(): Promise<LedgerEntry[]> {
    const allKeys = await keys();
    const slotKeys = allKeys.filter((k: any) => String(k).startsWith(SLOT_PREFIX));
    const entries: LedgerEntry[] = [];

    for (const key of slotKeys) {
        const entry = await get<LedgerEntry>(key);
        if (entry) entries.push(entry);
    }

    return entries.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Sync the ledger FROM the server.
 * Fetches all confirmed submissions for the user and populates the ledger.
 * This ensures the ledger is accurate after clearing cache or on first install.
 * 
 * Should be called:
 * - On login / app startup (when online)
 * - After coming back online from an offline period
 */
export async function syncLedgerFromServer(userId: string): Promise<number> {
    if (!navigator.onLine) return 0;

    try {
        const { supabase } = await import('./supabase');

        const { data, error } = await supabase
            .from('submissions')
            .select('teaching_load_id, week_number, school_year, doc_type, file_hash, file_name, created_at')
            .eq('user_id', userId)
            .eq('school_year', getCurrentSchoolYear())
            .order('created_at', { ascending: false })
            .limit(200);

        if (error || !data) {
            console.warn('[ledger] Server sync failed:', error?.message);
            return 0;
        }

        let synced = 0;
        for (const row of data) {
            if (!row.teaching_load_id || !row.week_number || !row.file_hash) continue;

            await recordSubmission({
                teachingLoadId: row.teaching_load_id,
                weekNumber: row.week_number,
                schoolYear: row.school_year || getCurrentSchoolYear(),
                docType: row.doc_type || 'DLL',
                fileHash: row.file_hash,
                fileName: row.file_name || 'unknown',
                timestamp: new Date(row.created_at).getTime(),
                status: 'synced'
            });
            synced++;
        }

        console.log(`[ledger] Synced ${synced} entries from server`);
        return synced;
    } catch (err) {
        console.warn('[ledger] syncLedgerFromServer error:', err);
        return 0;
    }
}

/**
 * Request persistent storage from the browser.
 * Prevents the browser from evicting IndexedDB data under storage pressure.
 * 
 * Should be called once on app startup.
 */
export async function requestPersistentStorage(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;

    try {
        if (navigator.storage && navigator.storage.persist) {
            const granted = await navigator.storage.persist();
            console.log(`[ledger] Persistent storage ${granted ? 'GRANTED' : 'denied'}`);
            return granted;
        }
    } catch (err) {
        console.warn('[ledger] requestPersistentStorage error:', err);
    }
    return false;
}

/**
 * Full integrity check: validates both slot uniqueness and content hash uniqueness.
 * Returns a detailed result object for the UI to display.
 */
export async function validateUploadIntegrity(
    teachingLoadId: string,
    weekNumber: number,
    schoolYear: string,
    docType: string,
    fileHash: string
): Promise<{
    allowed: boolean;
    reason?: string;
    existingEntry?: LedgerEntry;
    blockType?: 'slot_taken' | 'duplicate_content';
}> {
    // Check 1: Slot uniqueness (one per teaching load per week per doc type)
    const slotEntry = await hasSubmission(teachingLoadId, weekNumber, schoolYear, docType);
    if (slotEntry) {
        return {
            allowed: false,
            reason: `A ${docType} document for Week ${weekNumber} has already been ${slotEntry.status === 'synced' ? 'archived' : 'queued for upload'}.`,
            existingEntry: slotEntry,
            blockType: 'slot_taken'
        };
    }

    // Check 2: Content hash uniqueness (no identical documents)
    const hashEntry = await hasHash(fileHash);
    if (hashEntry) {
        return {
            allowed: false,
            reason: `This exact document has already been submitted as "${hashEntry.fileName}" (${hashEntry.docType}, Week ${hashEntry.weekNumber}).`,
            existingEntry: hashEntry,
            blockType: 'duplicate_content'
        };
    }

    return { allowed: true };
}
