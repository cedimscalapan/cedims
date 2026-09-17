/**
 * Offline Sync Queue — IndexedDB via idb-keyval
 * Persists pending uploads in the browser.
 * Auto-resumes when connectivity is restored.
 */

import { get, set, del, keys } from 'idb-keyval';
import { writable } from 'svelte/store';
import { supabase } from './supabase';
import { withTimeout } from './pipeline';
import { getCurrentSchoolYear } from './schoolYear';
import { env } from '$env/dynamic/public';

export const pendingSyncCount = writable<number>(0);

const CACHE_PREFIX_DOCS = 'cached_docs_';
const CACHE_PREFIX_HISTORY = 'cached_history_';
const CACHE_PREFIX_METADATA = 'cached_metadata_';

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
 * Cache current dashboard data for offline viewing.
 */
export async function cacheDashboardData(userId: string, data: any) {
    await set(`${CACHE_PREFIX_HISTORY}${userId}`, {
        data,
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
    await set(`${CACHE_PREFIX_METADATA}${key}`, {
        data,
        timestamp: Date.now()
    });
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
        console.log('[offline] Pre-fetching metadata for offline upload...');

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
            console.log(`[offline] Cached ${loads.length} teaching loads`);
        }

        // 2. Fetch ALL Academic Calendar weeks for the district (for week resolution)
        let calendarData: any[] = [];
        if (districtId) {
            const { data: calendar, error: calErr } = await supabase
                .from('academic_calendar')
                .select('id, week_number, deadline_date, description, is_active')
                .eq('district_id', districtId)
                .order('week_number', { ascending: true });

            if (!calErr && calendar && calendar.length > 0) {
                calendarData = calendar;
                await cacheMetadata(`calendar_${districtId}`, calendar);
                await cacheMetadata(`calendar_open_${districtId}`, calendar);
                console.log(`[offline] Cached ${calendar.length} calendar weeks for district ${districtId}`);
            }
        }

        // Fallback: If no district calendar found, fetch global/common
        if (calendarData.length === 0) {
            const { data: globalCal, error: globalCalErr } = await supabase
                .from('academic_calendar')
                .select('id, week_number, deadline_date, description, is_active')
                .order('week_number', { ascending: true });

            if (!globalCalErr && globalCal) {
                calendarData = globalCal;
                await cacheMetadata('calendar_all', globalCal);
                // Also cache as district-specific if possible to avoid redundant fetches
                if (districtId) {
                    await cacheMetadata(`calendar_${districtId}`, globalCal);
                    await cacheMetadata(`calendar_open_${districtId}`, globalCal);
                }
                console.log(`[offline] Cached ${globalCal.length} global calendar weeks (fallback)`);
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
            console.log(`[offline] Cached ${subs.length} submission history records`);
        }

        // 4. Cache current year settings
        const currentYear = getCurrentSchoolYear();
        await cacheMetadata('current_school_year', currentYear);

        console.log('[offline] Offline metadata pre-fetch complete.');
    } catch (err) {
        console.warn('[offline] prefetchOfflineMetadata error:', err);
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

        console.log(`[offline] Pre-cached ${cached} document hashes for offline verification`);
        return cached;
    } catch (err) {
        console.warn('[offline] preloadVerificationHashes error:', err);
        return 0;
    }
}

const QUEUE_PREFIX = 'sync_queue_';

export interface QueueItem {
    fileName: string;
    filePath: string;
    fileHash: string;
    fileSize: number;
    pdfBytes: Uint8Array | Blob;
    rawText?: string;
    options: {
        userId: string;
        docType?: string;
        weekNumber?: number;
        schoolYear?: string;
        subject?: string;
        calendarId?: string;
        teachingLoadId?: string;
    };
    timestamp: number;
}

export async function enqueue(item: QueueItem): Promise<void> {
    const shortHash = item.fileHash.slice(0, 8);

    // The same document must not be queued twice. This used to return normally
    // when it found one, so the caller went on to report the upload as archived
    // while nothing had been queued — a submission could vanish with a success
    // message. It throws now, so the teacher is actually told.
    //
    // This only ever catches the identical file. An additional DLL for a
    // week/subject that already has one is a different file with a different
    // hash: it queues normally and syncs as 'supplementary'.
    const allKeys = await keys();
    for (const k of allKeys) {
        if (typeof k === 'string' && k.startsWith(QUEUE_PREFIX) && k.endsWith(shortHash)) {
            throw new Error('This exact document is already waiting to be uploaded. Choose a different file, or check My Files.');
        }
    }

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

    // NOTE: No auto-sync here. The sync engine handles sync separately
    // via initOfflineSync listeners (online event, visibility change, etc.)
    // This prevents unnecessary sync attempts while offline.
    console.log(`[offline] Enqueued: ${item.fileName} (sync deferred)`);
}

export async function getQueueSize(): Promise<number> {
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

import { addToast } from '$lib/stores/toast';
import { isMobileDevice } from './device';

/**
 * Background-sync chatter ("Syncing N offline file(s)...", "Synced N file(s)
 * successfully!", and so on).
 *
 * On mobile every upload goes through the queue by design — the document is
 * processed, stamped and reported as archived before the transfer runs — so
 * these notices fire on every single upload and contradict the success the
 * teacher was just shown. They're plumbing, not information the teacher can
 * act on, so they stay silent there. Desktop only reaches the queue when a
 * direct upload actually failed, where the same notices are genuinely
 * informative, so they're kept.
 */
function syncToast(type: 'info' | 'success' | 'warning' | 'error', message: string) {
    if (isMobileDevice()) return;
    addToast(type, message);
}

let isSyncing = false;

// ... (getQueueSize, getQueueItems remain same)

// Robust connectivity check
// Robust connectivity check with timeout
async function checkConnection(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        // Try to reach the app itself (HEAD request is lightweight)
        const res = await fetch(window.location.origin, {
            method: 'HEAD',
            cache: 'no-store',
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        return res.ok || res.status === 405; // 405 is fine (method not allowed), just means server responded
    } catch (e) {
        console.warn('[offline] Connection check failed:', e);
        return false;
    }
}

export async function processQueue(force = false): Promise<{ success: number; failed: number }> {
    // If not forcing, check connection status first
    const isOnline = force ? true : await checkConnection();

    if (!isOnline) {
        return { success: 0, failed: 0 };
    }

    if (isSyncing && !force) {
        console.log('[offline] processQueue skipped: Already syncing');
        return { success: 0, failed: 0 };
    }

    const allKeys = await keys();
    const queueKeys = allKeys.filter((k: any) => String(k).startsWith(QUEUE_PREFIX));

    if (queueKeys.length === 0) {
        return { success: 0, failed: 0 };
    }

    console.log(`[offline] Found ${queueKeys.length} items to sync...`);
    isSyncing = true;
    let success = 0;
    let failed = 0;
    // Labels for the completion message, phrased the way a direct upload
    // phrases it ("DLL - Week 1") rather than as a sync summary.
    const archivedLabels: string[] = [];

    // Notify start
    syncToast('info', `Syncing ${queueKeys.length} offline file(s)...`);

    // Lazy-import ledger for marking synced entries
    const { markSynced, removeLedgerEntry } = await import('./offlineSubmissionLedger');

    try {
        for (const key of queueKeys) {
            // Re-check connection before each item
            if (!force && !(await checkConnection())) {
                console.log('[offline] Connection lost during sync. Pausing...');
                break;
            }

            const item = await get<QueueItem>(key);

            // Handle corrupted/missing data
            if (!item) {
                console.warn(`[offline] Found ghost key ${key}, removing...`);
                await del(key);
                await updatePendingCount();
                continue;
            }

            // Set when the server already holds a document for this slot, or
            // this exact content. Either makes the item an additional copy, so
            // it is archived and marked supplementary rather than discarded.
            let forceSupplementary = false;

            try {
                // ── Re-validate against server before upload ──
                // (Items may have been uploaded by another device/session since queuing)

                // 1. Strict Metadata Check (One per load/week/type)
                if (item.options.teachingLoadId && item.options.weekNumber) {
                    const metaCheckPromise = supabase
                        .from('submissions')
                        .select('id')
                        .eq('teaching_load_id', item.options.teachingLoadId)
                        .eq('week_number', item.options.weekNumber)
                        .eq('school_year', item.options.schoolYear || getCurrentSchoolYear())
                        .eq('doc_type', item.options.docType || 'DLL')
                        .maybeSingle();

                    const { data: metaMatch } = await withTimeout(
                        metaCheckPromise as any,
                        20000,
                        'Meta check timed out'
                    ) as { data: any };

                    if (metaMatch) {
                        // An additional document for a week/subject that already
                        // has one is archived as supplementary, not discarded.
                        // This used to del() the queued item and report it as
                        // synced, which threw the teacher's second DLL away.
                        console.info(`[offline] Slot already covered — filing as supplementary: ${item.fileName}`);
                        forceSupplementary = true;
                    }
                }

                // 2. Strict File Hash Check (No identical content) — cross-teacher,
                // so it goes through a narrow RPC rather than a direct table
                // select (see migrations/20260910_*.sql).
                const hashCheckPromise = supabase
                    .rpc('check_duplicate_submission_hash', { p_hash: item.fileHash })
                    .maybeSingle();

                const { data: existing } = await withTimeout(
                    hashCheckPromise as any,
                    20000,
                    'Hash check timed out'
                ) as { data: any };

                if (existing) {
                    // The identical document is already archived on the server.
                    // UNIQUE (file_hash) means this row cannot be inserted, and
                    // retrying forever would never succeed — but nothing is lost
                    // by clearing it, because the very same bytes are already on
                    // file. Uploads are refused up front for this reason, so
                    // reaching here means the copy was archived from another
                    // device while this one sat queued.
                    console.info(`[offline] Identical document already archived on server, clearing queued copy: ${item.fileName}`);
                    await del(key);
                    await updatePendingCount();
                    await markSynced(item.fileHash);
                    success++;
                    continue;
                }

                // ── Upload to Backblaze B2 via Pre-signed URL ──
                const { data: sessionData } = await supabase.auth.getSession();
                const accessToken = sessionData?.session?.access_token;
                if (!accessToken) throw new Error('Not authenticated for background sync');

                const sanitizedPath = item.filePath.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9./_-]/g, '');
                const contentType = 'application/pdf';

                console.log(`[sync] Requesting pre-signed B2 upload URL for: ${item.fileName}`);

                // 1. Get a pre-signed PUT url from our API (signing never hits B2 CORS)
                const presignResponse = await withTimeout(
                    fetch('/api/storage/presign', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ key: sanitizedPath, contentType, intent: 'upload' })
                    }),
                    20000,
                    'Pre-signed URL request timed out'
                ).catch(err => {
                    console.error('[sync] Fetch error during pre-signed URL request.', err);
                    throw err;
                });

                if (!presignResponse.ok) {
                    let errStr = presignResponse.statusText;
                    try {
                        const errJson = await presignResponse.json();
                        errStr = errJson.message || errStr;
                    } catch { /* ignore */ }
                    throw new Error(`Pre-signed URL failed (${presignResponse.status}): ${errStr}`);
                }

                const { url: presignedUrl } = await presignResponse.json();

                // 2a. Try server-side upload first (CORS-safe, avoids B2 preflight)
                const MAX_SERVER = 4.4 * 1024 * 1024;
                let uploadSuccess = false;

                if ((item.pdfBytes as Blob).size <= MAX_SERVER) {
                    try {
                        console.log('[sync] Attempting server-side upload (CORS-safe)...');
                        const serverForm = new FormData();
                        serverForm.append('file', item.pdfBytes as Blob, 'document.pdf');
                        serverForm.append('key', sanitizedPath);

                        const serverResponse = await withTimeout(
                            fetch('/api/storage/upload', {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${accessToken}` },
                                body: serverForm
                            }),
                            120000,
                            'Server sync upload timed out'
                        );

                        if (serverResponse.ok) {
                            console.log('[sync] ✅ Server-side upload succeeded in offline sync');
                            uploadSuccess = true;
                        } else {
                            console.warn('[sync] Server upload failed, trying B2 presigned URL...');
                        }
                    } catch (err) {
                        console.warn('[sync] Server upload error, falling back to B2...', (err as Error).message);
                    }
                }

                // 2b. Fallback to direct PUT -> B2 if server upload failed or file too large
                if (!uploadSuccess) {
                    const putResponse = await withTimeout(
                        fetch(presignedUrl, {
                            method: 'PUT',
                            headers: { 'Content-Type': contentType },
                            body: item.pdfBytes as Blob
                        }),
                        120000,
                        'B2 sync archive upload timed out'
                    ).catch(err => {
                        console.error('[sync] Fetch error during B2 upload fallback.', err);
                        throw err;
                    });

                    if (!putResponse.ok) {
                        let errStr = putResponse.statusText;
                        try {
                            const errJson = await putResponse.json();
                            errStr = errJson.message || errStr;
                        } catch { /* ignore */ }
                        throw new Error(`B2 Archive upload failed (${putResponse.status}): ${errStr}`);
                    }
                }

                // ── Fetch deadline for compliance + calendar_id ──
                let deadlineDate: Date | undefined;
                let calendarId = item.options.calendarId || null;
                if (calendarId) {
                    const { data } = await supabase.from('academic_calendar').select('deadline_date').eq('id', calendarId).single();
                    if (data?.deadline_date) deadlineDate = new Date(data.deadline_date);
                } else if (item.options.weekNumber) {
                    const { data: profileData } = await supabase.from('profiles').select('district_id').eq('id', item.options.userId).single();
                    if (profileData?.district_id) {
                        const { data: calData } = await supabase
                            .from('academic_calendar')
                            .select('id, deadline_date')
                            .eq('district_id', profileData.district_id)
                            .eq('week_number', item.options.weekNumber)
                            .maybeSingle();
                        if (calData) {
                            calendarId = calData.id;
                            if (calData.deadline_date) deadlineDate = new Date(calData.deadline_date);
                        }
                    }
                }

                // ── Insert database record ──
                // Detect whether this is an ADDITIONAL DLL for an already-covered
                // slot (same teaching load + week + doc type). If so, mark it
                // 'supplementary' so it's archived but doesn't affect compliance /
                // missing / late / rate — mirrors the same check in
                // pipeline.ts's runOnlinePipelineResilient, which this offline
                // sync path had been missing (multiple uploads per week are
                // intentionally allowed; only the first counts toward compliance).
                // Judge lateness by when the teacher actually submitted, not by
                // when connectivity happened to return. Using new Date() here
                // meant a document queued at 11pm on the deadline and synced
                // the next morning was recorded as LATE even though the teacher
                // submitted on time — and with uploads now able to fall back to
                // this queue silently, that would have the app report success
                // and then quietly mark the submission late.
                let complianceStatus: 'compliant' | 'late' | 'supplementary' =
                    calculateComplianceStatus(new Date(item.timestamp), deadlineDate);
                if (item.options.teachingLoadId && item.options.weekNumber) {
                    try {
                        const { data: slotMatch } = await withTimeout(
                            supabase
                                .from('submissions')
                                .select('id')
                                .eq('teaching_load_id', item.options.teachingLoadId)
                                .eq('week_number', item.options.weekNumber)
                                .eq('doc_type', item.options.docType || 'DLL')
                                .limit(1) as any,
                            20000,
                            'Duplicate slot check timed out.'
                        ) as { data: any };
                        if (slotMatch && slotMatch.length > 0) {
                            complianceStatus = 'supplementary';
                        }
                    } catch (e) {
                        console.warn('[sync] Duplicate slot check failed, continuing as normal:', e);
                    }
                }
                // Established earlier from the slot/content re-validation, which
                // also covers documents with no teaching load (ISP/ISR) that the
                // slot check above can't evaluate.
                if (forceSupplementary) complianceStatus = 'supplementary';

                const insertPromise = supabase.from('submissions').insert({
                    user_id: item.options.userId,
                    file_name: item.fileName,
                    file_path: sanitizedPath,
                    file_hash: item.fileHash,
                    file_size: item.fileSize,
                    doc_type: item.options.docType || 'Unknown',
                    week_number: item.options.weekNumber,
                    school_year: item.options.schoolYear || getCurrentSchoolYear(),
                    subject: item.options.subject,
                    calendar_id: calendarId,
                    teaching_load_id: item.options.teachingLoadId || null,
                    compliance_status: complianceStatus,
                    raw_text: item.rawText || null
                });

                const { error: dbError } = await withTimeout(
                    insertPromise as any,
                    30000,
                    'Sync DB insert timed out'
                ) as { error: any };

                if (dbError) {
                    console.error('[sync] DB insert error:', dbError);

                    // 23505 = unique_violation on file_hash: the identical
                    // document is already archived, so this row can never be
                    // inserted and retrying forever would not help. Nothing is
                    // lost — the same bytes are on file. An additional DLL for
                    // an existing week/subject never lands here: different file,
                    // different hash, inserted above as 'supplementary'.
                    if (dbError.code === '23505' || dbError.message?.includes('unique_submission_per_load_week')) {
                        console.info(
                            `[sync] Identical document already archived (${dbError.message}); clearing queued copy: ${item.fileName}`
                        );
                        await del(key);
                        await updatePendingCount();
                        await markSynced(item.fileHash);
                        syncToast('warning', `Already archived: ${item.fileName}`);
                        success++;
                        continue;
                    }

                    throw new Error(`DB Insert failed: ${dbError.message}`);
                }

                // ── Success: clean up ──
                await del(key);
                await updatePendingCount();
                await markSynced(item.fileHash);

                // Cache the hash for future offline verification
                await cacheVerifiedDoc(item.fileHash, {
                    file_name: item.fileName,
                    doc_type: item.options.docType,
                    week_number: item.options.weekNumber,
                    school_year: item.options.schoolYear,
                    created_at: new Date().toISOString()
                });

                success++;
                archivedLabels.push(
                    `${item.options.docType || 'DLL'}${item.options.weekNumber ? ` - Week ${item.options.weekNumber}` : ''}`
                );
                console.log(`[sync] Successfully synced: ${item.fileName}`);

                // Trigger native local notification. Skipped on mobile for the
                // same reason as the toasts above: the teacher was already told
                // the document was archived when they submitted it, so a later
                // "offline archival ... synced" notice only casts doubt on a
                // result that was already final from their point of view.
                if (!isMobileDevice()) {
                    import('./notifications').then(m => {
                        m.sendLocalNotification('Sync Successful', `Offline archival for ${item.fileName} has been synced to the cloud.`);
                    });
                }

            } catch (err: any) {
                console.error(`[sync] Failed to sync ${item.fileName}:`, err);
                failed++;
            }
        }
    } finally {
        isSyncing = false;
    }

    if (success > 0) {
        // Worded exactly as the direct-upload path words its success, so a
        // completed sync reads as an ordinary successful upload rather than
        // as a separate, second-class "sync" event. Shown on every device —
        // this one is a confirmation the teacher benefits from, unlike the
        // sync plumbing notices which stay silent on mobile.
        addToast(
            'success',
            success === 1 && archivedLabels[0]
                ? `Securely archived ${archivedLabels[0]}.`
                : `Securely archived ${success} documents.`
        );
    }
    if (failed > 0) {
        syncToast('error', `Failed to sync ${failed} file(s). Will retry automatically.`);
    }

    return { success, failed };
}

/**
 * Shared compliance logic (WBS 14.5)
 */
export function calculateComplianceStatus(
    submissionDate: Date,
    deadlineDate?: Date
): 'compliant' | 'late' {
    const now = submissionDate;

    if (deadlineDate) {
        const deadline = new Date(deadlineDate);
        deadline.setHours(23, 59, 59, 999);

        // Submitted on or before the due date -> compliant; after -> late.
        return now <= deadline ? 'compliant' : 'late';
    }

    // Fallback if no supervisor deadline is set:
    // Without a deadline in the calendar, we cannot determine lateness.
    // Default to 'compliant' — uploaded means compliant.
    return 'compliant';
}

// Auto-resume when online + Periodic Check
export function initOfflineSync(): void {
    if (typeof window === 'undefined') return;

    // 0. Request persistent storage (prevents browser from evicting IndexedDB)
    import('./offlineSubmissionLedger').then(({ requestPersistentStorage }) => {
        requestPersistentStorage();
    });

    // 1. Event Listener for Network Status
    window.addEventListener('online', () => {
        console.log('[offline] Network "online" event detected.');
        syncToast('info', 'Connection restored. Syncing pending uploads...');

        // Wait a moment for connection to stabilize
        setTimeout(() => {
            processQueue();
            // Also sync the ledger from server for consistency
            import('./offlineSubmissionLedger').then(({ syncLedgerFromServer }) => {
                // We don't have userId here, but the sync will happen via the profile store
                console.log('[offline] Ledger server sync triggered on reconnect');
            });
        }, 3000);
    });

    // 2. Periodic "Heartbeat" (every 60s — battery-friendly for mobile)
    setInterval(() => {
        if (navigator.onLine) {
            processQueue();
        }
    }, 60000);

    // 3. Initial check on load
    updatePendingCount();
    if (navigator.onLine) {
        setTimeout(() => {
            console.log('[offline] Initial load check...');
            processQueue();
        }, 5000);
    }

    // 4. Sync Triggers (Visibility & Focus)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
            processQueue();
        }
    });

    window.addEventListener('focus', () => {
        if (navigator.onLine) {
            processQueue();
        }
    });
}

