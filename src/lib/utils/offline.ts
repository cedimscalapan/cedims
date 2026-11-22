/**
 * Offline Sync Queue — IndexedDB via idb-keyval
 * Persists pending uploads in the browser.
 * Auto-resumes when connectivity is restored.
 */

import { assertNoDatabaseDuplicate, DuplicateUploadError } from './submissionDuplicates';
import { get, set, del, keys } from 'idb-keyval';
import { writable } from 'svelte/store';
import { supabase } from './supabase';
import { withTimeout, xhrUpload } from './pipeline';
import { getCurrentSchoolYear } from './schoolYear';
import { deadlineAtTenAM, effectiveDeadlineForSubject } from './deadlineRules';
import { logAudit } from './audit';
import { logOnce } from './noise';
import { isWeeklyComplianceDocType } from './compliance';
import { classifyQueueFailure, httpUploadFailure, nextAttemptDelay, QUEUE_RETRY_MS, shouldCancelAfter, UploadRejectedError } from './uploadQueueRules';

export const pendingSyncCount = writable<number>(0);
export const syncingQueuedUpload = writable<boolean>(false);

/** Uploads the system had to cancel. Kept until the teacher has seen them. */
export interface FailedUpload {
    key: string;
    userId: string;
    fileName: string;
    fileHash: string;
    reason: string;
    canRedo: boolean;
    redoHref: string;
    failedAt: number;
}
export const failedUploads = writable<FailedUpload[]>([]);

const CACHE_PREFIX_DOCS = 'cached_docs_';
const CACHE_PREFIX_HISTORY = 'cached_history_';
const CACHE_PREFIX_METADATA = 'cached_metadata_';
const METADATA_ENTRY_LIMIT = 512 * 1024;
const METADATA_TOTAL_LIMIT = 3 * 1024 * 1024;
const METADATA_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const MAX_PENDING_FILES = 8;
const MAX_PENDING_BYTES = 20 * 1024 * 1024;
const METADATA_REFRESH_MS = 10 * 60 * 1000;
const HASH_REFRESH_MS = 30 * 60 * 1000;

/**
 * Cache a verified document hash locally for offline verification.
 * Part of Phase 4.7 Smart Caching.
 */
export async function cacheVerifiedDoc(hash: string, metadata: any) {
    await set(`${CACHE_PREFIX_DOCS}${hash}`, metadata);
}

/**
 * Lookup a document hash in the local offline cache.
 */
export async function lookupOfflineDoc(hash: string) {
    return await get(`${CACHE_PREFIX_DOCS}${hash}`);
}

/**
 * Strip Svelte 5 state proxies (and anything else structured clone can't
 * store) before handing data to IndexedDB, which otherwise throws
 * DataCloneError on a raw $state proxy.
 */
function toCloneable(data: any) {
    return data === undefined ? data : JSON.parse(JSON.stringify(data));
}

/**
 * Cache current dashboard data for offline viewing.
 */
export async function cacheDashboardData(userId: string, data: any) {
    await set(`${CACHE_PREFIX_HISTORY}${userId}`, {
        data: toCloneable(data),
        timestamp: Date.now()
    });
}

/**
 * Retrieve cached dashboard data.
 */
export async function getCachedDashboardData(userId: string) {
    return await get(`${CACHE_PREFIX_HISTORY}${userId}`);
}

/**
 * Generic metadata caching for offline fallbacks.
 */
export async function cacheMetadata(key: string, data: any) {
    const entry = { data: toCloneable(data), timestamp: Date.now() };
    const size = new TextEncoder().encode(JSON.stringify(entry)).byteLength;
    if (size > METADATA_ENTRY_LIMIT) {
        console.warn(`[offline] Skipping oversized snapshot: ${key}`);
        return;
    }
    const ownKey = `${CACHE_PREFIX_METADATA}${key}`;
    await set(ownKey, entry);
    // Small, account-scoped snapshots only. Old snapshots are discarded, and
    // pending PDF files are stored separately so they cannot be evicted here.
    const entries: { key: string; size: number; timestamp: number }[] = [];
    const metadataKeys = (await keys()).filter(candidate => String(candidate).startsWith(CACHE_PREFIX_METADATA));
    const metadataValues = await Promise.all(metadataKeys.map(candidate => get<{ data: unknown; timestamp: number }>(candidate)));
    for (let index = 0; index < metadataKeys.length; index++) {
        const candidate = metadataKeys[index];
        const name = String(candidate);
        const value = metadataValues[index];
        if (!value) continue;
        const timestamp = Number(value.timestamp || 0);
        if (name !== ownKey && Date.now() - timestamp > METADATA_MAX_AGE) {
            await del(candidate);
            continue;
        }
        entries.push({ key: name, size: new TextEncoder().encode(JSON.stringify(value)).byteLength, timestamp });
    }
    let total = entries.reduce((sum, item) => sum + item.size, 0);
    for (const item of entries.filter(item => item.key !== ownKey).sort((a, b) => a.timestamp - b.timestamp)) {
        if (total <= METADATA_TOTAL_LIMIT) break;
        await del(item.key);
        total -= item.size;
    }
}

