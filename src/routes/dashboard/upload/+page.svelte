<script lang="ts">
    import FileDropZone from "$lib/components/FileDropZone.svelte";
    import UploadProgress from "$lib/components/UploadProgress.svelte";
    import {
        runPipeline,
        type PipelinePhase,
        type PipelineResult,
    } from "$lib/utils/pipeline";
    import {
        getQueueSize,
        getQueueItems,
        processQueue,
        cacheMetadata,
        getCachedMetadata,
        pendingSyncCount,
    } from "$lib/utils/offline";
    import {
        syncLedgerFromServer,
        type LedgerEntry,
    } from "$lib/utils/offlineSubmissionLedger";
    import { profile, type Profile } from "$lib/utils/auth";
    import { isMobileDevice } from "$lib/utils/device";
    import { settings } from "$lib/stores/settings";
    import { connectivity } from "$lib/stores/connectivity";
    import { addToast } from "$lib/stores/toast";
    import { supabase } from "$lib/utils/supabase";
    import { goto } from "$app/navigation";
    import { onMount, untrack } from "svelte";
    import { fade } from "svelte/transition";
    import CEDIMSLoader from "$lib/components/CEDIMSLoader.svelte";
    import { extractMetadata, type DocMetadata } from "$lib/utils/ocr";
    import { predictLoad, validateSelection } from "$lib/utils/copilot";
    import {
        canUploadDocument,
        getAllowedUploadDocTypes,
        getUploadGuidance,
        requiresTeachingLoadSelection,
    } from "$lib/utils/documentPermissions";
    import { focusTrap } from "$lib/actions/focusTrap";
    import UploadSuccessModal from "$lib/components/UploadSuccessModal.svelte";

    import type { PageData } from "./$types";

    let { data } = $props<{ data: PageData }>();

    interface TeachingLoad {
        id: string;
        subject: string;
        grade_level: string;
    }

    let selectedFile = $state<File | null>(null);
    let docType = $state("DLL");
    let allowedDocTypes = $state<string[]>([]);
    let subject = $state("");
    let weekNumber = $state<number | undefined>();
    let teachingLoadId = $state<string>("");
    let teachingLoads = $state<TeachingLoad[]>([]);
    let loadingTeachingLoads = $state(true);
    let currentPhase = $state<PipelinePhase>("transcoding");
    let progress = $state(0);
    let message = $state("");
    let processing = $state(false);
    let result = $state<PipelineResult | null>(null);
    let showSuccessModal = $state(false);
    let mismatchAlert = $state<any>(null);
    let queueCount = $state(0);
    let currentDeadline = $state<any>(null);
    let submissionAlreadyExists = $state(false);
    let submissionBlockReason = $state("");
    let ocrConfidence = $state<number | null>(null);
    let fileSizeWarning = $state(false);
    let detectingMetadata = $state(false);
    let detectedMetadata = $state<any>(null);
    let fileHash = $state<string>("");
    // Online/Offline Mode
    let isOnline = $state(
        typeof navigator !== "undefined" ? navigator.onLine : true,
    );
    const isMobile = isMobileDevice();
    let pendingItems = $state<any[]>([]);
    let showPendingPanel = $state(false);

    // Selection Pickers
    let showLoadPicker = $state(false);
    let showWeekPicker = $state(false);
    let academicWeeks = $state<number[]>([]);

    // Watch for changes that could invalidate uniqueness
    $effect(() => {
        if (teachingLoadId && weekNumber && docType && $profile) {
            checkExistingSubmission();
        } else if (fileHash) {
            checkExistingSubmission();
        } else {
            submissionAlreadyExists = false;
            submissionBlockReason = "";
        }
    });

    async function checkExistingSubmission() {
        // Check 1: Hash uniqueness (highest priority - blocks content regardless of slot)
        if (fileHash) {
            const { hasHash } = await import(
                "$lib/utils/offlineSubmissionLedger"
            );
            const localMatch = await hasHash(fileHash);
            if (localMatch) {
                submissionAlreadyExists = true;
                submissionBlockReason = `Duplicate content: This file was already archived as "${localMatch.fileName}" (${localMatch.docType}, Week ${localMatch.weekNumber})`;
                return;
            }

            if (navigator.onLine) {
                // Cross-teacher duplicate check — needs to see whether ANY
                // user already archived this hash, not just the current
                // uploader's own rows, so it goes through a narrow RPC rather
                // than a direct table select (see migrations/20260910_*.sql).
                const { data: serverHashMatch } = (await supabase
                    .rpc("check_duplicate_submission_hash", { p_hash: fileHash })
                    .maybeSingle()) as {
                    data: { id: string; file_name: string; doc_type: string; week_number: number | null } | null;
                };

                if (serverHashMatch) {
                    submissionAlreadyExists = true;
                    // Check whether the archived file has already been approved
                    const { data: review } = await supabase
                        .from("dll_reviews")
                        .select("status")
                        .eq("submission_id", serverHashMatch.id)
                        .maybeSingle();

                    if (review?.status === "approved") {
                        submissionBlockReason = `Already approved (Checked): This file was approved as "${serverHashMatch.file_name}" (${serverHashMatch.doc_type}, Week ${serverHashMatch.week_number}). It has already been checked and approved, so it should not be re-uploaded.`;
                    } else if (review?.status === "returned") {
                        submissionBlockReason = `Duplicate content: This file was already archived and returned as "${serverHashMatch.file_name}" (${serverHashMatch.doc_type}, Week ${serverHashMatch.week_number}).`;
                    } else {
                        submissionBlockReason = `Duplicate content: Already archived on server as "${serverHashMatch.file_name}" (${serverHashMatch.doc_type}, Week ${serverHashMatch.week_number}).`;
                    }
                    return;
                }
            }
        }

        // No slot uniqueness check â€” multiple uploads per week are allowed.
        // Only hash deduplication (above) is enforced.
        submissionAlreadyExists = false;
    }

    // Watch weekNumber and fetch deadline
    $effect(() => {
        if (weekNumber && $profile?.district_id) {
            fetchCurrentDeadline(weekNumber, $profile.district_id);
        } else {
            currentDeadline = null;
        }
    });

    async function fetchCurrentDeadline(wk: number, districtId: string) {
        if (navigator.onLine) {
            const { data } = await supabase
                .from("academic_calendar")
                .select("deadline_date, description")
                .eq("district_id", districtId)
                .eq("week_number", wk)
                .maybeSingle();

            if (data) {
                currentDeadline = data;
                // Update specific cache entry if needed or just rely on the batch pre-fetch
                return;
            }
        }

        // Offline Fallback
        const cached = await getCachedMetadata(`calendar_open_${districtId}`);
        if (cached?.data) {
            const entry = cached.data.find(
                (e: any) => e.week_number === wk && e.is_active === true,
            );
            if (entry) {
                currentDeadline = entry;
                console.log("[upload] Using cached deadline for week", wk);
            }
        }
    }

    // Mobile Optimization: Multi-stage library pre-warming
    // Hides the 2-5s loading delay of heavy workers on mobile
    async function preWarmLibraries() {
        if (typeof window === "undefined") return;
        console.log("[upload] Pre-warming heavy libraries...");

        // 1. PDF.js â€” pre-load from CDN so OCR can use it immediately
        if (!(window as any).pdfjsLib) {
            console.log("[upload] Fetching PDF.js...");
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js";
            script.onload = () => {
                (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
                    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
                console.log("[upload] PDF.js loaded.");
            };
            document.head.appendChild(script);
        }

        // 2. Tesseract.js (Dynamic import)
        try {
            const { createWorker } = await import("tesseract.js");
            // Just the import is often enough to trigger Service Worker caching
            console.log("[upload] Tesseract.js pre-warmed.");
        } catch (e) {
            console.warn("[upload] Pre-warm failed:", e);
        }
    }

    // Keep this page's pending-sync panel in sync with the shared queue store
    // the instant it changes (e.g. right after a background sync finishes
    // elsewhere), instead of only refreshing on this page's own online/mount
    // events. This also provides the initial fetch on mount.
    $effect(() => {
        $pendingSyncCount;
        refreshPendingItems();
    });

    onMount(() => {
        // Delay pre-warming slightly to not block initial page render
        setTimeout(preWarmLibraries, 3000);

        // Track online/offline state
        const onOnline = () => {
            isOnline = true;
            refreshPendingItems();
        };
        const onOffline = () => {
            isOnline = false;
        };
        window.addEventListener("online", onOnline);
        window.addEventListener("offline", onOffline);

        // Handle files launched from OS (PWA File Handling API)
        if (
            "launchQueue" in window &&
            "setConsumer" in (window as any).launchQueue
        ) {
            (window as any).launchQueue.setConsumer((launchParams: any) => {
                if (launchParams.files.length > 0) {
                    launchParams.files[0].getFile().then((file: File) => {
                        selectedFile = file;
                        addToast("info", `Opened from system: ${file.name}`);
                    });
                }
            });
        }

        return () => {
            window.removeEventListener("online", onOnline);
            window.removeEventListener("offline", onOffline);
        };
    });

    async function refreshPendingItems() {
        queueCount = await getQueueSize();
        if (queueCount > 0) {
            const items = await getQueueItems();
            pendingItems = items.map((item) => ({
                fileName: item.fileName,
                fileHash: item.fileHash,
                docType: item.options.docType || "DLL",
                weekNumber: item.options.weekNumber,
                teachingLoadId: item.options.teachingLoadId,
                timestamp: item.timestamp,
            }));
        } else {
            pendingItems = [];
        }
    }

    // Handle shared file from the server-side hint (Share Target)
    $effect(() => {
        if (data.sharedFile?.isShared) {
            addToast(
                "info",
                `Received shared file: ${data.sharedFile.name}. Please confirm your selection below.`,
            );
        }
    });

    // Reactive data fetching triggered when profile is available
    let dataLoadedForProfile = $state<string | null>(null);

    $effect(() => {
        if ($profile && dataLoadedForProfile !== $profile.id) {
            untrack(() => {
                // District Supervisors cannot upload - redirect to archive
                if ($profile!.role === 'District Supervisor') {
                    addToast('info', 'District Supervisors use the Archives tab to review submissions and add remarks.');
                    goto('/dashboard/archive');
                    return;
                }
                fetchInitialData($profile!);
                dataLoadedForProfile = $profile!.id;
            });
        }
    });

    $effect(() => {
        if ($profile?.role) {
            const types = getAllowedUploadDocTypes($profile.role);
            untrack(() => { allowedDocTypes = types; });
            if (!types.includes(untrack(() => docType))) {
                docType = types[0] || "DLL";
            }
        }
    });

    // Sync subject from selected teaching load
    $effect(() => {
        if (teachingLoadId && teachingLoads.length > 0) {
            const load = teachingLoads.find(l => l.id === teachingLoadId);
            if (load?.subject) {
                subject = load.subject;
            }
        } else if (!teachingLoadId) {
            subject = "";
        }
    });

    async function fetchInitialData(userProfile: Profile) {
        loadingTeachingLoads = true;

        // 1. Fetch teaching loads
        let loads: TeachingLoad[] = [];
        if (navigator.onLine) {
            const { data, error } = await supabase
                .from("teaching_loads")
                .select("id, subject, grade_level")
                .eq("user_id", userProfile.id)
                .eq("is_active", true)
                .order("subject, grade_level");

            if (!error && data) {
                loads = data;
                cacheMetadata(`teaching_loads_${userProfile.id}`, data);
            } else if (error) {
                console.error(
                    "[upload] Online fetch teaching loads error:",
                    error.message,
                );
            }
        }

        if (loads.length === 0) {
            const cached = await getCachedMetadata(
                `teaching_loads_${userProfile.id}`,
            );
            if (cached?.data) {
                loads = cached.data;
                console.log("[upload] Using cached teaching loads");
            }
        }

        if (loads.length > 0) {
            teachingLoads = loads;
            if (!teachingLoadId) {
                teachingLoadId = teachingLoads[0].id;
            }
        } else {
            teachingLoads = [];
            teachingLoadId = "";
            weekNumber = undefined;
            // Only show error if uploading DLL (which requires teaching load)
            // School Head and Master Teacher uploading ISP/ISR don't need teaching loads
            if (navigator.onLine && docType === 'DLL') {
                addToast("error", "No teaching loads found. Please configure at least one teaching load before uploading DLL documents.");
            }
        }

        // 2. Fetch academic weeks / calendar
        if (userProfile.district_id) {
            let calendarEntries: any[] = [];

            // Try cache first for immediate UI
            const cacheKey = `calendar_open_${userProfile.district_id}`;
            const cachedCal = await getCachedMetadata(cacheKey);
            if (cachedCal?.data) {
                calendarEntries = (cachedCal.data as any[]).filter(
                    (w) => w.is_active === true,
                );
                academicWeeks = calendarEntries.map((w) => w.week_number);
                console.log("[upload] Loaded calendar from cache");
            }

            // Sync with online if possible
            if (navigator.onLine) {
                const { data, error } = await supabase
                    .from("academic_calendar")
                    .select("week_number, deadline_date, description, is_active")
                    .eq("district_id", userProfile.district_id)
                    .eq("is_active", true)
                    .order("week_number", { ascending: true });

                if (!error && data) {
                    calendarEntries = data;
                    academicWeeks = data.map((w) => w.week_number);
                    cacheMetadata(cacheKey, data);
                } else if (error) {
                    console.error(
                        "[upload] Online fetch calendar error:",
                        error.message,
                    );
                }
            }

            // Auto-detect current week only when teaching loads are available
            if (
                teachingLoads.length > 0 &&
                calendarEntries.length > 0 &&
                !weekNumber
            ) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const sorted = [...calendarEntries]
                    .filter((e) => e.deadline_date)
                    .sort(
                        (a, b) =>
                            new Date(a.deadline_date).getTime() -
                            new Date(b.deadline_date).getTime(),
                    );

                const currentEntry = sorted.find((e) => {
                    const deadline = new Date(e.deadline_date);
                    deadline.setHours(23, 59, 59, 999);
                    return deadline >= today;
                });

                if (currentEntry) {
                    weekNumber = currentEntry.week_number;
                } else if (sorted.length > 0) {
                    weekNumber = sorted[sorted.length - 1].week_number;
                }
            }
        }

        if (navigator.onLine) {
            try {
                await syncLedgerFromServer(userProfile.id);

            } catch (err) {
                console.warn("[upload] Sync context fetch error:", err);
            }
        }

        loadingTeachingLoads = false;
    }

    function mapTeachingLoad(metadata: Partial<DocMetadata>): string {
        if (!metadata.subject) return teachingLoadId;

        const sub = metadata.subject.toUpperCase();
        const grade = metadata.gradeLevel;

        // Try exact subject match first
        const exactMatch = teachingLoads.find(
            (l) =>
                l.subject.toUpperCase() === sub &&
                (!grade || l.grade_level === grade),
        );
        if (exactMatch) return exactMatch.id;

        // Try subject name contains or common mappings
        const fuzzyMatch = teachingLoads.find((l) => {
            const loadSub = l.subject.toUpperCase();
            // GMRC / EsP mapping
            if (sub === "GMRC" || sub.includes("PAGPAPAKATAO")) {
                return (
                    loadSub === "GMRC" ||
                    loadSub.includes("ESP") ||
                    loadSub.includes("VALUES")
                );
            }
            // AP mapping
            if (sub === "AP" || sub.includes("PANLIPUNAN")) {
                return loadSub === "AP" || loadSub.includes("SOCIAL");
            }
            return loadSub.includes(sub) || sub.includes(loadSub);
        });

        return fuzzyMatch ? fuzzyMatch.id : "";
    }

    function parseDocDate(dateStr: string | null): Date | null {
        if (!dateStr) return null;
        try {
            console.log("[upload] Attempting to parse date from:", dateStr);
            // Extract the month and day part using regex to ignore any surrounding garbage
            const match = dateStr.match(
                /(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[a-zA-Z]*\s+\d{1,2}/i,
            );

            if (!match) {
                console.log(
                    "[upload] Could not find Month Day pattern in string",
                );
                return null;
            }

            const cleaned = match[0];
            const yearMatch = dateStr.match(/\d{4}/);
            const year = yearMatch
                ? yearMatch[0]
                : new Date().getFullYear().toString();

            const finalDateStr = `${cleaned}, ${year}`;
            console.log("[upload] Parsed clean date string:", finalDateStr);

            const d = new Date(finalDateStr);
            return isNaN(d.getTime()) ? null : d;
        } catch (e) {
            console.error("[upload] Date parse error:", e);
            return null;
        }
    }

    async function lookupWeekByDate(date: Date, districtId: string) {
        // Find the week where this document's date is between (deadline - 10 days) and (deadline)
        // This prevents dates from months ago jumping forward to the first future deadline.
        const isoDate = date.toISOString();

        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 10);
        const isoEndDate = endDate.toISOString();

        console.log(
            `[upload] Looking up week between: ${isoDate} and ${isoEndDate}, district: ${districtId}`,
        );

        const { data, error } = await supabase
            .from("academic_calendar")
            .select("week_number, deadline_date")
            .gte("deadline_date", isoDate)
            .lte("deadline_date", isoEndDate)
            .eq("district_id", districtId)
            .eq("is_active", true)
            .order("deadline_date", { ascending: true })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error("[upload] Calendar lookup error:", error);
            return null;
        }

        console.log(`[upload] Lookup result:`, data);
        return data ? data.week_number : null;
    }

    async function onFileSelected(file: File) {
        if ($settings.maintenance_mode) {
            addToast(
                "error",
                "System is currently under maintenance. Uploads are disabled.",
            );
            return;
        }
        selectedFile = file;
        result = null;
        ocrConfidence = null;
        fileSizeWarning =
            file.size > $settings.max_upload_size_mb * 1024 * 1024;

        // Start Smart Detection
        detectingMetadata = true;
        try {
            const ext = file.name.split('.').pop()?.toLowerCase();
            let ocrTarget = file;
            if ((ext === 'docx' || ext === 'doc') && navigator.onLine) {
                const session = await supabase.auth.getSession();
                const token = session.data.session?.access_token;
                if (token) {
                    const formData = new FormData();
                    formData.append('file', file);
                    const res = await fetch('/api/convert', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData
                    });
                    if (res.ok) {
                        const pdfBlob = await res.blob();
                        ocrTarget = new File([pdfBlob], file.name.replace(/\.\w+$/, '.pdf'), { type: 'application/pdf' });
                    }
                }
            }
            const metadata = await extractMetadata(ocrTarget);
            console.log("[upload] OCR metadata result:", metadata);
            detectedMetadata = metadata;

            if (metadata.docType !== "Unknown") {
                docType = metadata.docType;
            }

            // Only auto-fill week number and teaching load for DLL documents
            if (docType === "DLL") {
                if (metadata.weekNumber) {
                    weekNumber = metadata.weekNumber;
                } else if (metadata.date && $profile?.district_id) {
                    const docDate = parseDocDate(metadata.date);
                    if (docDate) {
                        const derivedWeek = await lookupWeekByDate(
                            docDate,
                            $profile.district_id,
                        );
                        if (derivedWeek) {
                            weekNumber = derivedWeek;
                            console.log(
                                `[upload] Derived week ${weekNumber} from date ${metadata.date}`,
                            );
                        }
                    }
                }

                const mappedId =
                    predictLoad(metadata.rawText, teachingLoads) ||
                    mapTeachingLoad(metadata);
                if (mappedId) teachingLoadId = mappedId;
            }

            if (metadata.confidence) {
                ocrConfidence = metadata.confidence;
            }

            // Check for initial mismatch
            if (teachingLoadId) {
                mismatchAlert = validateSelection(
                    teachingLoadId,
                    metadata.rawText,
                    teachingLoads,
                );
            }

            const { speak } = await import("$lib/utils/voiceGuide");
            speak("Smart detection complete. Fields updated.");
        } catch (err) {
            console.error("[upload] OCR error:", err);
        } finally {
            detectingMetadata = false;
        }

        // START: Hash Calculation for Early Duplicate Detection
        try {
            const buffer = await file.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            fileHash = hashArray
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
            console.log("[upload] Early hash calculation complete:", fileHash);
            // checkExistingSubmission is triggered via $effect
        } catch (hashErr) {
            console.warn("[upload] Early hash calculation failed:", hashErr);
        }
    }

    /** Auto-wait for profile + teaching loads to finish loading (polls every 200ms) */
    function waitForDataReady(timeoutMs: number): Promise<boolean> {
        return new Promise((resolve) => {
            const start = Date.now();
            const check = () => {
                // Only wait for the loading FLAGS, not the selection itself
                if ($profile && !loadingTeachingLoads) {
                    resolve(true);
                } else if (Date.now() - start > timeoutMs) {
                    resolve(false);
                } else {
                    setTimeout(check, 200);
                }
            };
            check();
        });
    }
    async function handleUpload() {
        if ($settings.maintenance_mode) {
            addToast(
                "error",
                "System maintenance is active. Upload cancelled.",
            );
            return;
        }
        if (!selectedFile) {
            addToast("error", "Please select a file to upload");
            return;
        }

        // Auto-wait for profile and teaching load list to be ready (up to 5s)
        if (loadingTeachingLoads || !$profile) {
            addToast("info", "Syncing data, please wait...");
            const ready = await waitForDataReady(15000);
            if (!ready) {
                addToast("error", "Timeout: Could not sync profile data.");
                return;
            }
        }

        if (!canUploadDocument($profile?.role || '', docType)) {
            addToast("error", getUploadGuidance($profile?.role || ''));
            return;
        }

        if (requiresTeachingLoadSelection($profile?.role || '', docType) && !teachingLoadId) {
            addToast("error", "Please select a teaching load before uploading");
            showLoadPicker = true;
            return;
        }

        // Block Word files when offline (GAS needs internet)
        if (!isOnline) {
            const ext = selectedFile.name.split('.').pop()?.toLowerCase();
            if (ext === 'docx' || ext === 'doc') {
                addToast("error", "Word document conversion requires an internet connection. Please upload a PDF or connect to the internet.");
                return;
            }
        }

        processing = true;
        result = null;

        const { speak, VoicePrompts } = await import("$lib/utils/voiceGuide");
        speak(VoicePrompts.UPLOAD_START);

        // Select the appropriate pipeline based on connectivity
        const pipelineOptions = {
            userId: $profile!.id,
            docType,
            subject: subject || undefined,
            weekNumber,
            teachingLoadId,
            enforceOcr: $settings.enforce_ocr,
            submissionWindowDays: $settings.submission_window_days,
            preDetectedMetadata: detectedMetadata,
            // Show real bytes-sent during the transfer. Without this the bar
            // parks at one number for the whole upload, which on a slow phone
            // connection is minutes of UI that looks identical to a hang.
            onTransferProgress: (loaded: number, total: number) => {
                if (!total) return;
                const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
                progress = 50 + Math.round((loaded / total) * 30);
                message = `Uploading… ${mb(loaded)} MB of ${mb(total)} MB`;
            },
        };

        // The pipeline runs for minutes on a phone. Without a wake lock, a
        // dimming screen or an app switch mid-upload gets the page throttled
        // and its in-flight requests suspended, which surfaced as spurious
        // "timed out" failures on requests that never got to run.
        const { acquireWakeLock, releaseWakeLock } = await import("$lib/utils/wakeLock");
        await acquireWakeLock();

        try {
            const pipeline = runPipeline(selectedFile, pipelineOptions);

            for await (const event of pipeline) {
                currentPhase = event.phase;
                progress = event.progress;
                message = event.message;

                if (event.metadata) {
                    if (event.metadata.docType !== "Unknown")
                        docType = event.metadata.docType;
                    if (event.metadata.weekNumber)
                        weekNumber = event.metadata.weekNumber;
                    if (event.metadata.confidence !== undefined)
                        ocrConfidence = event.metadata.confidence;
                    const { speak } = await import("$lib/utils/voiceGuide");
                    speak("Smart detection complete. Details updated.");
                }

                if (event.phase === "done" && event.result) {
                    result = event.result;
                    showSuccessModal = true;
                    speak(VoicePrompts.UPLOAD_COMPLETE);
                    selectedFile = null;
                    await refreshPendingItems();
                    connectivity.refreshPendingCount();
                }

                if (event.phase === "error") {
                    const { speak, VoicePrompts } = await import(
                        "$lib/utils/voiceGuide"
                    );
                    speak(VoicePrompts.ERROR);
                    addToast("error", event.message);
                }
            }
        } finally {
            await releaseWakeLock();
            processing = false;
        }

        await refreshPendingItems();
    }

    // Reactively validate selection mismatch
    $effect(() => {
        if (teachingLoadId && detectedMetadata?.rawText) {
            mismatchAlert = validateSelection(
                teachingLoadId,
                detectedMetadata.rawText,
                teachingLoads,
            );
        } else {
            mismatchAlert = null;
        }
    });

    function closeSuccessModal() {
        showSuccessModal = false;
    }

    function handleUploadAnother() {
        showSuccessModal = false;
        result = null;
        detectedMetadata = null;
        ocrConfidence = null;
        fileHash = "";
    }

    function handleViewArchive() {
        showSuccessModal = false;
        goto("/dashboard/archive");
    }
