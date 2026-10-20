/**
 * Upload Pipeline Orchestrator (Worker-Powered) — Resilient Hybrid Mode
 * 
 * This orchestrator manages the high-stakes document archival pipeline.
 * It is designed to be extremely resilient, especially on mobile devices.
 * 
 * HYBRID STRATEGY:
 * 1. Attempt secure cloud archival (Online).
 * 2. If the server check/upload stalls (timeout) or network fails, 
 *    automatically move the document to the local persistent vault (Offline).
 * 3. Sync background processes will attempt to finalize the archive later.
 */

import PdfWorker from './pdf.worker?worker';
import { supabase } from './supabase';
import { getCurrentSchoolYear } from './schoolYear';
import { isMobileDevice } from './device';
import { logAudit } from './audit';
import { isWeeklyComplianceDocType } from './compliance';
import type { PipelineEvent, PipelineOptions } from '$lib/types/pipeline';
export type { PipelinePhase, PipelineResult } from '$lib/types/pipeline';

const MAX_UPLOAD_SIZE_MB = 4;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

interface CoreResult {
    stampedBytes: Uint8Array;
    fileHash: string;
    fileName: string;
    filePath: string;
    detectedMetadata: any;
    activeTermNumber?: number;
    activeWeekNumber?: number;
    activeDocType: string;
    rawText: string;
}

function resolveTermNumber(termNumber: number | undefined, weekNumber: number | undefined): number | undefined {
    if (termNumber && Number.isFinite(termNumber)) return Math.min(3, Math.max(1, termNumber));
    if (weekNumber && Number.isFinite(weekNumber)) return Math.min(3, Math.max(1, Math.ceil(weekNumber / 13)));
    return undefined;
}

function getTermPathSegment(docType: string, termNumber: number | undefined, weekNumber: number | undefined, userRole?: string): string | null {
    const roleCanUploadDll = userRole === 'Teacher' || userRole === 'Master Teacher';
    const term = resolveTermNumber(termNumber, weekNumber);
    if (docType !== 'DLL' || !roleCanUploadDll || !term) return null;
    return `Term_${term}`;
}

function runWorkerTask(worker: Worker, type: string, payload: any, transfer: Transferable[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).substring(7);
        const handler = (e: MessageEvent) => {
            if (e.data.id === id) {
                worker.removeEventListener('message', handler);
                if (e.data.success) resolve(e.data.payload);
                else reject(new Error(e.data.error));
            }
        };
        worker.addEventListener('message', handler);
        worker.postMessage({ type, payload, id }, transfer);
    });
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
    let timeoutId: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        return result as T;
    } finally {
        clearTimeout(timeoutId);
    }
}

interface XhrUploadResult {
    ok: boolean;
    status: number;
    body: string;
}

/**
 * Upload via XMLHttpRequest rather than fetch, for two mobile-specific reasons.
 *
 * 1. fetch() cannot report upload progress at all, so the bar sat frozen for
 *    the entire transfer — on a slow phone connection that's minutes of a UI
 *    that looks hung, which is indistinguishable from a dead connection.
 *    XHR exposes upload.onprogress, so real bytes-sent can be surfaced.
 * 2. A single flat timeout punishes slow-but-working transfers: a 3MB file at
 *    5 KB/s legitimately needs ~10 minutes, and killing that at 2 minutes
 *    throws away a transfer that was succeeding. This instead times out on
 *    *inactivity* — it only aborts if no bytes move for stallMs, so a slow
 *    upload runs as long as it needs while a genuinely dead one still fails
 *    promptly.
 */
function xhrUpload(
    url: string,
    body: XMLHttpRequestBodyInit,
    opts: {
        method?: string;
        headers?: Record<string, string>;
        stallMs?: number;
        onProgress?: (loaded: number, total: number) => void;
    } = {}
): Promise<XhrUploadResult> {
    const { method = 'POST', headers = {}, stallMs = 90000, onProgress } = opts;

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let stallTimer: any;

        const resetStallTimer = () => {
            clearTimeout(stallTimer);
            stallTimer = setTimeout(() => {
                xhr.abort();
                reject(new Error('Upload stalled — no data sent for a while. Check your connection and try again.'));
            }, stallMs);
        };

        const done = () => clearTimeout(stallTimer);

        xhr.open(method, url, true);
        for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);

        xhr.upload.onprogress = (e) => {
            resetStallTimer();
            if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total);
        };
        // Bytes are still in flight while the server responds; keep the stall
        // timer alive so a slow server round-trip isn't mistaken for a stall.
        xhr.onprogress = resetStallTimer;
        xhr.onload = () => {
            done();
            resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: xhr.responseText });
        };
        xhr.onerror = () => { done(); reject(new Error('Network error during upload.')); };
        xhr.onabort = () => done();
        xhr.ontimeout = () => { done(); reject(new Error('Upload timed out.')); };

        resetStallTimer();
        xhr.send(body);
    });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