/**
 * Retrieve generic cached metadata.
 */
export async function getCachedMetadata(key: string) {
    return await get(`${CACHE_PREFIX_METADATA}${key}`);
}

/**
 * WBS 20.4 — Pre-fetch essential metadata for offline upload manual selection.
 * Fetches teaching loads and academic calendar, caching them in IndexedDB.
 */
export async function prefetchOfflineMetadata(userId: string, districtId?: string): Promise<void> {
    if (!navigator.onLine) return;

    try {
        const stampKey = `offline_metadata_prefetch_v2_${userId}_${districtId || 'none'}_${getCurrentSchoolYear()}`;
        const lastPrefetch = Number(sessionStorage.getItem(stampKey) || 0);
        if (Date.now() - lastPrefetch < METADATA_REFRESH_MS) return;

        // 1. Fetch ALL Teaching Loads for the user
        const { data: loads, error: loadsErr } = await supabase
            .from('teaching_loads')
            .select(`
                id, subject, grade_level, is_active,
                profiles:user_id ( full_name )
            `)
            .eq('user_id', userId)
            .eq('is_active', true);

        if (!loadsErr && loads) {
            await cacheMetadata(`teaching_loads_${userId}`, loads);
        }

        // 2. Fetch ALL Academic Calendar weeks for the district (for week resolution)
        let calendarData: any[] = [];
        if (districtId) {
            const { data: calendar, error: calErr } = await supabase
                .from('academic_calendar')
                .select('id, school_year, term, week_number, deadline_date, description, is_active')
                .eq('district_id', districtId)
                .eq('school_year', getCurrentSchoolYear())
                .eq('is_published', true)
                .order('week_number', { ascending: true });

            if (!calErr && calendar) {
                calendarData = calendar;
                await cacheMetadata(`calendar_${districtId}`, calendar);
                await cacheMetadata(`calendar_open_${districtId}`, calendar.filter((entry) => entry.is_active === true));
                if (!loadsErr) sessionStorage.setItem(stampKey, String(Date.now()));
            }
        }

        // Fallback: If no district calendar found, fetch global/common
        if (!districtId && calendarData.length === 0) {
            const { data: globalCal, error: globalCalErr } = await supabase
                .from('academic_calendar')
                .select('id, school_year, term, week_number, deadline_date, description, is_active')
                .eq('school_year', getCurrentSchoolYear())
                .eq('is_published', true)
                .order('week_number', { ascending: true });

            if (!globalCalErr && globalCal) {
                calendarData = globalCal;
                await cacheMetadata('calendar_all', globalCal);
            }
        }

        // 3. Fetch Submission History (for Copilot context)
        const { data: subs, error: subsErr } = await supabase
            .from('submissions')
            .select('teaching_load_id, week_number, doc_type, compliance_status, created_at')
            .eq('user_id', userId)
            .eq('school_year', getCurrentSchoolYear())
            .order('created_at', { ascending: false })
            .limit(100);

        if (!subsErr && subs) {
            await cacheMetadata(`submission_history_${userId}`, subs);
        }

        // 4. Cache current year settings
        const currentYear = getCurrentSchoolYear();
        await cacheMetadata('current_school_year', currentYear);

    } catch (err) {
        // Offline metadata is a convenience cache; failures should stay quiet.
    }
}

/**
 * Check if the device has all necessary metadata cached for offline upload.
 */