</script>

<svelte:head>
    <title>Upload Document â€” CEDIMS</title>
</svelte:head>

<div>
    <!-- Header -->
    <div
        class="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
    >
        <div>
            <h1
                class="text-2xl font-bold text-text-primary flex items-center gap-2"
            >
                Upload Document <span
                    class="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-normal border
                    {isOnline
                        ? 'bg-gov-green/5 text-gov-green border-gov-green/10'
                        : 'bg-gov-gold/10 text-gov-gold-dark border-gov-gold/20'}"
                    >{isOnline ? "Online" : "Offline"}</span
                >
            </h1>
            <p class="text-base text-text-secondary mt-1">
                {isOnline
                    ? "Submit your DLL, ISP, or ISR for archival"
                    : "Files will be saved locally and synced when online"}
            </p>
            {#if currentDeadline}
                <div
                    class="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gov-blue/5 border border-gov-blue/10 text-xs font-semibold text-gov-blue"
                >
                    Deadline: {new Date(
                        currentDeadline.deadline_date,
                    ).toLocaleDateString("en-PH", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                    })}
                    {#if currentDeadline.week_number}
                        Â· Week {currentDeadline.week_number}
                    {/if}
                </div>
            {/if}
        </div>

        <!-- Hidden on mobile: every upload there is queued by design and syncs
             on its own, so this panel would appear after every submission and
             imply the document hadn't been handed in. Desktop only queues when
             a direct upload actually failed, where it's worth surfacing. -->
        {#if queueCount > 0 && !isMobile}
            <div class="flex flex-col gap-2 w-full sm:w-auto">
                <div
                    onclick={() => (showPendingPanel = !showPendingPanel)}
                    class="flex items-center justify-between gap-2 px-4 py-2 rounded-xl bg-gov-gold/10 text-gov-gold-dark text-sm font-semibold w-full cursor-pointer"
                    role="button"
                    tabindex="0"
                    onkeydown={(e) =>
                        e.key === "Enter" &&
                        (showPendingPanel = !showPendingPanel)}
                >
                    <div class="flex items-center gap-2">
                        <span class="relative flex h-2 w-2">
                            <span
                                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-gov-gold opacity-75"
                            ></span>
                            <span
                                class="relative inline-flex rounded-full h-2 w-2 bg-gov-gold"
                            ></span>
                        </span>
                        <!-- Worded as ongoing rather than "pending sync": an
                             upload that fell back to the background queue is
                             reported to the teacher as archived, so a label
                             implying it had not been submitted contradicted
                             that. It still surfaces the real state — the file
                             is finishing — without framing it as a failure. -->
                        {queueCount} file{queueCount > 1 ? "s" : ""} finishing in background
                    </div>
                    <div class="flex items-center gap-2">
                        <svg
                            class="w-4 h-4 transition-transform {showPendingPanel
                                ? 'rotate-180'
                                : ''}"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            ><path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M19 9l-7 7-7-7"
                            /></svg
                        >
                    </div>
                </div>
                {#if isOnline}
                    <button
                        onclick={async () => {
                            await processQueue(true);
                            await refreshPendingItems();
                        }}
                        class="w-full px-3 py-2 bg-gov-blue text-white text-xs font-semibold rounded-lg hover:bg-gov-blue-dark transition-colors shadow-sm"
                    >
                        Sync All Now
                    </button>
                {/if}
                {#if showPendingPanel && pendingItems.length > 0}
                    <div
                        class="bg-surface-white border border-border-subtle rounded-xl p-3 space-y-2 max-h-48 overflow-y-auto animate-fade-in"
                    >
                        {#each pendingItems as item}
                            <div
                                class="flex items-center justify-between py-2 px-3 bg-surface-muted rounded-lg text-xs"
                            >
                                <div class="min-w-0">
                                    <p
                                        class="font-semibold text-text-primary truncate"
                                    >
                                        {item.fileName}
                                    </p>
                                    <p class="text-text-muted">
                                        {item.docType} Â· Week {item.weekNumber ||
                                            "?"} Â· {new Date(
                                            item.timestamp,
                                        ).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </p>
                                </div>
                                <code
                                    class="text-[9px] text-gov-blue font-mono ml-2 flex-shrink-0"
                                    >{item.fileHash.slice(0, 8)}</code
                                >
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Upload Area -->
        <div class="lg:col-span-2 space-y-6">
            <!-- File Drop Zone -->
            <FileDropZone
                onfileselected={onFileSelected}
                disabled={processing || $settings.maintenance_mode}
                maxSizeMb={$settings.max_upload_size_mb}
            />

            {#if $settings.maintenance_mode}
                <div
                    class="p-4 bg-gov-red/10 border border-gov-red/20 rounded-md text-gov-red text-center font-bold animate-pulse"
                    role="alert"
                >
                    <svg
                        class="inline-block w-4 h-4 mr-1 align-text-bottom"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        ><path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        /></svg
                    >
                    SYSTEM MAINTENANCE ACTIVE: UPLOADS ARE TEMPORARILY DISABLED
                </div>
            {/if}

            <!-- Metadata Inputs -->
            {#if selectedFile && !processing}
                <div class="gov-card-static p-6 animate-fade-in">
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex flex-col">
                            <h3 class="text-lg font-bold text-text-primary">
                                {docType === 'DLL' ? 'Document Review' : 'Document Details'}
                            </h3>
                            <p class="text-[10px] text-text-muted font-medium">
                                {docType === 'DLL'
                                    ? 'Review the detected load and week before submission'
                                    : docType === 'ISP'
                                        ? 'Upload your Individual School Plan for review'
                                        : docType === 'ISR'
                                            ? 'Upload your Individual School Report for review'
                                            : 'Review your document details before submission'}
                            </p>
                        </div>
                        {#if detectingMetadata}
                            <div
                                class="flex items-center gap-2 text-gov-blue text-xs font-bold animate-pulse"
                            >
                                <svg
                                    class="animate-spin h-4 w-4"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        class="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        stroke-width="4"
                                        fill="none"
                                    ></circle>
                                    <path
                                        class="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                </svg>
                                Scanning...
                            </div>
                        {:else}
                            <div
                                class="text-[10px] font-bold text-gov-green bg-gov-green/5 px-2 py-1 rounded-md border border-gov-green/10"
                            >
                                Ready
                            </div>
                        {/if}
                    </div>

                    {#if detectingMetadata}
                        <div class="gov-card-static">
                            <CEDIMSLoader compact label="Detecting metadata..." />
                        </div>
                    {:else}
                        <div class="space-y-6 animate-fade-in">
                            <!-- Mismatch Alert -->
                            {#if mismatchAlert}
                                <div
                                    class="p-4 rounded-md bg-gov-red/5 border-2 border-gov-red/20 border-dashed animate-pulse"
                                    in:fade
                                >
                                    <div class="flex items-start gap-3">
                                        <svg
                                            class="w-5 h-5 text-gov-red flex-shrink-0 mt-0.5"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            ><path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                            /></svg
                                        >
                                        <div>
                                            <p
                                                class="text-xs font-semibold text-gov-red uppercase tracking-wide"
                                            >
                                                Mismatch Detected
                                            </p>
                                            <p
                                                class="text-xs text-text-secondary mt-0.5 leading-relaxed"
                                            >
                                                {@html mismatchAlert.message}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            {/if}

                            {#if docType === "DLL"}
                            <!-- Matched Teaching Load -->
                            <div class="space-y-2">
                                <span
                                    class="text-[10px] font-bold text-text-muted uppercase tracking-wide ml-1"
                                    >Teaching Load</span
                                >
                                <button
                                    onclick={() => (showLoadPicker = true)}
                                    class="w-full p-5 rounded-md transition-colors border-2 text-left flex items-center justify-between group {teachingLoadId
                                        ? 'bg-gov-blue/5 border-gov-blue/20 hover:border-gov-blue/40'
                                        : 'bg-gov-red/5 border-gov-red/20 border-dashed animate-pulse'}"
                                >
                                    <div>
                                        {#if teachingLoadId}
                                            <p
                                                class="text-[10px] font-semibold text-gov-blue uppercase tracking-normal mb-1"
                                            >
                                                Detected Load
                                            </p>
                                            <p
                                                class="text-xl font-semibold text-text-primary leading-tight"
                                            >
                                                {teachingLoads.find(
                                                    (l) =>
                                                        l.id === teachingLoadId,
                                                )?.subject || "Unknown"}
                                            </p>
                                            <p
                                                class="text-xs font-bold text-text-secondary mt-0.5"
                                            >
                                                Grade {teachingLoads.find(
                                                    (l) =>
                                                        l.id === teachingLoadId,
                                                )?.grade_level || ""}
                                            </p>
                                        {:else}
                                            <p
                                                class="text-lg font-semibold text-gov-red"
                                            >
                                                Tap to Select Load
                                            </p>
                                            <p
                                                class="text-xs font-medium text-gov-red/60 uppercase"
                                            >
                                                Manual selection required
                                            </p>
                                        {/if}
                                    </div>
                                    <div
                                        class="p-2 rounded-xl bg-surface-white shadow-sm border border-border-subtle group-hover:scale-110 transition-transform"
                                    >
                                        <svg
                                            class="w-5 h-5 text-gov-blue"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2.5"
                                                d="M19 9l-7 7-7-7"
                                            />
                                        </svg>
                                    </div>
                                </button>
                            </div>
                            {/if}

                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <!-- Doc Type -->
                                <div class="space-y-2">
                                    <span
                                        class="text-[10px] font-bold text-text-muted uppercase tracking-wide ml-1"
                                        >Document Type</span
                                    >
                                    <div
                                        class="flex p-1.5 bg-surface-muted border border-border-subtle rounded-md"
                                    >
                                        {#each allowedDocTypes as type}
                                            <button
                                                onclick={() => (docType = type)}
                                                class="flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-colors {docType ===
                                                type
                                                    ? 'bg-surface-white text-gov-blue shadow-sm'
                                                    : 'text-text-muted hover:text-text-primary'}"
                                            >
                                                {type}
                                            </button>
                                        {/each}
                                        {#if allowedDocTypes.length === 0}
                                            <div class="flex-1 py-3 px-4 text-sm font-semibold text-text-muted">
                                                No upload access
                                            </div>
                                        {/if}
                                    </div>
                                </div>

                                {#if docType === "DLL"}
                                <!-- Week -->
                                <div class="space-y-2">
                                    <span
                                        class="text-[10px] font-bold text-text-muted uppercase tracking-wide ml-1"
                                        >Target Week</span
                                    >
                                    <button
                                        onclick={() =>
                                            (requiresTeachingLoadSelection($profile?.role || '', docType) ? teachingLoads.length > 0 : true) &&
                                            (showWeekPicker = true)
                                        }
                                        disabled={requiresTeachingLoadSelection($profile?.role || '', docType) && teachingLoads.length === 0}
                                        class="w-full p-4 rounded-md bg-surface-muted border border-border-subtle transition-colors text-left flex items-center justify-between group {requiresTeachingLoadSelection($profile?.role || '', docType) && teachingLoads.length === 0
                                            ? 'opacity-60 cursor-not-allowed'
                                            : 'hover:border-gov-blue/30'}"
                                    >
                                        <div>
                                            {#if requiresTeachingLoadSelection($profile?.role || '', docType) && teachingLoads.length === 0}
                                                <p
                                                    class="text-lg font-semibold text-text-muted"
                                                >
                                                    No teaching loads
                                                </p>
                                                <p
                                                    class="text-xs font-medium text-text-muted mt-0.5"
                                                >
                                                    Load data is required before selecting a week.
                                                </p>
                                            {:else if weekNumber}
                                                <p
                                                    class="text-xs font-semibold text-gov-blue/60 uppercase tracking-normal mb-0.5"
                                                >
                                                    Selected
                                                </p>
                                                <p
                                                    class="text-lg font-semibold text-text-primary"
                                                >
                                                    Week {weekNumber}
                                                </p>
                                            {:else}
                                                <p
                                                    class="text-lg font-semibold text-text-muted"
                                                >
                                                    Select Week
                                                </p>
                                            {/if}
                                        </div>
                                        <div
                                            class="px-2 py-1 rounded bg-gov-blue/10 text-gov-blue text-[10px] font-semibold uppercase"
                                        >
                                            {teachingLoads.length === 0
                                                ? 'Pending'
                                                : 'Edit'}
                                        </div>
                                    </button>
                                </div>
                                {/if}
                            </div>
                        </div>
                    {/if}

                    {#if ocrConfidence !== null && !detectingMetadata}
                        <div
                            class="mt-6 p-4 rounded-md bg-surface-white border border-border-subtle flex items-center justify-between shadow-sm"
                        >
                            <div class="flex items-center gap-3">
                                <div
                                    class="w-2.5 h-2.5 rounded-full {ocrConfidence >
                                    80
                                        ? 'bg-gov-green'
                                        : ocrConfidence > 50
                                          ? 'bg-gov-gold'
                                          : 'bg-gov-red'} shadow-sm animate-pulse"
                                ></div>
                                <div>
                                    <p
                                        class="text-[10px] font-semibold text-text-primary uppercase tracking-normal"
                                    >
                                        Auto-Detected Details
                                    </p>
                                    <p class="text-[9px] text-text-muted">
                                        How sure the system is
                                    </p>
                                </div>
                            </div>
                            <div class="text-right">
                                <p
                                    class="text-sm font-semibold {ocrConfidence >
                                    80
                                        ? 'text-gov-green'
                                        : ocrConfidence > 50
                                          ? 'text-gov-gold-dark'
                                          : 'text-gov-red'}"
                                >
                                    {Math.round(ocrConfidence)}%
                                </p>
                            </div>
                        </div>
                    {/if}

                    <!-- Action Button -->
                    {#if !detectingMetadata}
                        {#if submissionAlreadyExists}
                            <div
                                class="mt-6 p-4 bg-gov-red/10 border border-gov-red/30 rounded-xl text-gov-red text-sm font-semibold flex flex-col items-center justify-center gap-2"
                            >
                                <div class="flex items-center gap-2">
                                    <svg
                                        class="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        ><path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                        /></svg
                                    >
                                    {submissionBlockReason ||
                                        `Already archived for Week ${weekNumber}`}
                                </div>
                            </div>
                            <p
                                class="mt-2 text-[10px] text-text-muted text-center uppercase tracking-widest font-bold"
                            >
                                This exact file has already been uploaded.
                            </p>
                        {:else}
                            <button
                                onclick={handleUpload}
                                disabled={!canUploadDocument($profile?.role || '', docType) ||
                                    (requiresTeachingLoadSelection($profile?.role || '', docType) && !teachingLoadId) ||
                                    (docType === "DLL" && !weekNumber) ||
                                    processing}
                                class="mt-6 w-full py-4 bg-gradient-to-r {isOnline
                                    ? 'from-gov-blue to-gov-blue-dark'
                                    : 'from-gov-gold-dark to-gov-gold'} text-white text-lg font-extrabold rounded-md shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:grayscale transition-[color,background-color,border-color,transform] duration-300 min-h-[60px] flex items-center justify-center gap-3 uppercase tracking-wide"
                            >
                                {#if processing}
                                    <svg
                                        class="animate-spin h-5 w-5"
                                        viewBox="0 0 24 24"
                                    >
                                        <circle
                                            class="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            stroke-width="4"
                                            fill="none"
                                        ></circle>
                                        <path
                                            class="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        ></path>
                                    </svg>
                                    Processing...
                                {:else}
                                    <svg
                                        class="w-6 h-6"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        ><path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                                        /></svg
                                    >
                                    {isOnline
                                        ? "Confirm & Archive"
                                        : "Save Offline"}
                                {/if}
                            </button>
                        {/if}
                    {/if}
                </div>
            {/if}

            <!-- Processing Progress -->
            <div class="animate-fade-in">
                <UploadProgress {currentPhase} {progress} {message} onRetry={selectedFile ? handleUpload : undefined} />

            </div>

        </div>

        <div class="space-y-6">
            <div class="gov-card-static p-6">
                <h3 class="text-lg font-bold text-text-primary mb-4">
                    {docType === 'DLL' ? 'Before Uploading DLL' : `Uploading ${docType}`}
                </h3>
                <ul class="space-y-3 text-sm text-text-secondary">
                    {#if docType === 'DLL'}
                        <li class="flex items-start gap-3">
                            <span class="w-7 h-7 rounded-full bg-gov-blue/10 text-gov-blue text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                            <span>Confirm the detected teaching load and document type.</span>
                        </li>
                        <li class="flex items-start gap-3">
                            <span class="w-7 h-7 rounded-full bg-gov-blue/10 text-gov-blue text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                            <span>Review the selected week before the file is archived.</span>
                        </li>
                        <li class="flex items-start gap-3">
                            <span class="w-7 h-7 rounded-full bg-gov-blue/10 text-gov-blue text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                            <span>Wait for metadata detection to finish before uploading.</span>
                        </li>
                    {:else if docType === 'ISP'}
                        <li class="flex items-start gap-3">
                            <span class="w-7 h-7 rounded-full bg-gov-blue/10 text-gov-blue text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                            <span>Ensure your Individual School Plan is in PDF format.</span>
                        </li>
                        <li class="flex items-start gap-3">
                            <span class="w-7 h-7 rounded-full bg-gov-blue/10 text-gov-blue text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                            <span>Verify that all required information is complete.</span>
                        </li>
                        <li class="flex items-start gap-3">
                            <span class="w-7 h-7 rounded-full bg-gov-blue/10 text-gov-blue text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                            <span>Wait for metadata detection to finish before uploading.</span>
                        </li>
                    {:else if docType === 'ISR'}
                        <li class="flex items-start gap-3">
                            <span class="w-7 h-7 rounded-full bg-gov-blue/10 text-gov-blue text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                            <span>Ensure your Individual School Report is in PDF format.</span>
                        </li>
                        <li class="flex items-start gap-3">
                            <span class="w-7 h-7 rounded-full bg-gov-blue/10 text-gov-blue text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                            <span>Verify that all required information is included.</span>
                        </li>
                        <li class="flex items-start gap-3">
                            <span class="w-7 h-7 rounded-full bg-gov-blue/10 text-gov-blue text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                            <span>Wait for metadata detection to finish before uploading.</span>
                        </li>
                    {/if}
                </ul>
            </div>

            {#if $profile}
                <div class="gov-card-static p-6 {$profile.role === 'Teacher' ? 'bg-gov-blue/5' : $profile.role === 'Master Teacher' ? 'bg-gov-green/5' : 'bg-gov-purple/5'}">
                    <h3 class="text-lg font-bold text-text-primary mb-3">
                        Your Role: {$profile.role}
                    </h3>
                    <p class="text-sm text-text-secondary">
                        {getUploadGuidance($profile.role)}
                    </p>
                </div>
            {/if}

            <div class="gov-card-static bg-gov-gold/5 p-6">
                <h3 class="text-lg font-bold text-text-primary mb-3">
                    Document Security
                </h3>
                <p class="text-sm text-text-secondary mb-3">
                    Your documents are secured with <strong>SHA-256</strong> digital
                    fingerprinting.
                </p>
                <ul class="space-y-2 text-xs text-text-muted">
                    <li class="flex gap-2">
                        <span
                            ><strong>Anti-Tampering:</strong> Any change to the file
                            content will alter its hash, making it invalid.</span
                        >
                    </li>
                    <li class="flex gap-2">
                        <span
                            ><strong>No Duplicates:</strong> The system automatically
                            rejects files that have already been archived.</span
                        >
                    </li>
                    <li class="flex gap-2">
                        <span
                            ><strong>Verifiable:</strong> Each document gets a unique
                            QR code for instant authenticity checks.</span
                        >
                    </li>
                </ul>
            </div>

        </div>
    </div>
</div>

<!-- Selection Modals -->
{#if showLoadPicker}
    <div
        class="fixed inset-0 z-[var(--z-modal)] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-opacity"
        onclick={() => (showLoadPicker = false)}
        onkeydown={(e) => e.key === "Escape" && (showLoadPicker = false)}
        role="presentation"
        transition:fade={{ duration: 200 }}
    >
        <div
            class="w-full max-w-lg bg-surface-white rounded-t-3xl sm:rounded-3xl shadow-sm overflow-hidden animate-slide-up sm:animate-scale-in"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => { e.stopPropagation(); if (e.key === "Escape") showLoadPicker = false; }}
            role="dialog"
            aria-modal="true"
            aria-label="Select Teaching Load"
            tabindex="-1"
            use:focusTrap
        >
            <div
                class="p-6 border-b border-border-subtle flex items-center justify-between"
            >
                <h3 class="text-xl font-semibold text-text-primary">
                    Select Teaching Load
                </h3>
                <button
                    onclick={() => (showLoadPicker = false)}
                    class="p-2 hover:bg-surface-muted rounded-full text-text-muted"
                    aria-label="Close"
                >
                    <svg
                        class="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        ><path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"
                        /></svg
                    >
                </button>
            </div>
            <div class="max-h-[60vh] overflow-y-auto p-4 space-y-2">
                {#if loadingTeachingLoads}
                    <div class="gov-card-static">
                        <CEDIMSLoader compact label="Loading teaching loads..." />
                    </div>
                {:else}
                    {#each teachingLoads as load}
                        <button
                            onclick={() => {
                                teachingLoadId = load.id;
                                showLoadPicker = false;
                            }}
                            class="w-full p-4 rounded-md text-left transition-colors flex items-center justify-between group {teachingLoadId ===
                            load.id
                                ? 'bg-gov-blue text-white shadow-lg'
                                : 'bg-surface-muted hover:bg-gov-blue/5 border border-transparent hover:border-gov-blue/20'}"
                        >
                            <div>
                                <p class="font-bold text-lg">{load.subject}</p>
                                <p
                                    class="text-xs font-medium {teachingLoadId ===
                                    load.id
                                        ? 'text-white/70'
                                        : 'text-text-muted'} uppercase tracking-wider"
                                >
                                    {load.grade_level}
                                </p>
                            </div>
                            {#if teachingLoadId === load.id}
                                <svg
                                    class="w-6 h-6"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    ><path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="3"
                                        d="M5 13l4 4L19 7"
                                    /></svg
                                >
                            {/if}
                        </button>
                    {:else}
                        <div class="py-12 text-center">
                            <p class="text-text-muted text-sm italic">
                                No teaching loads found.
                            </p>
                            <p class="text-[10px] text-text-muted mt-2">
                                Check your profile or connection.
                            </p>
                        </div>
                    {/each}
                {/if}
            </div>
        </div>
    </div>
{/if}

{#if showSuccessModal && result}
    <UploadSuccessModal
        {result}
        {isOnline}
        {docType}
        {weekNumber}
        onClose={closeSuccessModal}
        onUploadAnother={handleUploadAnother}
        onViewArchive={handleViewArchive}
    />
{/if}

{#if showWeekPicker}
    <div
        class="fixed inset-0 z-[var(--z-modal)] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-opacity"
        onclick={() => (showWeekPicker = false)}
        onkeydown={(e) => e.key === "Escape" && (showWeekPicker = false)}
        role="presentation"
        transition:fade={{ duration: 200 }}
    >
        <div
            class="w-full max-w-sm bg-surface-white rounded-t-3xl sm:rounded-3xl shadow-sm overflow-hidden animate-slide-up sm:animate-scale-in"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => { e.stopPropagation(); if (e.key === "Escape") showWeekPicker = false; }}
            role="dialog"
            aria-modal="true"
            aria-label="Select Week"
            tabindex="-1"
            use:focusTrap
        >
            <div
                class="p-6 border-b border-border-subtle flex items-center justify-between"
            >
                <h3 class="text-xl font-semibold text-text-primary">
                    Select Week
                </h3>
                <button
                    onclick={() => (showWeekPicker = false)}
                    class="p-2 hover:bg-surface-muted rounded-full text-text-muted"
                    aria-label="Close"
                >
                    <svg
                        class="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        ><path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"
                        /></svg
                    >
                </button>
            </div>
            <div
                class="max-h-[60vh] overflow-y-auto p-4 grid grid-cols-2 gap-3"
            >
                {#each academicWeeks as wk}
                    <button
                        onclick={() => {
                            weekNumber = wk;
                            showWeekPicker = false;
                        }}
                        class="p-6 rounded-md text-center transition-colors flex flex-col items-center justify-center gap-1 group {weekNumber ===
                        wk
                            ? 'bg-gov-blue text-white shadow-lg'
                            : 'bg-surface-muted hover:bg-gov-blue/5 border border-transparent hover:border-gov-blue/20'}"
                    >
                        <span
                            class="text-[10px] font-semibold uppercase tracking-wide {weekNumber ===
                            wk
                                ? 'text-white/70'
                                : 'text-text-muted'}">Week</span
                        >
                        <span class="text-3xl font-semibold tracking-normal"
                            >{wk}</span
                        >
                    </button>
                {:else}
                    <div class="col-span-2 text-center py-10 text-text-muted">
                        <p class="text-sm font-medium">No calendar weeks configured</p>
                        <p class="text-xs mt-1">Contact your district supervisor to set up the academic calendar.</p>
                    </div>
                {/each}
            </div>
        </div>
    </div>
{/if}

<style>
    /* A former :global(.gov-card-static) override here hardcoded a
       translucent-white glass background across every card on this page —
       never adapted for dark mode, and glassmorphism was explicitly
       rejected for this government tool (plan §5.2). Removed; the shared
       class's own app.css definition already provides consistent
       elevation, and this page has 6 gov-card-static instances that were
       all silently affected by it, including ones this same pass just
       gave role-specific background tints to. */

    @keyframes slide-up {
        from {
            transform: translateY(100%);
        }
        to {
            transform: translateY(0);
        }
    }
    .animate-slide-up {
        animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes scale-in {
        from {
            transform: scale(0.95);
            opacity: 0;
        }
        to {
            transform: scale(1);
            opacity: 1;
        }
    }
    :global(.animate-scale-in) {
        animation: scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
</style>