async function sha256TextHex(value: string): Promise<string> {
    return sha256Hex(new TextEncoder().encode(value));
}

function randomHex(byteLength = 16): string {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

async function createSubmissionHash(originalBytes: Uint8Array, options: PipelineOptions): Promise<string> {
    const contentHash = await sha256Hex(originalBytes);
    const nonce = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : randomHex(16);
    return sha256TextHex([
        contentHash,
        options.userId,
        options.docType || 'Unknown',
        options.teachingLoadId || '',
        options.termNumber || '',
        options.weekNumber || '',
        Date.now(),
        nonce
    ].join(':'));
}

async function* runPipelineCore(
    file: File,
    options: PipelineOptions,
    worker: Worker
): AsyncGenerator<PipelineEvent & { _core?: CoreResult }> {

    // The verification hash identifies this archive event, not just the PDF
    // bytes. That keeps every QR code unique even when a teacher submits the
    // exact same file name and contents again.
    const originalBytes = new Uint8Array(await file.arrayBuffer());
    const fileHash = await createSubmissionHash(originalBytes, options);

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (file.type !== 'application/pdf' && ext !== 'pdf') {
        throw new Error('Only PDF files can be uploaded. Please export or save the document as PDF first.');
    }
    yield { phase: 'transcoding', progress: 10, message: 'Preparing PDF...' };
    let pdfBytes: Uint8Array = new Uint8Array(originalBytes);

    // Analyzing (OCR): uses the converted PDF bytes, not the original file.
    yield { phase: 'analyzing', progress: 30, message: 'Reading your document...' };
    const { extractMetadata } = await import('./ocr');
    const ocrFile = file;
    const hasPreDetected = options.preDetectedMetadata?.docType && options.preDetectedMetadata?.docType !== 'Unknown' && options.preDetectedMetadata?.rawText;
    const detectedMetadata = hasPreDetected ? options.preDetectedMetadata : await extractMetadata(ocrFile);

    yield { phase: 'compressing', progress: 50, message: 'Securing your file...' };

    // Stamping
    yield { phase: 'stamping', progress: 70, message: 'Adding verification code...' };
    const { generateQrPng } = await import('./qr-stamp');
    const qrBytes = await generateQrPng(fileHash);
    const { stampedBytes } = await runWorkerTask(
        worker,
        'STAMP_QR',
        { compressedBytes: pdfBytes, qrBytes, fileHash },
        [pdfBytes.buffer, qrBytes.buffer]
    );

    // The selected upload target is authoritative. OCR remains available for
    // mismatch warnings, but it must never silently redirect the archive slot.
    const activeDocType = options.docType || 'DLL';
    const isWeeklyComplianceUpload = isWeeklyComplianceDocType(activeDocType);
    // Supervisory plans/reports are archived and reviewed independently; OCR
    // suggestions must never attach them to a weekly calendar slot.
    const activeWeekNumber = isWeeklyComplianceUpload ? options.weekNumber : undefined;
    const activeTermNumber = isWeeklyComplianceUpload
        ? resolveTermNumber(options.termNumber, activeWeekNumber)
        : undefined;
    const rawText = options.rawText || detectedMetadata?.rawText || '';
    const fileName = file.name.replace(/\.\w+$/, '.pdf');
    const sanitizedFileName = (fileName || 'document').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    const termPathSegment = getTermPathSegment(activeDocType, activeTermNumber, activeWeekNumber, options.userRole);
    const filePath = [
        'submissions',
        options.userId,
        activeDocType,
        termPathSegment,
        `${Date.now()}_${sanitizedFileName}`
    ].filter(Boolean).join('/');

    yield {
        phase: 'uploading',
        progress: 90,
        message: 'Ready to upload...',
            _core: {
                stampedBytes: new Uint8Array(stampedBytes),
                fileHash,
                fileName,
                filePath,
                detectedMetadata,
                activeTermNumber,
                activeWeekNumber,
                activeDocType,
                rawText
            }
    };
}

async function* runOnlinePipelineResilient(
    core: CoreResult,
    options: PipelineOptions
): AsyncGenerator<PipelineEvent> {
    const { stampedBytes, fileHash, fileName, filePath, activeTermNumber, activeWeekNumber, activeDocType, rawText } = core;

    yield { phase: 'uploading', progress: 10, message: 'Checking your document...' };

    const { cacheVerifiedDoc, calculateComplianceStatus } = await import('./offline');
    const { recordSubmission } = await import('./offlineSubmissionLedger');

    // Look up calendar_id + deadline from academic_calendar using detected week number.
    // This is metadata only — calculateComplianceStatus() already falls back
    // to 'compliant' when there's no deadline — so a slow/failed lookup must
    // never abort the whole upload. Each query is time-bounded (previously
    // unbounded, so a bad connection could hang here forever with no error),
    // and any failure (timeout or otherwise) is swallowed: the archive still
    // goes through, just without deadline-based lateness tracking for this
    // submission.
    let calendarId: string | null = null;
    let deadlineDate: Date | undefined;
    let calendarIsOpen = false;
    if (isWeeklyComplianceDocType(activeDocType) && activeWeekNumber && activeTermNumber) {
        try {
            let calendarQuery = supabase
                .from('academic_calendar')
                .select('id, deadline_date, is_active')
                .eq('school_year', options.schoolYear || getCurrentSchoolYear())
                .eq('term', activeTermNumber)
                .eq('week_number', activeWeekNumber)
                .eq('is_active', true);
            if (options.calendarId) calendarQuery = calendarQuery.eq('id', options.calendarId);

            const { data: calEntry } = await withTimeout(
                calendarQuery.maybeSingle() as any,
                10000,
                'Calendar lookup timed out.'
            ) as { data: any };
            if (!calEntry) {
                yield { phase: 'uploading', progress: 15, message: 'Checking your document...' };
                const { data: profileData } = await withTimeout(
                    supabase
                        .from('profiles')
                        .select('district_id')
                        .eq('id', options.userId)
                        .single() as any,
                    10000,
                    'Profile lookup timed out.'
                ) as { data: any };
                if (profileData?.district_id) {
                    let districtCalendarQuery = supabase
                        .from('academic_calendar')
                        .select('id, deadline_date, is_active')
                        .eq('school_year', options.schoolYear || getCurrentSchoolYear())
                        .eq('district_id', profileData.district_id)
                        .eq('term', activeTermNumber)
                        .eq('week_number', activeWeekNumber)
                        .eq('is_active', true);
                    if (options.calendarId) districtCalendarQuery = districtCalendarQuery.eq('id', options.calendarId);

                    const { data: calByDistrict } = await withTimeout(
                        districtCalendarQuery.maybeSingle() as any,
                        10000,
                        'Calendar lookup timed out.'
                    ) as { data: any };
                    if (calByDistrict) {
                        calendarId = calByDistrict.id;
                        calendarIsOpen = calByDistrict.is_active === true;
                        if (calByDistrict.deadline_date) deadlineDate = new Date(calByDistrict.deadline_date);
                    }
                }
            } else {
                calendarId = calEntry.id;
                calendarIsOpen = calEntry.is_active === true;
                if (calEntry.deadline_date) deadlineDate = new Date(calEntry.deadline_date);
            }
        } catch {
            // Calendar lookup is optional metadata. Expected network misses stay quiet
            // so upload attempts do not add noise to browser or provider logs.
        }
    }

    if (isWeeklyComplianceDocType(activeDocType) && (!calendarId || !calendarIsOpen)) {
        throw new Error(`Week ${activeWeekNumber || 'selected'} is closed for submissions. Uploads are locked after the Friday 11:59 PM deadline.`);
    }

    yield { phase: 'uploading', progress: 20, message: 'Preparing upload...' };

    yield { phase: 'uploading', progress: 40, message: 'Uploading...' };
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    if (!token) throw new Error('You have been signed out. Please sign in again and retry.');

    const contentType = 'application/pdf';
    const fileBlob = new Blob([stampedBytes as BlobPart], { type: contentType });
    if (fileBlob.size > MAX_UPLOAD_BYTES) {
        throw new Error(`This PDF is ${(fileBlob.size / 1024 / 1024).toFixed(1)}MB after stamping. Please compress it below ${MAX_UPLOAD_SIZE_MB}MB before uploading.`);
    }
    yield { phase: 'uploading', progress: 50, message: 'Uploading...' };
    let uploadResponse: { ok: boolean; status: number; body?: string } | null = null;
    let lastUploadError: any = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const formData = new FormData();
            formData.set('file', fileBlob, fileName);
            formData.set('key', filePath);

            uploadResponse = await xhrUpload('/api/storage/upload', formData, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                onProgress: options.onTransferProgress
            });

            if (uploadResponse.ok) break;
            if (uploadResponse.status === 401 || uploadResponse.status === 403) {
                throw new Error('You have been signed out. Please sign in again and retry.');
            }
            throw new Error(`B2 upload failed (${uploadResponse.status})`);
        } catch (err: any) {
            lastUploadError = err;
            if (attempt < 2) {
                const delay = 750 * 2 ** attempt + Math.floor(Math.random() * 250);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }

    if (!uploadResponse?.ok) {
        const message = lastUploadError?.message || 'Upload could not be completed.';
        throw new Error('Upload could not be completed after 3 attempts. Please try again.');
    }

    yield { phase: 'uploading', progress: 80, message: 'Finishing up...' };

    // Detect whether this is an ADDITIONAL DLL for an already-covered slot
    // (same teaching load + week + doc type). If so, mark it 'supplementary'
    // so it is archived but does not affect compliance / missing / late / rate.
    let complianceStatus: 'compliant' | 'late' | 'supplementary' = isWeeklyComplianceDocType(activeDocType)
        ? calculateComplianceStatus(new Date(), deadlineDate, options.subject, options.schoolName)
        : 'supplementary';
    if (isWeeklyComplianceDocType(activeDocType) && options.teachingLoadId && activeWeekNumber) {
      try {
        const { data: slotMatch } = await withTimeout(
          supabase
            .from('submissions')
            .select('id')
            .eq('teaching_load_id', options.teachingLoadId)
            .eq('week_number', activeWeekNumber)
            .eq('term_number', activeTermNumber)
            .eq('school_year', options.schoolYear || getCurrentSchoolYear())
            .in('compliance_status', ['compliant', 'late'])
            .in('doc_type', activeDocType === 'DLL' || activeDocType === 'DLP' ? ['DLL', 'DLP'] : [activeDocType])
            .limit(1) as any,
          30000,
          'Duplicate slot check timed out.'
        ) as { data: any };
        if (slotMatch && slotMatch.length > 0) {
          complianceStatus = 'supplementary';
        }
      } catch (e) {
        // Slot classification is advisory; upload should continue quietly.
      }
    }
    const { error: dbError } = await withTimeout(
        supabase.from('submissions').insert({
            user_id: options.userId,
            file_name: fileName,
            file_path: filePath,
            file_hash: fileHash,
            file_size: stampedBytes.byteLength,
            doc_type: activeDocType,
            term_number: activeTermNumber,
            week_number: activeWeekNumber,
            school_year: options.schoolYear || getCurrentSchoolYear(),
            subject: options.subject,
            calendar_id: calendarId,
            teaching_load_id: options.teachingLoadId || null,
            compliance_status: complianceStatus,
            raw_text: rawText || null
        }) as any,
        30000,
        'Database record timed out.'
    ) as { error: any };
    if (dbError) {
        throw new Error(`DB Error: ${dbError.message}`);
    }

    void logAudit(options.userId, 'upload.created', 'submission', undefined, {
        file_name: fileName,
        doc_type: activeDocType,
        teaching_load_id: options.teachingLoadId || null,
        term_number: activeTermNumber,
        week_number: activeWeekNumber,
        school_year: options.schoolYear || getCurrentSchoolYear(),
    });

    // Success bookkeeping
    if (options.teachingLoadId && activeWeekNumber) {
        await recordSubmission({
            teachingLoadId: options.teachingLoadId,
            termNumber: activeTermNumber,
            weekNumber: activeWeekNumber,
            schoolYear: options.schoolYear || getCurrentSchoolYear(),
            docType: activeDocType,
            fileHash,
            fileName,
            timestamp: Date.now(),
            status: 'synced'
        });
    }
    await cacheVerifiedDoc(fileHash, { file_name: fileName, doc_type: activeDocType, week_number: activeWeekNumber });

    yield {
        phase: 'done',
        progress: 100,
        message: 'Upload Successful!',
        result: { fileHash, filePath, fileSize: stampedBytes.byteLength, fileName }
    };
}