export async function verifyOfflineReadiness(userId: string, districtId?: string): Promise<{
    ready: boolean;
    missing: string[];
    counts: Record<string, number>;
}> {
    const missing: string[] = [];
    const counts: Record<string, number> = {};

    const loads = await getCachedMetadata(`teaching_loads_${userId}`);
    if (!loads?.data || (loads.data as any[]).length === 0) {
        missing.push('Teaching Loads');
    } else {
        counts.loads = (loads.data as any[]).length;
    }

    const calendar = districtId
        ? await getCachedMetadata(`calendar_${districtId}`)
        : await getCachedMetadata('calendar_all');

    if (!calendar?.data || (calendar.data as any[]).length === 0) {
        missing.push('Academic Calendar');
    } else {
        counts.weeks = (calendar.data as any[]).length;
    }

    const history = await getCachedMetadata(`submission_history_${userId}`);
    if (!history?.data || (history.data as any[]).length === 0) {
        // History is optional but recommended
    } else {
        counts.history = (history.data as any[]).length;
    }

    return {
        ready: missing.length === 0,
        missing,
        counts
    };
}

/**
 * WBS 20.3 — Pre-cache ALL verified document hashes for full offline verification.
 * 
 * Fetches all submission hashes from Supabase and stores them in IndexedDB.
 * This allows the verify page to work offline for ANY document,
 * not just previously-verified ones.
 * 
 * Should be called on login and periodically when online.
 */
export async function preloadVerificationHashes(userId?: string): Promise<number> {
    try {
        // Check if we're online
        if (!navigator.onLine) return 0;
        const stampKey = `verification_hash_preload_${userId || 'all'}`;
        const lastPreload = Number(sessionStorage.getItem(stampKey) || 0);
        if (Date.now() - lastPreload < HASH_REFRESH_MS) return 0;
        sessionStorage.setItem(stampKey, String(Date.now()));

        let query = supabase
            .from('submissions')
            .select(`
                file_hash, file_name, doc_type, compliance_status, created_at, 
                file_size, week_number, subject, school_year,
                profiles:user_id ( full_name ),
                teaching_loads ( subject, grade_level )
            `)
            .not('file_hash', 'like', 'missing_%')
            .order('created_at', { ascending: false });

        // Scope to current user to reduce cache size
        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data, error } = await query.limit(200);

        if (error || !data) return 0;

        let cached = 0;
        for (const item of data) {
            const profileData = item.profiles as any;
            const teachingLoadData = item.teaching_loads as any;

            const metadata = {
                file_name: item.file_name,
                doc_type: item.doc_type,
                compliance_status: item.compliance_status,
                created_at: item.created_at,
                file_size: item.file_size,
                week_number: item.week_number,
                subject: item.subject,
                school_year: item.school_year,
                teacher_name: profileData?.full_name || null,
                school_name: profileData?.schools?.name || null,
                teaching_load_subject: teachingLoadData?.subject || null,
                teaching_load_grade: teachingLoadData?.grade_level || null,
            };

            await cacheVerifiedDoc(item.file_hash, metadata);
            cached++;
        }

        return cached;
    } catch (err) {
        return 0;
    }
}

const QUEUE_PREFIX = 'sync_queue_';

export interface QueueItem {
    /** Original-file fingerprint, used only for a fresh database query on sync. */
    contentHash?: string;
    fileName: string;
    filePath: string;
    fileHash: string;
    fileSize: number;
    pdfBytes: Uint8Array | Blob;
    rawText?: string;
    options: {
        userId: string;
        docType?: string;
        termNumber?: number;
        weekNumber?: number;
        schoolYear?: string;
        subject?: string;
        schoolName?: string;
        calendarId?: string;
        teachingLoadId?: string;
    };
    timestamp: number;
    /** Failed tries while the internet was working. Offline waiting does not count. */
    attempts?: number;
    nextAttemptAt?: number;
}

export interface QueuedUploadSummary {
    key: string;
    item: QueueItem;
}

