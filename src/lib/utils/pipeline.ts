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

import { transcodeToPdf } from './transcode';
import PdfWorker from './pdf.worker?worker';
import { compressFile } from './compress';
import { supabase } from './supabase';
import { env } from '$env/dynamic/public';
import { createNotification } from './notificationSystem';
import { getCurrentSchoolYear } from './schoolYear';
import { isMobileDevice } from './device';
import type { PipelineEvent, PipelineOptions } from '$lib/types/pipeline';
export type { PipelinePhase, PipelineResult } from '$lib/types/pipeline';

interface CoreResult {
    stampedBytes: Uint8Array;
    fileHash: string;
    fileName: string;
    filePath: string;
    detectedMetadata: any;
    activeWeekNumber?: number;
    activeDocType: string;
    rawText: string;
}

// ─── Worker Helper ───────────────────────────────────────────────────────────

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

// ─── Timeout Helper ──────────────────────────────────────────────────────────

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

// A single transient blip (brief signal drop, one dropped packet) on a bad
// mobile connection shouldn't fail the whole upload after already getting
// this far. Used only for calls whose failure is meant to be a hard stop
// (unlike the calendar lookups, which fail soft) — it retries the same
// bounded attempt once more before giving up for real.
async function withRetry<T>(fn: () => Promise<T>, attempts: number, delayMs: number): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
        }
    }
    throw lastErr;
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

// ─── Core Pipeline ───────────────────────────────────────────────────────────

async function* runPipelineCore(
    file: File,
    options: PipelineOptions,
    worker: Worker
): AsyncGenerator<PipelineEvent & { _core?: CoreResult }> {

    // Identity of a document is the bytes the teacher actually picked, hashed
    // before anything touches them.
    //
    // This used to be taken from the worker, which hashed whatever it was
    // handed — by then already transcoded and conditionally compressed — so
    // "the same document" produced a different hash on every upload and no
    // duplicate check could ever fire:
    //   .docx  -> converted through Google Apps Script, which stamps fresh
    //             PDF creation/modification dates into every conversion
    //   .jpg/.png -> wrapped by PDFDocument.create(), which sets those dates
    //             to now
    //   .pdf   -> passed through compressFile() or not, depending on
    //             connection speed and size, so even one file hashed two
    //             different ways on two different uploads
    //
    // The upload page's own pre-check already hashed the original file, so
    // the value it tested was never the value that got stored either.
    const originalBytes = new Uint8Array(await file.arrayBuffer());
    const fileHash = await sha256Hex(originalBytes);

    // 1. Transcode (Word to PDF)
    yield { phase: 'transcoding', progress: 10, message: 'Converting to PDF...' };
    let pdfBytes = file.type === 'application/pdf' ? originalBytes : (await transcodeToPdf(file)).pdfBytes;

    // 2. Mobile Optimization: Detect "Low-Power" or "Slow-Connection" state
    // Skip heavy compression if the file is already small to save CPU/Battery on mobile
    // effectiveType is one of 'slow-2g' | '2g' | '3g' | '4g'. Matching only
    // '2g' missed 'slow-2g' entirely — the very slowest class, i.e. exactly
    // the connection this branch exists to protect — and also treated a
    // crawling '3g' link as if it were fine.
    const effectiveType = (navigator as any).connection?.effectiveType;
    const isSlowConnection =
        effectiveType === 'slow-2g' ||
        effectiveType === '2g' ||
        effectiveType === '3g' ||
        (navigator as any).connection?.saveData === true;
    const isSmallEnough = pdfBytes.byteLength < 2 * 1024 * 1024; // 2MB

    if (isSlowConnection && isSmallEnough) {
        console.log('[pipeline] Low-power/Slow-connection detected. Skipping non-essential compression.');
        yield { phase: 'compressing', progress: 30, message: 'Preparing your file...' };
    } else {
        yield { phase: 'compressing', progress: 30, message: 'Preparing your file...' };
        pdfBytes = await compressFile(pdfBytes);
    }

    // 2.5. Analyzing (OCR) - Use converted PDF bytes for OCR, not the original file
    yield { phase: 'analyzing', progress: 30, message: 'Reading your document...' };
    const { extractMetadata } = await import('./ocr');
    const pdfBlob = new Blob([pdfBytes as BlobPart]);
    const ocrFile = file.type === 'application/pdf' ? file : new File([pdfBlob], file.name.replace(/\.\w+$/, '.pdf'), { type: 'application/pdf' });
    const hasPreDetected = options.preDetectedMetadata?.docType && options.preDetectedMetadata?.docType !== 'Unknown' && options.preDetectedMetadata?.rawText;
    const detectedMetadata = hasPreDetected ? options.preDetectedMetadata : await extractMetadata(ocrFile);

    // 3. Compress & Hash
    yield { phase: 'compressing', progress: 50, message: 'Securing your file...' };
    // Only the compressed bytes are taken from here. The worker also returns a
    // hash of what it was given, but that is post-processing bytes — the very
    // thing that made duplicate detection unreliable — so fileHash above,
    // taken from the original upload, is what identifies the document.
    const { compressedBytes } = await runWorkerTask(
        worker,
        'COMPRESS_AND_HASH',
        { pdfBytes },
        [pdfBytes.buffer]
    );

    // 4. Stamping
    yield { phase: 'stamping', progress: 70, message: 'Adding verification code...' };
    const { generateQrPng } = await import('./qr-stamp');
    const qrBytes = await generateQrPng(fileHash);
    const { stampedBytes } = await runWorkerTask(
        worker,
        'STAMP_QR',
        { compressedBytes, qrBytes, fileHash },
        [compressedBytes.buffer, qrBytes.buffer]
    );

    const activeWeekNumber = options.weekNumber || detectedMetadata?.weekNumber;
    const activeDocType = options.docType || detectedMetadata?.docType || 'DLL';
    const rawText = options.rawText || detectedMetadata?.rawText || '';
    const fileName = file.name.replace(/\.\w+$/, '.pdf');
    const sanitizedFileName = (fileName || 'document').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    const filePath = `submissions/${options.userId}/${activeDocType}/${Date.now()}_${sanitizedFileName}`;

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
                activeWeekNumber,
                activeDocType,
                rawText
            }
    };
}