async function* runOfflinePipelineResilient(
    core: CoreResult,
    options: PipelineOptions
): AsyncGenerator<PipelineEvent> {
    const { stampedBytes, fileHash, fileName, filePath, activeTermNumber, activeWeekNumber, activeDocType, rawText } = core;

    // Progress mirrors the direct-upload path's stages and percentages so the
    // two are indistinguishable to the teacher — the outcome is the same
    // (document archived, stamped, and on its way to the server), only the
    // transfer is deferred. Wording stays truthful about what is happening at
    // each step rather than claiming a server round-trip that hasn't run yet.
    yield { phase: 'uploading', progress: 10, message: 'Checking your document...' };

    const { enqueue, cacheVerifiedDoc } = await import('./offline');
    const { recordSubmission } = await import('./offlineSubmissionLedger');

    yield { phase: 'uploading', progress: 20, message: 'Preparing upload...' };

    // No calendar lookup here. This path exists so the teacher never waits on
    // the network, and resolving calendar_id took up to three queries — on a
    // dead connection, 30s of bounded-but-real stalling before the document was
    // even queued. The sync in offline.ts already resolves calendar_id and the
    // deadline itself for any item queued without one, at a point where a
    // network call is expected, so nothing is lost by leaving it unset.
    const calendarId = options.calendarId || null;

    yield { phase: 'uploading', progress: 45, message: 'Uploading...' };

    await enqueue({
        fileName,
        filePath,
        fileHash,
        fileSize: stampedBytes.byteLength,
        pdfBytes: stampedBytes,
        rawText: rawText || undefined,
        options: {
            userId: options.userId,
            docType: activeDocType,
            termNumber: activeTermNumber,
            weekNumber: activeWeekNumber,
            schoolYear: options.schoolYear || getCurrentSchoolYear(),
            subject: options.subject,
            schoolName: options.schoolName,
            calendarId: calendarId ?? undefined,
            teachingLoadId: options.teachingLoadId
        },
        // The submission moment, not the sync moment. offline.ts computes
        // lateness from this, so a document handed in before the deadline
        // stays on time however long it waits for signal.
        timestamp: Date.now()
    });

    yield { phase: 'uploading', progress: 80, message: 'Finishing up...' };

    if (options.teachingLoadId && activeWeekNumber) {
        await recordSubmission({
            teachingLoadId: options.teachingLoadId,
            termNumber: activeTermNumber,
            weekNumber: activeWeekNumber,
            schoolYear: options.schoolYear || getCurrentSchoolYear(),
            docType: activeDocType,
            fileHash,
            fileName,
            timestamp: Date.now(),
            status: 'pending'
        });
    }

    await cacheVerifiedDoc(fileHash, { file_name: fileName, doc_type: activeDocType, week_number: activeWeekNumber, pending_sync: true });

    // Start pushing to the server right away rather than waiting for the 60s
    // heartbeat. Deliberately not awaited: the transfer is the slow part on a
    // phone, and the point of this path is that the teacher doesn't wait for
    // it. With no usable connection it simply no-ops, and the existing
    // reconnect/heartbeat/visibility triggers pick it up later.
    if (typeof navigator !== 'undefined' && navigator.onLine) {
        import('./offline')
            .then(({ processQueue }) => processQueue())
            .catch(() => {});
    }

    yield {
        phase: 'done',
        progress: 100,
        message: 'Upload Successful!',
        result: { fileHash, filePath, fileSize: stampedBytes.byteLength, fileName }
    };
}