export async function enqueue(item: QueueItem): Promise<void> {
    const existing = await getQueuedUploads();
    const pendingBytes = existing.reduce((sum, queued) => sum + queued.item.fileSize, 0);
    if (existing.length >= MAX_PENDING_FILES || pendingBytes + item.fileSize > MAX_PENDING_BYTES) {
        throw new Error('This device has reached its offline upload limit (8 files or 20 MB). Reconnect and let pending files sync before adding another.');
    }
    const shortHash = item.fileHash.slice(0, 8);

    // Resilience: Workers often return SharedArrayBuffer which CANNOT be stored in IndexedDB.
    // We MUST copy it to a plain Uint8Array (backed by a real ArrayBuffer) first.
    let pdfBlobPart: any = item.pdfBytes;
    if (!(item.pdfBytes instanceof Blob)) {
        const fresh = new Uint8Array(item.pdfBytes.length);
        fresh.set(item.pdfBytes);
        pdfBlobPart = fresh;
    }

    const storeItem = {
        ...item,
        pdfBytes: new Blob([pdfBlobPart], { type: 'application/pdf' }),
        options: JSON.parse(JSON.stringify(item.options))
    };

    const key = `${QUEUE_PREFIX}${item.timestamp}_${shortHash}`;
    await set(key, storeItem);
    await updatePendingCount();
}

export async function getQueueSize(userId?: string): Promise<number> {
    if (userId) return (await getQueuedUploads(userId)).length;
    const allKeys = await keys();
    return allKeys.filter((k: any) => String(k).startsWith(QUEUE_PREFIX)).length;
}

export async function updatePendingCount(): Promise<void> {
    const size = await getQueueSize();
    pendingSyncCount.set(size);

    // Sync to Global App Icon Badge
    const { updateAppBadge } = await import('./badge');
    await updateAppBadge();
}

export async function getQueueItems(): Promise<QueueItem[]> {
    const allKeys = await keys();
    const queueKeys = allKeys.filter((k: any) => String(k).startsWith(QUEUE_PREFIX));
    const items: QueueItem[] = [];

    for (const key of queueKeys) {
        const item = await get<QueueItem>(key);
        if (item) items.push(item);
    }

    return items.sort((a, b) => a.timestamp - b.timestamp);
}

export async function getQueuedUploads(userId?: string): Promise<QueuedUploadSummary[]> {
    const allKeys = await keys();
    const queueKeys = allKeys.filter((k: any) => String(k).startsWith(QUEUE_PREFIX));
    const items: QueuedUploadSummary[] = [];

    for (const key of queueKeys) {
        const item = await get<QueueItem>(key);
        if (item && (!userId || item.options.userId === userId)) items.push({ key: String(key), item });
    }

    return items.sort((a, b) => a.item.timestamp - b.item.timestamp);
}

export async function cancelQueuedUpload(queueKey: string, userId?: string): Promise<void> {
    if (!queueKey.startsWith(QUEUE_PREFIX)) {
        throw new Error('Invalid queued upload key.');
    }
    if (userId && (await get<QueueItem>(queueKey))?.options.userId !== userId) {
        throw new Error('This queued upload belongs to another account.');
    }
    await del(queueKey);
    await updatePendingCount();
}

import { addToast } from '$lib/stores/toast';

const FAILED_PREFIX = 'sync_failed_';

function redoLink(item: QueueItem): string {
    const { teachingLoadId, termNumber, weekNumber } = item.options;
    if (!teachingLoadId || !termNumber || !weekNumber) return '/dashboard/upload';
    return `/dashboard/upload?load=${encodeURIComponent(teachingLoadId)}&term=${termNumber}&week=${weekNumber}`;
}

export async function loadFailedUploads(): Promise<void> {
    const allKeys = await keys();
    const failedKeys = allKeys.filter((k: any) => String(k).startsWith(FAILED_PREFIX));
    const notices = await Promise.all(failedKeys.map((k) => get<FailedUpload>(k)));
    failedUploads.set(notices.filter((n): n is FailedUpload => !!n).sort((a, b) => b.failedAt - a.failedAt));
}

export async function dismissFailedUpload(key: string): Promise<void> {
    await del(key);
    failedUploads.update((items) => items.filter((item) => item.key !== key));
}

/** Removes a document the server will not take and tells the teacher what to do. */
async function cancelFailedItem(key: string, item: QueueItem, reason: string, canRedo: boolean): Promise<void> {
    const notice: FailedUpload = {
        key: `${FAILED_PREFIX}${item.timestamp}_${item.fileHash.slice(0, 8)}`,
        userId: item.options.userId,
        fileName: item.fileName,
        fileHash: item.fileHash,
        reason,
        canRedo,
        redoHref: redoLink(item),
        failedAt: Date.now(),
    };
    await set(notice.key, notice);
    await del(key);
    await updatePendingCount();
    failedUploads.update((items) => [notice, ...items.filter((other) => other.key !== notice.key)]);
    addToast('error', canRedo
        ? `${item.fileName} was not uploaded. ${reason} Please upload it again.`
        : `${item.fileName} was not uploaded. ${reason}`);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cedims:upload-cancelled', { detail: notice }));
    }
}