// ─── Resilient Sub-Pipelines ─────────────────────────────────────────────────

async function* runOnlinePipelineResilient(
    core: CoreResult,
    options: PipelineOptions
): AsyncGenerator<PipelineEvent> {
    const { stampedBytes, fileHash, fileName, filePath, activeWeekNumber, activeDocType, rawText } = core;

    yield { phase: 'uploading', progress: 10, message: 'Checking your document...' };

    const { lookupOfflineDoc, cacheVerifiedDoc, calculateComplianceStatus } = await import('./offline');
    const { recordSubmission } = await import('./offlineSubmissionLedger');

    // Look up calendar_id + deadline from academic_calendar using detected week number.
    // This is metadata only — calculateComplianceStatus() already falls back
    // to 'compliant' when there's no deadline — so a slow/failed lookup must
    // never abort the whole upload. Each query is time-bounded (previously
    // unbounded, so a bad connection could hang here forever with no error),
    // and any failure (timeout or otherwise) is swallowed: the archive still
    // goes through, just without deadline-based lateness tracking for this
    // submission.
    let calendarId = options.calendarId || null;
    let deadlineDate: Date | undefined;
    if (!calendarId && activeWeekNumber) {
        try {
            const { data: calEntry } = await withTimeout(
                supabase
                    .from('academic_calendar')
                    .select('id, deadline_date')
                    .eq('school_year', options.schoolYear || getCurrentSchoolYear())
                    .eq('week_number', activeWeekNumber)
                    .maybeSingle() as any,
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
                    const { data: calByDistrict } = await withTimeout(
                        supabase
                            .from('academic_calendar')
                            .select('id, deadline_date')
                            .eq('district_id', profileData.district_id)
                            .eq('week_number', activeWeekNumber)
                            .maybeSingle() as any,
                        10000,
                        'Calendar lookup timed out.'
                    ) as { data: any };
                    if (calByDistrict) {
                        calendarId = calByDistrict.id;
                        if (calByDistrict.deadline_date) deadlineDate = new Date(calByDistrict.deadline_date);
                    }
                }
            } else {
                calendarId = calEntry.id;
                if (calEntry.deadline_date) deadlineDate = new Date(calEntry.deadline_date);
            }
        } catch (err: any) {
            console.warn('[pipeline] Calendar lookup failed/timed out, continuing without a deadline:', err?.message);
        }
    }

    yield { phase: 'uploading', progress: 20, message: 'Checking for duplicates...' };

    // Two different things, deliberately handled differently:
    //
    //   Same DOCUMENT (identical file hash) -> rejected. Re-submitting the very
    //   same file is never a new submission, and UNIQUE (file_hash) enforces it
    //   at the database besides.
    //
    //   Same SLOT (another DLL for a week/subject that already has one) ->
    //   accepted and marked 'supplementary' by the slot check further down.
    //   That's a legitimate additional document, and supplementary is excluded
    //   from compliance rate, upload totals and "missing" checks, so it can't
    //   distort any figure.
    if (await lookupOfflineDoc(fileHash)) {
        throw new Error('This exact document has already been uploaded. Choose a different file, or check My Files.');
    }

    // Cross-teacher check, via a narrow RPC rather than a direct table select
    // (see migrations/20260910_*.sql). A positive result rejects; a timeout is
    // advisory only and must not fail an upload the phone has already done
    // minutes of work for — UNIQUE (file_hash) still backstops it at insert.
    try {
        const { data: hashMatch } = await withRetry(
            () => withTimeout(
                supabase.rpc('check_duplicate_submission_hash', { p_hash: fileHash }).maybeSingle() as any,
                15000,
                'Server integrity check timed out.'
            ) as Promise<{ data: any }>,
            2,
            1500
        );
        if (hashMatch) throw new Error(`This exact document has already been uploaded (${hashMatch.file_name}).`);
    } catch (err: any) {
        if (err?.message?.startsWith('This exact document')) throw err;
        console.warn('[pipeline] Duplicate pre-check unavailable, continuing:', err?.message);
    }

    // ─── Server-Side Upload (CORS-Safe) with B2 Presigned Fallback ───
    yield { phase: 'uploading', progress: 40, message: 'Uploading...' };
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    if (!token) throw new Error('You have been signed out. Please sign in again and retry.');

    const contentType = 'application/pdf';
    const MAX_SERVER_UPLOAD = 4.4 * 1024 * 1024; // 4.4MB limit for Vercel (4.5MB - safety margin)
    // `stampedBytes` is a Uint8Array; `as Blob` is only a compile-time type
    // assertion and does NOT convert it at runtime. That left fileBlob.size
    // as undefined, so the size check below always evaluated to false and
    // EVERY upload — regardless of actual size — was misrouted to the
    // CORS-sensitive direct-to-B2 path instead of the safe server route.
    const fileBlob = new Blob([stampedBytes as BlobPart], { type: contentType });

    // Strategy 1: Try server-side upload first (avoids CORS entirely)
    let uploadSuccess = false;
    let uploadError: Error | null = null;

    console.log(`[pipeline] File size: ${(fileBlob.size / 1024 / 1024).toFixed(2)}MB, Max server: ${(MAX_SERVER_UPLOAD / 1024 / 1024).toFixed(2)}MB`);

    if (fileBlob.size <= MAX_SERVER_UPLOAD) {
        yield { phase: 'uploading', progress: 45, message: 'Uploading...' };
        try {
            const formData = new FormData();
            formData.append('file', fileBlob, 'document.pdf');
            formData.append('key', filePath);

            console.log('[pipeline] Starting server-side upload via /api/storage/upload');

            const serverUploadResponse = await xhrUpload('/api/storage/upload', formData, {
                headers: { 'Authorization': `Bearer ${token}` },
                onProgress: options.onTransferProgress
            });

            if (serverUploadResponse.ok) {
                uploadSuccess = true;
                console.log('[pipeline] ✅ Server-side upload succeeded (CORS-safe, no B2 needed)');
            } else {
                uploadError = new Error(`Server upload HTTP ${serverUploadResponse.status}: ${serverUploadResponse.body || 'request failed'}`);
                console.warn('[pipeline] Server upload failed, retrying with B2...', uploadError);
            }
        } catch (err: any) {
            uploadError = err;
            console.warn('[pipeline] Server upload error, falling back to B2...', err.message);
        }
    } else {
        uploadError = new Error(`File size ${(fileBlob.size / 1024 / 1024).toFixed(2)}MB exceeds server limit`);
        console.log(`[pipeline] ${uploadError.message}. Using B2 presigned URL...`);
    }

    // Strategy 2: Fallback to B2 presigned URL if server upload failed or file too large
    if (!uploadSuccess) {
        yield { phase: 'uploading', progress: 50, message: 'Uploading...' };
        try {
            const presignResponse = await withTimeout(
                fetch('/api/storage/presign', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ key: filePath, contentType, intent: 'upload' })
                }),
                30000,
                'Pre-signed URL request timed out.'
            );

            if (!presignResponse.ok) {
                let errStr = presignResponse.statusText;
                try {
                    const errJson = await presignResponse.json();
                    errStr = errJson.message || errStr;
                } catch { /* ignore */ }
                throw new Error(`Pre-signed URL failed (${presignResponse.status}): ${errStr}`);
            }

            const { url: presignedUrl } = await presignResponse.json();
            const uploadResponse = await xhrUpload(presignedUrl, fileBlob, {
                method: 'PUT',
                headers: { 'Content-Type': contentType },
                onProgress: options.onTransferProgress
            });

            if (!uploadResponse.ok) {
                let errStr = `HTTP ${uploadResponse.status}`;
                try {
                    const errJson = JSON.parse(uploadResponse.body);
                    errStr = errJson.message || errStr;
                } catch { /* ignore */ }

                if (errStr.includes('CORS') || errStr.includes('Access')) {
                    console.error('[pipeline] B2 CORS not configured for this origin — see DEPLOYMENT_FIXES.md');
                    throw new Error('Could not reach the storage service. Please try again.');
                }
                console.error(`[pipeline] Archive upload failed (${uploadResponse.status}): ${errStr}`);
                throw new Error('Upload could not be completed. Please try again.');
            }

            uploadSuccess = true;
            console.log('[pipeline] B2 presigned URL upload succeeded');
        } catch (err: any) {
            const msg = err.message || 'Upload failed';
            if (msg.includes('CORS')) {
                console.error('[pipeline] B2 bucket CORS configuration needed for this origin');
                throw new Error('Could not reach the storage service. Please try again.');
            }
            throw err;
        }
    }

    if (!uploadSuccess) {
        throw new Error('Upload could not be completed. Please check your connection and try again.');
    }

    // DB Record
    yield { phase: 'uploading', progress: 80, message: 'Finishing up...' };

    // Detect whether this is an ADDITIONAL DLL for an already-covered slot
    // (same teaching load + week + doc type). If so, mark it 'supplementary'
    // so it is archived but does not affect compliance / missing / late / rate.
    let complianceStatus: 'compliant' | 'late' | 'supplementary' = calculateComplianceStatus(new Date(), deadlineDate);
    if (options.teachingLoadId && activeWeekNumber) {
      try {
        const { data: slotMatch } = await withTimeout(
          supabase
            .from('submissions')
            .select('id')
            .eq('teaching_load_id', options.teachingLoadId)
            .eq('week_number', activeWeekNumber)
            .eq('doc_type', activeDocType)
            .limit(1) as any,
          30000,
          'Duplicate slot check timed out.'
        ) as { data: any };
        if (slotMatch && slotMatch.length > 0) {
          complianceStatus = 'supplementary';
        }
      } catch (e) {
        console.warn('[pipeline] Duplicate slot check failed, continuing as normal:', e);
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
    // 23505 = unique_violation on file_hash — the backstop for the same
    // document being submitted twice when the pre-checks above couldn't reach
    // the server. Note this cannot fire for an additional DLL on an existing
    // week/subject: that's a different file, so a different hash, and it is
    // archived as supplementary.
    if (dbError) {
        if (dbError.code === '23505') {
            throw new Error('This exact document has already been uploaded. Choose a different file, or check My Files.');
        }
        throw new Error(`DB Error: ${dbError.message}`);
    }

    // Success bookkeeping
    if (options.teachingLoadId && activeWeekNumber) {
        await recordSubmission({
            teachingLoadId: options.teachingLoadId,
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

    // Same reasoning as the queued path: the file is uploaded and the row is
    // inserted by this point, so a convenience notification — two more un-timed
    // network calls — must not hold back the success the teacher is waiting on.
    createNotification(options.userId, 'Archival Successful', `Securely archived ${activeDocType} - Week ${activeWeekNumber}.`, 'success')
        .catch((e) => console.warn('[pipeline] Notification write failed:', e));

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
    const { stampedBytes, fileHash, fileName, filePath, activeWeekNumber, activeDocType, rawText } = core;

    // Progress mirrors the direct-upload path's stages and percentages so the
    // two are indistinguishable to the teacher — the outcome is the same
    // (document archived, stamped, and on its way to the server), only the
    // transfer is deferred. Wording stays truthful about what is happening at
    // each step rather than claiming a server round-trip that hasn't run yet.
    yield { phase: 'uploading', progress: 10, message: 'Checking your document...' };

    const { enqueue, cacheVerifiedDoc, lookupOfflineDoc } = await import('./offline');
    const { recordSubmission } = await import('./offlineSubmissionLedger');

    // Matches the direct path: the same document is refused here, before it can
    // enter the queue, so the teacher is told straight away rather than at sync
    // time. An additional DLL for a week/subject that already has one is a
    // different file, so it passes this check and the sync-time slot check
    // marks it 'supplementary'.
    yield { phase: 'uploading', progress: 20, message: 'Checking for duplicates...' };
    if (await lookupOfflineDoc(fileHash)) {
        throw new Error('This exact document has already been uploaded. Choose a different file, or check My Files.');
    }

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
            weekNumber: activeWeekNumber,
            schoolYear: options.schoolYear || getCurrentSchoolYear(),
            subject: options.subject,
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

    // Reported exactly as the direct-upload path reports it. The submission is
    // recorded, stamped and queued, and syncs on its own with the original
    // timestamp preserved — so from the teacher's side this genuinely is the
    // same outcome, and surfacing a different one only caused confusion about
    // whether the document had actually been submitted.
    //
    // NOT awaited. createNotification() makes two un-timed network calls
    // (auth.getUser, then the notifications insert), so awaiting it here parked
    // this path on the network at 80% "Finalizing submission record..." — in a
    // path whose entire purpose is never to wait on the network. The document
    // is already queued and safe by this point; a convenience notification must
    // never gate reporting that.
    createNotification(options.userId, 'Archival Successful', `Securely archived ${activeDocType} - Week ${activeWeekNumber}.`, 'success')
        .catch((e) => console.warn('[pipeline] Notification write failed:', e));

    // Start pushing to the server right away rather than waiting for the 60s
    // heartbeat. Deliberately not awaited: the transfer is the slow part on a
    // phone, and the point of this path is that the teacher doesn't wait for
    // it. With no usable connection it simply no-ops, and the existing
    // reconnect/heartbeat/visibility triggers pick it up later.
    if (typeof navigator !== 'undefined' && navigator.onLine) {
        import('./offline')
            .then(({ processQueue }) => processQueue())
            .catch((e) => console.warn('[pipeline] Background sync kickoff failed:', e));
    }

    yield {
        phase: 'done',
        progress: 100,
        message: 'Upload Successful!',
        result: { fileHash, filePath, fileSize: stampedBytes.byteLength, fileName }
    };
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

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
                const isTerminal =
                    msg.includes('already been uploaded') ||
                    msg.includes('signed out');
                if (isTerminal) throw err;

                console.warn('[pipeline] Direct upload failed, falling back to background sync:', msg);
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