export async function* runPipeline(
    file: File,
    options: PipelineOptions
): AsyncGenerator<PipelineEvent> {
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
    const worker = new PdfWorker();

    try {
        let core: CoreResult | null = null;
        for await (const event of runPipelineCore(file, options, worker)) {
            if (event._core) core = event._core;
            yield { phase: event.phase, progress: event.progress, message: event.message, metadata: event.metadata };
        }
        if (!core) throw new Error('Could not process this file. Please try a different file.');

        // Mobile always goes local-first: queue now, sync in the background.
        // Waiting on the transfer is the single thing that made mobile uploads
        // fail, and nothing about it has to be synchronous — the document is
        // already hashed and stamped by this point, and the queued item carries
        // its original submission timestamp so compliance is unaffected by how
        // long the sync takes.
        if (isMobileDevice()) {
            yield* runOfflinePipelineResilient(core, options);
            return;
        }

        if (isOnline) {
            // Desktop: upload directly, but don't let a failed transfer become
            // a dead end — fall back to the same background queue rather than
            // discarding the work with an error to retry from scratch.
            try {
                yield* runOnlinePipelineResilient(core, options);
                return;
            } catch (err: any) {
                const msg: string = err?.message || '';
                // Failures that queuing cannot fix must still surface: a real
                // duplicate is a genuine rejection, and a missing session means
                // the background sync would not be able to authenticate either.
                // Queuing can't fix either of these: the same document will be
                // refused whenever it syncs, and a missing session leaves the
                // background sync with nothing to authenticate with.
                const isTerminal = msg.includes('signed out');
                if (isTerminal) throw err;
            }
        }

        // Reached when genuinely offline, or when the direct upload above
        // could not get through.
        yield* runOfflinePipelineResilient(core, options);

    } catch (err: any) {
        yield { phase: 'error', progress: 0, message: err.message || 'Unknown error' };
    } finally {
        worker.terminate();
    }
}