let isSyncing = false;
let syncRequestedWhileBusy = false;
let backgroundSyncActive = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleQueueSync(delayMs: number, ignoreBackoff = false) {
    if (!backgroundSyncActive) return;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
        retryTimer = null;
        void processQueue(ignoreBackoff);
    }, delayMs);
}

async function checkConnection(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

    try {
        const controller = new AbortController();
        // Generous on purpose: a slow link is still a link, and it must not be
        // treated as offline or its queue would never start.
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(window.location.origin, {
            method: 'HEAD',
            cache: 'no-store',
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return res.ok || res.status === 405;
    } catch (e) {
        return false;
    }
}

/** Sends one queued document: every check runs before any bytes are transferred. */
async function uploadQueuedItem(item: QueueItem, accessToken: string): Promise<string | null> {
    const { data: committed, error: lookupError } = await withTimeout(
        supabase.from('submissions').select('id').eq('user_id', item.options.userId)
            .eq('file_hash', item.fileHash).limit(1).maybeSingle() as any,
        30000, 'Submission lookup timed out.'
    ) as { data: any; error: any };
    if (lookupError) throw lookupError;
    // A matching verification ID means an earlier attempt already finished.
    if (committed) return null;

    // Older queued files have no original-file fingerprint. Do not pretend a
    // hash of their QR-stamped bytes is the original hash.
    if (item.contentHash) {
        await withTimeout(assertNoDatabaseDuplicate(supabase, item.options.userId, item.contentHash, item.fileHash),
            30000, 'Duplicate check timed out.');
    }

    const docType = item.options.docType || 'Unknown';
    const isWeeklyComplianceUpload = isWeeklyComplianceDocType(docType);
    const schoolYear = item.options.schoolYear || getCurrentSchoolYear();
    const { termNumber, weekNumber } = item.options;
    let schoolName = item.options.schoolName;
    let calendarId: string | null = null;
    let deadlineDate: Date | undefined;

    if (isWeeklyComplianceUpload) {
        if (!termNumber || !weekNumber) {
            throw new UploadRejectedError('A term and week are required for a weekly DLL/DLP upload.');
        }
        const { data: uploader, error: profileError } = await withTimeout(
            supabase.from('profiles').select('district_id, school_id').eq('id', item.options.userId).single() as any,
            30000, 'Profile lookup timed out.'
        ) as { data: any; error: any };
        if (profileError) throw profileError;

        let calendarQuery = supabase.from('academic_calendar').select('id, deadline_date')
            .eq('school_year', schoolYear).eq('term', termNumber).eq('week_number', weekNumber).eq('is_published', true).eq('is_active', true);
        calendarQuery = item.options.calendarId
            ? calendarQuery.eq('id', item.options.calendarId)
            : calendarQuery.eq('district_id', uploader?.district_id);
        const { data: openEntry, error: calendarError } = await withTimeout(
            calendarQuery.maybeSingle() as any, 30000, 'Calendar lookup timed out.'
        ) as { data: any; error: any };
        if (calendarError) throw calendarError;
        if (!openEntry) throw new UploadRejectedError(`Term ${termNumber}, Week ${weekNumber} is Closed in the Academic Calendar.`);
        calendarId = openEntry.id;
        if (openEntry.deadline_date) deadlineDate = new Date(openEntry.deadline_date);

        if (!schoolName && uploader?.school_id) {
            const { data: school } = await withTimeout(
                supabase.from('schools').select('name').eq('id', uploader.school_id).maybeSingle() as any,
                30000, 'School lookup timed out.'
            ) as { data: any };
            schoolName = school?.name;
        }
    }

    const sanitizedPath = item.filePath.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9./_-]/g, '');
    const formData = new FormData();
    formData.set('file', item.pdfBytes as Blob, item.fileName);
    formData.set('key', sanitizedPath);
    // Times out on inactivity rather than total duration, so a slow transfer
    // that is still moving is allowed to finish.
    const uploadResponse = await xhrUpload('/api/storage/upload', formData, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!uploadResponse.ok) {
        let detail = '';
        try { detail = JSON.parse(uploadResponse.body)?.message || ''; } catch { /* no readable body */ }
        throw httpUploadFailure(uploadResponse.status, detail);
    }

    // Lateness is judged by when the teacher submitted, not when the internet
    // returned. Only the first document for a teaching load and week counts;
    // later ones are archived as supplementary.
    let complianceStatus: 'compliant' | 'late' | 'supplementary' = isWeeklyComplianceUpload
        ? calculateComplianceStatus(new Date(item.timestamp), deadlineDate, item.options.subject, schoolName)
        : 'supplementary';
    if (isWeeklyComplianceUpload && item.options.teachingLoadId) {
        const slotDocTypes = docType === 'DLL' || docType === 'DLP' ? ['DLL', 'DLP'] : [docType];
        const { data: slotMatch, error: slotError } = await withTimeout(
            supabase.from('submissions').select('id')
                .eq('teaching_load_id', item.options.teachingLoadId)
                .eq('week_number', weekNumber as number)
                .eq('term_number', termNumber as number)
                .eq('school_year', schoolYear)
                .in('compliance_status', ['compliant', 'late'])
                .in('doc_type', slotDocTypes)
                .limit(1) as any,
            30000, 'Duplicate slot check timed out.'
        ) as { data: any; error: any };
        if (slotError) throw slotError;
        if (slotMatch?.length) complianceStatus = 'supplementary';
    }

    const { error: dbError } = await withTimeout(
        supabase.from('submissions').insert({
            user_id: item.options.userId,
            file_name: item.fileName,
            file_path: sanitizedPath,
            file_hash: item.fileHash,
            content_hash: item.contentHash || null,
            file_size: item.fileSize,
            doc_type: docType,
            term_number: isWeeklyComplianceUpload ? termNumber ?? null : null,
            week_number: isWeeklyComplianceUpload ? weekNumber ?? null : null,
            school_year: schoolYear,
            subject: item.options.subject,
            calendar_id: calendarId,
            teaching_load_id: item.options.teachingLoadId || null,
            compliance_status: complianceStatus,
            raw_text: item.rawText || null
        }) as any,
        30000, 'Sync DB insert timed out'
    ) as { error: any };
    if (dbError) {
        if (dbError.code === '23505' && dbError.message?.includes('uniq_submission_content')) throw new DuplicateUploadError();
        throw dbError;
    }

    void logAudit(item.options.userId, 'upload.created', 'submission', undefined, {
        file_name: item.fileName,
        doc_type: docType,
        teaching_load_id: item.options.teachingLoadId || null,
        term_number: termNumber || null,
        week_number: weekNumber || null,
        school_year: schoolYear,
        source: 'offline-sync'
    });
    await cacheVerifiedDoc(item.fileHash, {
        file_name: item.fileName,
        doc_type: item.options.docType,
        week_number: weekNumber,
        school_year: schoolYear,
        created_at: new Date().toISOString()
    });
    return `${docType}${weekNumber ? ` - Week ${weekNumber}` : ''}`;
}

async function runQueue(ignoreBackoff: boolean): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;
    const archivedLabels: string[] = [];
    const allKeys = await keys();
    const queueKeys = allKeys.map(String).filter((k) => k.startsWith(QUEUE_PREFIX));
    if (queueKeys.length === 0 || !(await checkConnection())) return { success, failed };

    const { data: sessionData } = await withTimeout(
        supabase.auth.getSession(), 15000, 'Session check timed out.'
    );
    const session = sessionData?.session;
    // Signed out, or the token could not be refreshed: the files stay safe here
    // and sending starts again when the teacher is back in.
    if (!session?.access_token) return { success, failed };

    for (const key of queueKeys) {
        const item = await get<QueueItem>(key);
        if (!item) {
            await del(key);
            await updatePendingCount();
            continue;
        }
        // A shared computer may hold another teacher's queue. It waits for them.
        if (item.options.userId !== session.user?.id) continue;
        if (!ignoreBackoff && item.nextAttemptAt && item.nextAttemptAt > Date.now()) continue;

        try {
            syncingQueuedUpload.set(true);
            const label = await uploadQueuedItem(item, session.access_token);
            await del(key);
            await updatePendingCount();
            success++;
            if (label) archivedLabels.push(label);
        } catch (err: any) {
            const kind = classifyQueueFailure(err);
            if (kind === 'auth') break;
            if (kind === 'rejected') {
                failed++;
                await cancelFailedItem(key, item, err?.message || 'The server refused this upload.', err?.canRedo !== false && !(err instanceof DuplicateUploadError));
                continue;
            }
            // No internet right now is a wait, not a failure.
            if (!(await checkConnection())) break;
            failed++;
            const attempts = (item.attempts || 0) + 1;
            if (shouldCancelAfter(attempts)) {
                logOnce('offline-sync-item-failed', 'warn', '[offline] Queued upload cancelled after repeated failures.', err);
                await cancelFailedItem(key, item, 'The upload kept failing even with internet available.', true);
            } else {
                await set(key, { ...item, attempts, nextAttemptAt: Date.now() + nextAttemptDelay(attempts) });
            }
        } finally {
            syncingQueuedUpload.set(false);
        }
    }

    if (success > 0) {
        addToast(
            'success',
            success === 1 && archivedLabels[0]
                ? `Securely archived ${archivedLabels[0]}.`
                : `Securely archived ${success} documents.`
        );
    }
    return { success, failed };
}

/**
 * Sends everything in the queue. Runs by itself whenever the app opens, the
 * internet returns, the teacher signs in or comes back to the app, and every
 * 30 seconds while a file is still waiting.
 */
export async function processQueue(ignoreBackoff = false): Promise<{ success: number; failed: number }> {
    // One sender at a time, or the same file could be uploaded twice.
    if (isSyncing) {
        syncRequestedWhileBusy = true;
        return { success: 0, failed: 0 };
    }
    isSyncing = true;
    let outcome = { success: 0, failed: 0 };
    let busyElsewhere = false;
    try {
        const locks = typeof navigator !== 'undefined' ? (navigator as any).locks : undefined;
        if (locks?.request) {
            await locks.request('cedims-upload-queue', { ifAvailable: true }, async (lock: unknown) => {
                if (!lock) { busyElsewhere = true; return; }
                outcome = await runQueue(ignoreBackoff);
            });
        } else {
            outcome = await runQueue(ignoreBackoff);
        }
    } catch (err) {
        logOnce('offline-sync-run-failed', 'warn', '[offline] Queue run failed; it will retry.', err);
    } finally {
        isSyncing = false;
        syncingQueuedUpload.set(false);
    }
    if (syncRequestedWhileBusy) {
        syncRequestedWhileBusy = false;
        scheduleQueueSync(0, true);
    } else if (busyElsewhere || (await getQueueSize()) > 0) {
        scheduleQueueSync(QUEUE_RETRY_MS);
    }
    return outcome;
}

/**
 * Shared compliance logic (WBS 14.5)
 */
export function calculateComplianceStatus(
    submissionDate: Date,
    deadlineDate?: Date,
    subject?: string | null,
    schoolName?: string | null
): 'compliant' | 'late' {
    const now = submissionDate;

    if (deadlineDate) {
        const deadline = effectiveDeadlineForSubject(deadlineDate, subject, schoolName);

        // Submitted on or before 10:00 AM on the due date -> compliant;
        // after that exact cutoff -> late.
        return now <= deadline ? 'compliant' : 'late';
    }

    // Fallback if no supervisor deadline is set:
    // Without a deadline in the calendar, we cannot determine lateness.
    // Default to 'compliant' — uploaded means compliant.
    return 'compliant';
}
export { deadlineAtTenAM };

/** Starts automatic sending. The teacher never needs to press anything. */
export function initOfflineSync(): void {
    if (typeof window === 'undefined') return;
    if ((window as any).__cedimsOfflineSyncInitialized) return;
    (window as any).__cedimsOfflineSyncInitialized = true;
    backgroundSyncActive = true;

    // Keep pending files protected from storage eviction, without keeping a duplicate ledger.
    void navigator.storage?.persist?.().catch(() => {});

    // Remove obsolete duplicate history without touching queued files or app caches.
    import('./offlineSubmissionLedger').then(({ clearLegacySubmissionLedger }) => {
        void clearLegacySubmissionLedger().catch(() => {});
    });

    void updatePendingCount();
    void loadFailedUploads();

    // Send right away when the app opens.
    void processQueue(true);

    window.addEventListener('online', () => scheduleQueueSync(500, true));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void processQueue();
    });
    window.addEventListener('focus', () => void processQueue());
    supabase.auth.onAuthStateChange((event: string, session: any) => {
        if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) scheduleQueueSync(0, true);
    });
}
