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
        getQueuedUploads,
        cancelQueuedUpload,
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
    import { extractMetadata, resolveWeekFromDates, type DocMetadata } from "$lib/utils/ocr";
    import { validateSelection } from "$lib/utils/copilot";
    import {
        canUploadDocument,
        getAllowedUploadDocTypes,
        getUploadGuidance,
        requiresTeachingLoadSelection,
    } from "$lib/utils/documentPermissions";
    import { focusTrap } from "$lib/actions/focusTrap";
    import UploadSuccessModal from "$lib/components/UploadSuccessModal.svelte";
    import { formatDocumentList, getDocumentLabel } from "$lib/utils/documentLabels";
    import { getCurrentSchoolYear } from "$lib/utils/schoolYear";
    import { isWeeklyComplianceDocType } from "$lib/utils/compliance";
    import { effectiveDeadlineForSubject } from "$lib/utils/deadlineRules";

    import type { PageData } from "./$types";

    let { data } = $props<{ data: PageData }>();

    interface TeachingLoad {
        id: string;
        subject: string;
        grade_level: string;
    }

    interface CalendarEntry {
        id: string;
        term: number;
        week_number: number;
        school_year?: string;
        deadline_date?: string | null;
        description?: string | null;
        is_active?: boolean;
    }

    const MAX_SELECTED_PDF_SIZE_MB = 4;
    const MAX_SELECTED_PDF_BYTES = MAX_SELECTED_PDF_SIZE_MB * 1024 * 1024;
    const PDF_COMPRESSOR_URL = "https://www.ilovepdf.com/compress_pdf";
    const UPLOAD_DEBUG = false;
    const debugLog = (...args: any[]) => { if (UPLOAD_DEBUG) console.log(...args); };

    let selectedFile = $state<File | null>(null);
    let docType = $state("DLL");
    let allowedDocTypes = $state<string[]>([]);
    let docTypeManuallySelected = $state(false);
    let subject = $state("");
    let termNumber = $state<number | undefined>();
    let weekNumber = $state<number | undefined>();
    let teachingLoadId = $state<string>("");
    let targetConfirmed = $state(false);
    let confirmArchiveOpen = $state(false);
    let uploadConfirmed = $state(false);
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
    let slotAlreadyCovered = $state(false);
    let slotNotice = $state("");
    let ocrConfidence = $state<number | null>(null);
    let detectingMetadata = $state(false);
    let scanProgress = $state(0);
    let detectedMetadata = $state<any>(null);
    let isOnline = $state(
        typeof navigator !== "undefined" ? navigator.onLine : true,
    );
    const isMobile = isMobileDevice();
    let pendingItems = $state<any[]>([]);
    let cancellingQueueKey = $state("");
    let showPendingPanel = $state(false);
    let initialDataRun = 0;

    let showLoadPicker = $state(false);
    let showTermPicker = $state(false);
    let showWeekPicker = $state(false);
    let calendarEntries = $state<CalendarEntry[]>([]);
    let uploaderSchoolName = $state('');
    function setDocType(nextType: string, manual = true) {
        docType = nextType;
        if (manual) docTypeManuallySelected = true;
        targetConfirmed = false;
        if (!isWeeklyComplianceDocType(nextType)) {
            termNumber = undefined;
            weekNumber = undefined;
            currentDeadline = null;
            mismatchAlert = null;
        }
    }
    function formatCurrentDeadline(deadlineDate: string) {
        const deadline = isWeeklyComplianceDocType(docType)
            ? effectiveDeadlineForSubject(deadlineDate, subject, uploaderSchoolName)
            : new Date(deadlineDate);
        return deadline.toLocaleString("en-PH", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    }
    const academicTerms = [
        { value: 1, label: "Term 1" },
        { value: 2, label: "Term 2" },
        { value: 3, label: "Term 3" },
    ];
    const availableTerms = $derived(
        academicTerms.filter((period) => calendarEntries.some((entry) => entry.term === period.value)),
    );
    const visibleWeeks = $derived(
        calendarEntries
            .filter((w) => !termNumber || w.term === termNumber)
            .map((w) => w.week_number),
    );

    // Header subtitle reflects only the document types this role can actually submit.
    const uploadSubtitle = $derived(
        allowedDocTypes.length > 0
            ? `Submit your ${formatDocumentList(allowedDocTypes)} for archival`
            : "View and manage submitted documents",
    );

    // Watch for changes that could invalidate uniqueness
    $effect(() => {
        if (teachingLoadId && weekNumber && docType && $profile) {
            checkExistingSubmission();
        } else {
            submissionAlreadyExists = false;
            submissionBlockReason = "";
        }
    });

    async function checkExistingSubmission() {
        slotAlreadyCovered = false;
        slotNotice = "";

        if (teachingLoadId && weekNumber && docType === "DLL" && $profile) {
            const selectedLoad = teachingLoads.find((load) => load.id === teachingLoadId);
            const resolvedTerm = termNumber || calendarEntries.find((w) => w.week_number === weekNumber)?.term || Math.min(3, Math.max(1, Math.ceil(weekNumber / 13)));
            const query = supabase
                .from("submissions")
                .select("id, file_name")
                .eq("user_id", $profile.id)
                .eq("teaching_load_id", teachingLoadId)
                .eq("week_number", weekNumber)
                .eq("school_year", getCurrentSchoolYear())
                .in("compliance_status", ["compliant", "late"])
                .in("doc_type", ["DLL", "DLP"])
                .limit(1);
            const { data: slotMatches } = resolvedTerm
                ? await query.eq("term_number", resolvedTerm)
                : await query;
            const existingSlot = slotMatches?.[0];
            if (existingSlot) {
                slotAlreadyCovered = true;
                slotNotice = `${selectedLoad ? `${selectedLoad.subject} Grade ${selectedLoad.grade_level}` : "This teaching load"} already has a counted DLL for Week ${weekNumber}. This upload will be saved as supplementary and will not add another compliant count.`;
            }
        }

        submissionAlreadyExists = false;
    }

    // Watch weekNumber and fetch deadline
    $effect(() => {
        if (isWeeklyComplianceDocType(docType) && weekNumber) {
            const entry = calendarEntries.find((w) => w.week_number === weekNumber);
            termNumber = entry?.term || Math.min(3, Math.max(1, Math.ceil(weekNumber / 13)));
        }
        if (isWeeklyComplianceDocType(docType) && weekNumber && $profile?.district_id) {
            fetchCurrentDeadline(weekNumber, $profile.district_id);
        } else {
            currentDeadline = null;
        }
    });

    async function fetchCurrentDeadline(wk: number, districtId: string) {
        const selectedTerm = termNumber || calendarEntries.find((entry) => entry.week_number === wk)?.term;
        if (navigator.onLine) {
            let query = supabase
                .from("academic_calendar")
                .select("deadline_date, description")
                .eq("district_id", districtId)
                .eq("school_year", getCurrentSchoolYear())
                .eq("week_number", wk)
                .eq("is_active", true);
            if (selectedTerm) query = query.eq("term", selectedTerm);
            const { data, error } = await query.maybeSingle();

            if (data) {
                currentDeadline = data;
                // Update specific cache entry if needed or just rely on the batch pre-fetch
                return;
            }
            if (!error) {
                // The selected period is no longer Open. Do not resurrect a
                // stale cached deadline while the user is online.
                currentDeadline = null;
                calendarEntries = calendarEntries.filter((entry) => !(entry.week_number === wk && (!selectedTerm || entry.term === selectedTerm)));
                if (weekNumber === wk) {
                    weekNumber = undefined;
                    targetConfirmed = false;
                }
                return;
            }
        }

        // Offline Fallback
        const cached = await getCachedMetadata(`calendar_open_${districtId}`);
        if (cached?.data) {
            const entry = cached.data.find(
                (e: any) => e.week_number === wk && (!selectedTerm || e.term === selectedTerm) && e.is_active === true,
            );
            if (entry) {
                currentDeadline = entry;
                debugLog("[upload] Using cached deadline for week", wk);
            }
        }
    }

    // Mobile Optimization: Multi-stage library pre-warming
    // Hides the 2-5s loading delay of heavy workers on mobile
    async function preWarmLibraries() {
        if (typeof window === "undefined") return;
        debugLog("[upload] Pre-warming heavy libraries...");

        // PDF.js: pre-load from CDN so OCR can use it immediately
        if (!(window as any).pdfjsLib) {
            debugLog("[upload] Fetching PDF.js...");
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js";
            script.onload = () => {
                (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
                    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
                debugLog("[upload] PDF.js loaded.");
            };
            document.head.appendChild(script);
        }

        // Tesseract.js (dynamic import)
        try {
            const { createWorker } = await import("tesseract.js");
            // Just the import is often enough to trigger Service Worker caching
            debugLog("[upload] Tesseract.js pre-warmed.");
        } catch (e) {
            debugLog("[upload] Pre-warm skipped:", e);
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

        const onOnline = () => {
            isOnline = true;
            refreshPendingItems();
        };
        const onOffline = () => {
            isOnline = false;
        };
        window.addEventListener("online", onOnline);
        window.addEventListener("offline", onOffline);
        const onRefresh = () => {
            if ($profile && !processing) {
                fetchInitialData($profile);
            }
        };
        window.addEventListener("cedims:refresh-visible-route", onRefresh);

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
            window.removeEventListener("cedims:refresh-visible-route", onRefresh);
        };
    });

    async function refreshPendingItems() {
        queueCount = await getQueueSize();
        if (queueCount > 0) {
            const items = await getQueuedUploads();
            pendingItems = items.map(({ key, item }) => ({
                key,
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

    async function cancelPendingUpload(queueKey: string, fileName: string) {
        if (!confirm(`Cancel the local upload for "${fileName}"? This removes it from this device and it will stop retrying.`)) return;
        cancellingQueueKey = queueKey;
        try {
            await cancelQueuedUpload(queueKey);
            addToast("success", "Queued upload cancelled.");
            await refreshPendingItems();
        } catch (err: any) {
            addToast("error", err?.message || "Could not cancel this queued upload.");
        } finally {
            cancellingQueueKey = "";
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

    let dataLoadedForProfile = $state<string | null>(null);

    $effect(() => {
        if ($profile && dataLoadedForProfile !== $profile.id) {
            untrack(() => {
                // District Supervisors cannot upload - redirect to archive
                if ($profile!.role === 'District Supervisor') {
                    dataLoadedForProfile = $profile!.id;
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
        const runId = ++initialDataRun;
        loadingTeachingLoads = true;

        let loads: TeachingLoad[] = [];
        uploaderSchoolName = '';
        if (userProfile.school_id) {
            const { data: school } = await supabase.from('schools').select('name').eq('id', userProfile.school_id).maybeSingle();
            uploaderSchoolName = school?.name || '';
        }
        if (navigator.onLine) {
            const { data, error } = await supabase
                .from("teaching_loads")
                .select("id, subject, grade_level")
                .eq("user_id", userProfile.id)
                .eq("is_active", true)
                .order("subject, grade_level");

            if (!error && data) {
                if (runId !== initialDataRun) return;
                loads = data;
                cacheMetadata(`teaching_loads_${userProfile.id}`, data);
            } else if (error) {
                debugLog("[upload] Online fetch teaching loads skipped:", error.message);
            }
        }

        if (loads.length === 0) {
            const cached = await getCachedMetadata(
                `teaching_loads_${userProfile.id}`,
            );
            if (cached?.data) {
                if (runId !== initialDataRun) return;
                loads = cached.data;
                debugLog("[upload] Using cached teaching loads");
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
            termNumber = undefined;
            weekNumber = undefined;
            // Only show error if uploading DLL (which requires teaching load)
            // School Head and Master Teacher uploading ISP/ISR don't need teaching loads
            if (navigator.onLine && docType === 'DLL') {
                addToast("error", "No teaching loads found. Please configure at least one teaching load before uploading Daily Lesson Plan documents.");
            }
        }

        if (userProfile.district_id) {
            let loadedCalendarEntries: CalendarEntry[] = [];

            // Try cache first for immediate UI
            const cacheKey = `calendar_open_${userProfile.district_id}`;
            const cachedCal = await getCachedMetadata(cacheKey);
            if (cachedCal?.data) {
                if (runId !== initialDataRun) return;
                loadedCalendarEntries = (cachedCal.data as CalendarEntry[]).filter(
                    (w) => w.is_active === true,
                );
                calendarEntries = loadedCalendarEntries;
                debugLog("[upload] Loaded calendar from cache");
            }

            // Sync with online if possible
            if (navigator.onLine) {
                const { data, error } = await supabase
                    .from("academic_calendar")
                    .select("id, school_year, term, week_number, deadline_date, description, is_active")
                    .eq("district_id", userProfile.district_id)
                    .eq("is_active", true)
                    .order("week_number", { ascending: true });

                if (!error && data) {
                    if (runId !== initialDataRun) return;
                    loadedCalendarEntries = data;
                    calendarEntries = loadedCalendarEntries;
                    cacheMetadata(cacheKey, data);
                } else if (error) {
                    debugLog("[upload] Online fetch calendar skipped:", error.message);
                }
            }

            // Auto-detect current week only when teaching loads are available
            if (
                teachingLoads.length > 0 &&
                loadedCalendarEntries.length > 0 &&
                !weekNumber
            ) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const sorted = loadedCalendarEntries
                    .filter((e): e is CalendarEntry & { deadline_date: string } => typeof e.deadline_date === "string" && e.deadline_date.length > 0)
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
                    termNumber = currentEntry.term;
                    weekNumber = currentEntry.week_number;
                } else if (sorted.length > 0) {
                    termNumber = sorted[sorted.length - 1].term;
                    weekNumber = sorted[sorted.length - 1].week_number;
                }
            }
        }

        if (navigator.onLine) {
            try {
                await syncLedgerFromServer(userProfile.id);

            } catch (err) {
                debugLog("[upload] Sync context fetch skipped:", err);
            }
        }

        if (runId === initialDataRun) loadingTeachingLoads = false;
    }

    function normalizeGradeLevel(value?: string | null): string {
        const match = String(value || "").match(/\d+/);
        return match ? match[0] : "";
    }

    function normalizeSubjectKey(value?: string | null): string {
        const subject = String(value || "").toUpperCase().replace(/[^A-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
        if (/\bH\s*G\s*P\b/.test(subject) || subject.includes("HOMEROOM GUIDANCE")) return "HGP";
        if (subject === "MATH" || subject.includes("MATHEMATICS") || subject.includes("MATEMATIKA")) return "MATHEMATICS";
        if (subject === "AP" || subject.includes("ARALING PANLIPUNAN") || subject.includes("SOCIAL STUDIES")) return "AP";
        if (subject === "GMRC" || subject.includes("PAGPAPAKATAO") || subject.includes("VALUES") || subject.includes("ESP")) return "GMRC";
        return subject;
    }

    function subjectsMatch(loadSubject: string, detectedSubject: string): boolean {
        const loadSub = normalizeSubjectKey(loadSubject);
        const sub = normalizeSubjectKey(detectedSubject);

        if (sub === "HGP") return loadSub === "HGP";
        if (sub === "GMRC") return loadSub === "GMRC";
        if (sub === "AP") return loadSub === "AP";
        return loadSub.includes(sub) || sub.includes(loadSub);
    }

    function mapTeachingLoad(metadata: Partial<DocMetadata>): string {
        if (!metadata.subject) return teachingLoadId;

        const sub = metadata.subject.toUpperCase();
        const grade = normalizeGradeLevel(metadata.gradeLevel);

        const subjectMatches = teachingLoads.filter((l) =>
            subjectsMatch(l.subject, sub),
        );

        if (subjectMatches.length === 0) return "";
        if (subjectMatches.length === 1) return subjectMatches[0].id;

        if (!grade) {
            addToast(
                "info",
                `Scanner detected ${metadata.subject}, but could not confirm the grade. Please choose the correct grade before uploading.`,
            );
            return "";
        }

        const gradeMatch = subjectMatches.find(
            (l) => normalizeGradeLevel(l.grade_level) === grade,
        );

        if (!gradeMatch) {
            addToast(
                "warning",
                `Scanner detected ${metadata.subject} Grade ${grade}, but it did not match an active teaching load. Please verify the selected load.`,
            );
            return "";
        }

        return gradeMatch.id;
    }

    function parseDocDate(dateStr: string | null): Date | null {
        if (!dateStr) return null;
        try {
            debugLog("[upload] Attempting to parse date from:", dateStr);
            // Extract the month and day part using regex to ignore any surrounding garbage
            const match = dateStr.match(
                /(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[a-zA-Z]*\s+\d{1,2}/i,
            );

            if (!match) {
                debugLog(
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
            debugLog("[upload] Parsed clean date string:", finalDateStr);

            const d = new Date(finalDateStr);
            return isNaN(d.getTime()) ? null : d;
        } catch (e) {
            debugLog("[upload] Date parse skipped:", e);
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

        debugLog(
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
            debugLog("[upload] Calendar lookup skipped:", error);
            return null;
        }

        debugLog(`[upload] Lookup result:`, data);
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
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (file.type !== "application/pdf" && ext !== "pdf") {
            selectedFile = null;
            addToast("error", "Only PDF files can be uploaded. Please export or save the document as PDF first.");
            return;
        }
        if (file.size > MAX_SELECTED_PDF_BYTES) {
            selectedFile = null;
            addToast("error", `File too large. Compress the PDF below ${MAX_SELECTED_PDF_SIZE_MB}MB first: ${PDF_COMPRESSOR_URL}`);
            return;
        }

        selectedFile = file;
        targetConfirmed = false;
        result = null;
        ocrConfidence = null;
        // Runs OCR-based metadata detection: doc type, week number, and teaching load auto-fill
        detectingMetadata = true;
        scanProgress = 5;
        try {
            let ocrTarget = file;
            scanProgress = Math.max(scanProgress, 55);
            const metadata = await extractMetadata(ocrTarget);
            scanProgress = 82;
            debugLog("[upload] OCR metadata result:", metadata);
            detectedMetadata = metadata;
            scanProgress = 92;

            // OCR may update the suggested target, but the final archive
            // destination is not committed until the confirmation form.
            if (!docTypeManuallySelected && metadata.docType !== "Unknown") setDocType(metadata.docType, false);

            // Only auto-fill week number and teaching load for DLL documents
            if (docType === "DLL") {
                if (metadata.termNumber) termNumber = metadata.termNumber;
                if (metadata.weekNumber) {
                    weekNumber = metadata.weekNumber;
                    termNumber = metadata.termNumber || Math.min(3, Math.max(1, Math.ceil(metadata.weekNumber / 13)));
                }
                if (metadata.dateRange && calendarEntries.length > 0) {
                    const resolved = resolveWeekFromDates(
                        metadata.dateRange,
                        calendarEntries.map((entry) => ({
                            week_number: entry.week_number,
                            deadline_date: entry.deadline_date || undefined,
                        })),
                    );
                    if (resolved) {
                        weekNumber = resolved.weekNumber;
                        const entry = calendarEntries.find((w) => w.week_number === resolved.weekNumber);
                        termNumber = entry?.term || metadata.termNumber || Math.min(3, Math.max(1, Math.ceil(resolved.weekNumber / 13)));
                        debugLog(
                            `[upload] Derived week ${weekNumber} from document header dates ${metadata.dateRange.raw}`,
                        );
                    }
                } else if (metadata.date && $profile?.district_id) {
                    const docDate = parseDocDate(metadata.date);
                    if (docDate) {
                        const derivedWeek = await lookupWeekByDate(
                            docDate,
                            $profile.district_id,
                        );
                        if (derivedWeek) {
                            weekNumber = derivedWeek;
                            const entry = calendarEntries.find((w) => w.week_number === derivedWeek);
                            termNumber = entry?.term || Math.min(3, Math.max(1, Math.ceil(derivedWeek / 13)));
                            debugLog(
                                `[upload] Derived week ${weekNumber} from date ${metadata.date}`,
                            );
                        }
                    }
                }

                const mappedId = mapTeachingLoad(metadata);
                if (mappedId) teachingLoadId = mappedId;
            }

            if (metadata.confidence) {
                ocrConfidence = metadata.confidence;
            }

            // Check for initial mismatch
            if (teachingLoadId && isWeeklyComplianceDocType(docType)) {
                mismatchAlert = validateSelection(
                    teachingLoadId,
                    metadata.rawText,
                    teachingLoads,
                );
            }

            const { speak } = await import("$lib/utils/voiceGuide");
            speak("Smart detection complete. Fields updated.");
            scanProgress = 100;
        } catch (err) {
            debugLog("[upload] OCR skipped:", err);
        } finally {
            scanProgress = 100;
            detectingMetadata = false;
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
        if (!uploadConfirmed) {
            confirmArchiveOpen = true;
            return;
        }
        uploadConfirmed = false;
        if (isWeeklyComplianceDocType(docType) && (!teachingLoadId || !termNumber || !weekNumber)) {
            addToast('error', 'Select and confirm the teaching load, term, and week before uploading. Scanner results are suggestions only.');
            return;
        }
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

        const ext = selectedFile.name.split('.').pop()?.toLowerCase();
        if (selectedFile.type !== "application/pdf" && ext !== "pdf") {
            addToast("error", "Only PDF files can be uploaded. Please export or save the document as PDF first.");
            return;
        }

        if (selectedFile.size > MAX_SELECTED_PDF_BYTES) {
            addToast("error", `File too large. Compress the PDF below ${MAX_SELECTED_PDF_SIZE_MB}MB first: ${PDF_COMPRESSOR_URL}`);
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

        let openCalendarEntry: CalendarEntry | null = null;
        if (isWeeklyComplianceDocType(docType)) {
            if (!termNumber || !weekNumber) {
                addToast("error", "Choose a term and week that is Open in the Academic Calendar.");
                return;
            }

            if (navigator.onLine && $profile?.district_id) {
                const { data: entry, error } = await supabase
                    .from("academic_calendar")
                    .select("id, school_year, term, week_number, deadline_date, description, is_active")
                    .eq("district_id", $profile.district_id)
                    .eq("school_year", getCurrentSchoolYear())
                    .eq("term", termNumber)
                    .eq("week_number", weekNumber)
                    .eq("is_active", true)
                    .maybeSingle();

                if (error) {
                    addToast("error", "Could not verify that this upload period is Open. Refresh and try again.");
                    return;
                }
                if (!entry) {
                    const closedPeriod = `Term ${termNumber}, Week ${weekNumber} is Closed. Choose an Open period from the Academic Calendar.`;
                    calendarEntries = calendarEntries.filter((item) => !(item.term === termNumber && item.week_number === weekNumber));
                    currentDeadline = null;
                    weekNumber = undefined;
                    targetConfirmed = false;
                    addToast("error", closedPeriod);
                    return;
                }
                openCalendarEntry = entry;
                if (!calendarEntries.some((item) => item.id === entry.id)) {
                    calendarEntries = [...calendarEntries, entry].sort((a, b) => a.term - b.term || a.week_number - b.week_number);
                }
                cacheMetadata(`calendar_open_${$profile.district_id}`, calendarEntries);
                currentDeadline = entry;
            } else {
                openCalendarEntry = calendarEntries.find((entry) =>
                    entry.term === termNumber && entry.week_number === weekNumber && entry.is_active === true,
                ) || null;
                if (!openCalendarEntry) {
                    addToast("error", "This upload period is not in your saved list of Open calendar entries. Connect to the internet and refresh before uploading.");
                    return;
                }
            }
        }

        processing = true;
        result = null;

        const { speak, VoicePrompts } = await import("$lib/utils/voiceGuide");
        speak(VoicePrompts.UPLOAD_START);

        // Select the appropriate pipeline based on connectivity
        const pipelineOptions = {
            userId: $profile!.id,
            userRole: $profile!.role,
            docType,
            subject: subject || undefined,
            schoolName: uploaderSchoolName || undefined,
            termNumber: isWeeklyComplianceDocType(docType) ? termNumber : undefined,
            weekNumber: isWeeklyComplianceDocType(docType) ? weekNumber : undefined,
            calendarId: openCalendarEntry?.id,
            schoolYear: getCurrentSchoolYear(),
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
                    if (!docTypeManuallySelected && event.metadata.docType !== "Unknown")
                        setDocType(event.metadata.docType, false);
                    if (isWeeklyComplianceDocType(docType) && event.metadata.weekNumber)
                        weekNumber = event.metadata.weekNumber;
                    if (isWeeklyComplianceDocType(docType) && event.metadata.termNumber)
                        termNumber = event.metadata.termNumber;
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
        if (teachingLoadId && detectedMetadata?.rawText && isWeeklyComplianceDocType(docType)) {
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
        docTypeManuallySelected = false;
    }

    function handleViewArchive() {
        showSuccessModal = false;
        goto("/dashboard/archive");
    }
</script>

<svelte:head>
    <title>Upload Document â€” CEDIMS</title>
</svelte:head>

<div class="mx-auto w-full max-w-5xl">
    <!-- Header -->
    <div
        class="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
    >
        <div>
            <h1
                class="text-2xl font-bold text-text-primary flex items-center gap-2"
            >
                Upload Document <span
                    class="px-2 py-0.5 rounded-md text-xs font-semibold uppercase tracking-normal border
                    {isOnline
                        ? 'bg-gov-green/5 text-gov-green border-gov-green/10'
                        : 'bg-gov-gold/10 text-gov-gold-dark border-gov-gold/20'}"
                    >{isOnline ? "Online" : "Offline"}</span
                >
            </h1>
            <p class="text-base text-text-secondary mt-1">
                {isOnline
                    ? uploadSubtitle
                    : "Files will be saved locally and synced when online"}
            </p>
            {#if isWeeklyComplianceDocType(docType) && currentDeadline?.deadline_date}
                <div
                    class="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gov-blue/5 border border-gov-blue/10 text-xs font-semibold text-gov-blue"
                >
                    Deadline: {formatCurrentDeadline(currentDeadline.deadline_date)}
                    {#if currentDeadline.week_number}
                        Â· Week {currentDeadline.week_number}
                    {/if}
                </div>
            {/if}
        </div>

        {#if queueCount > 0}
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
                                class=" absolute inline-flex h-full w-full rounded-full bg-gov-gold opacity-75"
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
                            <div class="flex items-center justify-between gap-2 py-2 px-3 bg-surface-muted rounded-lg text-xs">
                                <div class="min-w-0">
                                    <p
                                        class="font-semibold text-text-primary truncate"
                                    >
                                        {item.fileName}
                                    </p>
                                    <p class="text-text-muted">
                                        {getDocumentLabel(item.docType)} · Week {item.weekNumber ||
                                            "?"} · {new Date(
                                            item.timestamp,
                                        ).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </p>
                                </div>
                                <div class="flex flex-shrink-0 items-center gap-2">
                                    <code class="text-xs text-gov-blue font-mono">{item.fileHash.slice(0, 8)}</code>
                                    <button
                                        type="button"
                                        class="rounded-md border border-gov-red/30 bg-gov-red/5 px-2 py-1 text-[11px] font-bold text-gov-red hover:bg-gov-red/10 disabled:opacity-60"
                                        disabled={!!cancellingQueueKey}
                                        onclick={() => cancelPendingUpload(item.key, item.fileName)}
                                        aria-label={`Cancel upload for ${item.fileName}`}
                                    >
                                        {cancellingQueueKey === item.key ? "Cancelling" : "Cancel"}
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
    </div>

    <div class="w-full">
        <!-- Upload Area -->
        <div class="space-y-4">
            {#if allowedDocTypes.length > 1}
                <section class="gov-card-static p-4" aria-labelledby="upload-type-heading">
                    <div class="mb-3">
                        <h2 id="upload-type-heading" class="text-sm font-bold text-text-primary">1. Choose document type</h2>
                        <p class="mt-1 text-xs text-text-muted">Choose what you’re uploading first. We’ll scan the file and prefill the details for you to confirm.</p>
                    </div>
                    <div class="grid grid-cols-1 gap-2 md:grid-cols-3">
                        {#each allowedDocTypes as type}
                            <button type="button" aria-pressed={docType === type} onclick={() => setDocType(type)} class="min-h-14 rounded-lg border px-3 py-2 text-center text-sm font-bold leading-snug transition-colors {docType === type ? 'border-gov-blue bg-gov-blue/5 text-gov-blue ring-1 ring-gov-blue' : 'border-border-subtle bg-surface-white text-text-primary hover:border-gov-blue'}">
                                {getDocumentLabel(type)}
                            </button>
                        {/each}
                    </div>
                </section>
            {/if}
            <!-- File Drop Zone -->
            <FileDropZone
                onfileselected={onFileSelected}
                disabled={processing || $settings.maintenance_mode}
                accept=".pdf,application/pdf"
                maxSizeMb={MAX_SELECTED_PDF_SIZE_MB}
                supportedText="PDF only. Compress files below 4MB before uploading."
                oversizedHelpUrl={PDF_COMPRESSOR_URL}
            />

            {#if $settings.maintenance_mode}
                <div
                    class="p-4 bg-gov-red/10 border border-gov-red/20 rounded-md text-gov-red text-center font-bold "
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
                <div class="gov-card-static p-4 animate-fade-in">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex flex-col">
                            <h3 class="text-base font-bold text-text-primary">
                                {docType === 'DLL' ? 'Document Review' : 'Document Details'}
                            </h3>
                            <p class="text-xs text-text-muted font-medium">
                                {docType === 'DLL'
                                    ? 'Review the detected load and week before submission'
                                    : docType === 'ISP'
                                        ? 'Upload your ISP — Instructional Supervisory Plan for review'
                                        : docType === 'ISR'
                                            ? 'Upload your ISR — Instructional Supervisory Report for review'
                                            : 'Review your document details before submission'}
                            </p>
                        </div>
                        {#if detectingMetadata}
                            <div
                                class="text-gov-blue text-xs font-bold"
                            >
                                Scanning {scanProgress}%
                            </div>
                        {:else}
                            <div class="text-xs font-bold {mismatchAlert ? 'border-gov-gold/20 bg-gov-gold/10 text-gov-gold-dark' : 'border-gov-green/10 bg-gov-green/5 text-gov-green'} rounded-md border px-2 py-1">
                                {mismatchAlert ? 'Review suggestion' : 'Ready to review'}
                            </div>
                        {/if}
                    </div>

                    {#if detectingMetadata}
                        <div class="rounded-lg border border-border-subtle bg-surface-muted p-4" role="status" aria-live="polite">
                            <div class="flex items-center justify-between gap-3 mb-2">
                                <span class="text-sm font-semibold text-text-primary">Scanning document</span>
                                <span class="text-xs font-bold text-gov-blue">{scanProgress}%</span>
                            </div>
                            <div class="h-2 w-full overflow-hidden rounded-full bg-border-subtle" role="progressbar" aria-label="Document scan progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={scanProgress}>
                                <div class="h-full rounded-full bg-gov-blue transition-[width] duration-300 ease-out" style={`width: ${scanProgress}%`}></div>
                            </div>
                            <p class="mt-2 text-xs text-text-muted">Reading the document and detecting its type, term, week, and teaching load.</p>
                        </div>
                    {:else}
                        <div class="space-y-4 animate-fade-in">
                            <!-- Mismatch Alert -->
                            {#if mismatchAlert}
                                <div
                                    class="p-4 rounded-md bg-gov-red/5 border-2 border-gov-red/20 border-dashed "
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
                                    class="text-xs font-bold text-text-muted uppercase tracking-wide ml-1"
                                    >Teaching Load</span
                                >
                                <button
                                    onclick={() => (showLoadPicker = true)}
                                    class="w-full p-3 rounded-md transition-colors border-2 text-left flex items-center justify-between group {teachingLoadId
                                        ? 'bg-gov-blue/5 border-gov-blue/20 hover:border-gov-blue/40'
                                        : 'bg-gov-red/5 border-gov-red/20 border-dashed '}"
                                >
                                    <div>
                                        {#if teachingLoadId}
                                            <p
                                                class="text-xs font-semibold text-gov-blue uppercase tracking-normal mb-1"
                                            >
                                                Detected Load
                                            </p>
                                            <p
                                                class="text-base font-semibold text-text-primary leading-tight"
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
                                                class="text-base font-semibold text-gov-red"
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

                            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {#if docType === "DLL" && teachingLoads.length === 0 && ($profile?.role === "Teacher" || $profile?.role === "Master Teacher")}
                                    <div class="rounded-lg border border-gov-gold/30 bg-gov-gold/10 px-4 py-3 text-sm text-gov-gold-dark" role="status">
                                        <p class="font-bold">Daily Lesson Plan uploads need a teaching load first.</p>
                                        <p class="mt-1 text-xs font-medium">{#if $profile?.role === "Teacher"}Open Teaching Load to add your subjects and schedule.{:else}You can still upload ISP — Instructional Supervisory Plan or ISR — Instructional Supervisory Report. Configure a teaching load before submitting a Daily Lesson Plan.{/if}</p>
                                        {#if $profile?.role === "Teacher"}
                                            <button type="button" class="mt-2 text-xs font-bold underline" onclick={() => goto("/dashboard/load")}>Open Teaching Load</button>
                                        {/if}
                                    </div>
                                {/if}

                                {#if docType === "DLL"}
                                <!-- Term -->
                                <div class="space-y-2">
                                    <span
                                        class="text-xs font-bold text-text-muted uppercase tracking-wide ml-1"
                                        >Target Term</span
                                    >
                                    <button
                                        onclick={() =>
                                            (requiresTeachingLoadSelection($profile?.role || '', docType) ? teachingLoads.length > 0 : true) &&
                                            (showTermPicker = true)
                                        }
                                        disabled={requiresTeachingLoadSelection($profile?.role || '', docType) && teachingLoads.length === 0}
                                        class="w-full p-3 rounded-md bg-surface-muted border border-border-subtle transition-colors text-left flex items-center justify-between group {requiresTeachingLoadSelection($profile?.role || '', docType) && teachingLoads.length === 0
                                            ? 'opacity-60 cursor-not-allowed'
                                            : 'hover:border-gov-blue/30'}"
                                    >
                                        <div>
                                            {#if termNumber}
                                                <p class="text-xs font-semibold text-gov-blue/60 uppercase tracking-normal mb-0.5">
                                                    Selected
                                                </p>
                                                <p class="text-base font-semibold text-text-primary">
                                                    Term {termNumber}
                                                </p>
                                            {:else}
                                                <p class="text-base font-semibold text-text-muted">
                                                    Select Term
                                                </p>
                                            {/if}
                                        </div>
                                        <div class="px-2 py-1 rounded bg-gov-blue/10 text-gov-blue text-xs font-semibold uppercase">
                                            {teachingLoads.length === 0 ? 'Pending' : 'Edit'}
                                        </div>
                                    </button>
                                </div>

                                <!-- Week -->
                                <div class="space-y-2">
                                    <span
                                        class="text-xs font-bold text-text-muted uppercase tracking-wide ml-1"
                                        >Target Week</span
                                    >
                                    <button
                                        onclick={() =>
                                            (requiresTeachingLoadSelection($profile?.role || '', docType) ? teachingLoads.length > 0 : true) &&
                                            (showWeekPicker = true)
                                        }
                                        disabled={requiresTeachingLoadSelection($profile?.role || '', docType) && teachingLoads.length === 0}
                                        class="w-full p-3 rounded-md bg-surface-muted border border-border-subtle transition-colors text-left flex items-center justify-between group {requiresTeachingLoadSelection($profile?.role || '', docType) && teachingLoads.length === 0
                                            ? 'opacity-60 cursor-not-allowed'
                                            : 'hover:border-gov-blue/30'}"
                                    >
                                        <div>
                                            {#if requiresTeachingLoadSelection($profile?.role || '', docType) && teachingLoads.length === 0}
                                                <p
                                                    class="text-base font-semibold text-text-muted"
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
                                                    class="text-base font-semibold text-text-primary"
                                                >
                                                    Week {weekNumber}
                                                </p>
                                            {:else}
                                                <p
                                                    class="text-base font-semibold text-text-muted"
                                                >
                                                    Select Week
                                                </p>
                                                {#if termNumber}
                                                    <p class="text-xs font-medium text-text-muted mt-0.5">
                                                        Term {termNumber} weeks only
                                                    </p>
                                                {/if}
                                            {/if}
                                        </div>
                                        <div
                                            class="px-2 py-1 rounded bg-gov-blue/10 text-gov-blue text-xs font-semibold uppercase"
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
                            class="mt-4 p-3 rounded-md bg-surface-white border border-border-subtle flex items-center justify-between shadow-sm"
                        >
                            <div class="flex items-center gap-3">
                                <div
                                    class="w-2.5 h-2.5 rounded-full {ocrConfidence >
                                    80
                                        ? 'bg-gov-green'
                                        : ocrConfidence > 50
                                          ? 'bg-gov-gold'
                                          : 'bg-gov-red'} shadow-sm "
                                ></div>
                                <div>
                                    <p
                                        class="text-xs font-semibold text-text-primary uppercase tracking-normal"
                                    >
                                        Auto-Detected Details
                                    </p>
                                    <p class="text-xs text-text-muted">
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
                        {#if slotAlreadyCovered}
                            <div class="mt-4 rounded-md border border-gov-gold/30 bg-gov-gold/10 px-4 py-3 text-sm font-semibold text-gov-gold-dark">
                                {slotNotice}
                            </div>
                        {/if}
                        <button
                                onclick={handleUpload}
                                disabled={!canUploadDocument($profile?.role || '', docType) ||
                                    (requiresTeachingLoadSelection($profile?.role || '', docType) && !teachingLoadId) ||
                                    (docType === "DLL" && !termNumber) ||
                                    (docType === "DLL" && !weekNumber) ||
                                    processing}
                                class="gov-btn-primary mt-4 w-full"
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
                </div>
            {/if}

            <!-- Processing Progress -->
            {#if processing || currentPhase === "error" || message}
                <div class="animate-fade-in">
                    <UploadProgress {currentPhase} {progress} {message} onRetry={selectedFile ? handleUpload : undefined} />
                </div>
            {/if}

        </div>

    </div>
</div>

{#if confirmArchiveOpen}
    <div class="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 bg-black/60" role="presentation">
        <div class="w-full max-w-lg bg-surface-white rounded-2xl shadow-2xl overflow-hidden" role="dialog" aria-modal="true" aria-label="Confirm archive target">
            <div class="px-6 py-4 border-b border-border-subtle"><p class="text-xs font-bold text-gov-blue uppercase tracking-wide">Final confirmation</p><h2 class="text-xl font-bold text-text-primary">Confirm archive destination</h2></div>
            <div class="px-6 py-5 space-y-3">
                <p class="text-sm text-text-secondary">OCR may have suggested these values. Review them carefully before the file is archived.</p>
                <div class="rounded-xl border border-border-subtle bg-surface-muted p-4 space-y-2 text-sm">
                    {#if isWeeklyComplianceDocType(docType)}
                        <p><strong>Teaching Load:</strong> {teachingLoads.find((load) => load.id === teachingLoadId)?.subject || "Not selected"} · Grade {teachingLoads.find((load) => load.id === teachingLoadId)?.grade_level || "—"}</p>
                    {/if}
                    <p><strong>Document Type:</strong> {docType}</p>
                    {#if isWeeklyComplianceDocType(docType)}
                        <p><strong>Term:</strong> {termNumber || "Not selected"}</p>
                        <p><strong>Week:</strong> {weekNumber || "Not selected"}</p>
                    {:else}
                        <p class="text-text-secondary">Administrative archive document; no weekly compliance period is assigned.</p>
                    {/if}
                    <p><strong>File:</strong> {selectedFile?.name || "—"}</p>
                </div>
                {#if mismatchAlert}<p class="rounded-xl border border-gov-gold/30 bg-gov-gold/10 px-4 py-3 text-sm text-gov-gold-dark">Scanner mismatch detected. Confirm only if the selected target is correct.</p>{/if}
            </div>
            <div class="px-6 py-4 bg-surface-muted border-t border-border-subtle flex justify-end gap-3">
                <button onclick={() => (confirmArchiveOpen = false)} class="min-h-11 px-4 rounded-xl border border-border-subtle bg-surface-white text-sm font-bold">Review again</button>
                <button onclick={() => { confirmArchiveOpen = false; uploadConfirmed = true; handleUpload(); }} class="min-h-11 px-4 rounded-xl bg-gov-blue text-white text-sm font-bold">Confirm & Archive</button>
            </div>
        </div>
    </div>
{/if}

<!-- Selection Modals -->
{#if showLoadPicker}
    <div
        class="fixed inset-0 z-[var(--z-modal)] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60  transition-opacity"
        onclick={() => (showLoadPicker = false)}
        onkeydown={(e) => e.key === "Escape" && (showLoadPicker = false)}
        role="presentation"
        transition:fade={{ duration: 200 }}
    >
        <div
            class="w-full max-w-lg bg-surface-white rounded-t-3xl sm:rounded-xl shadow-sm overflow-hidden animate-slide-up sm:animate-scale-in"
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
                    class="p-2.5 hover:bg-surface-muted rounded-full text-text-muted"
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
                    <div class="gov-card-static p-4" role="status" aria-live="polite">
                        <p class="text-sm font-semibold text-text-secondary mb-2">Loading teaching loads...</p>
                        <div class="h-2 w-full overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label="Loading teaching loads">
                            <div class="h-full w-2/5 rounded-full bg-gov-blue animate-pulse"></div>
                        </div>
                    </div>
                {:else}
                    {#each teachingLoads as load}
                        <button
                            onclick={() => {
                                teachingLoadId = load.id;
                                targetConfirmed = false;
                                showLoadPicker = false;
                            }}
                            role="option"
                            aria-selected={teachingLoadId === load.id}
                            class="w-full min-h-14 rounded-lg border px-4 py-2.5 text-left transition-colors flex items-center justify-between group {teachingLoadId === load.id
                                ? 'border-gov-blue/20 bg-surface-muted text-gov-blue'
                                : 'border-transparent bg-surface-white text-text-primary hover:bg-surface-muted'}"
                        >
                            <div>
                                <p class="font-bold text-lg">{load.subject}</p>
                                <p
                                    class="text-xs font-medium text-text-muted uppercase tracking-wider"
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
                            <p class="text-xs text-text-muted mt-2">
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
        class="fixed inset-0 z-[var(--z-modal)] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60  transition-opacity"
        onclick={() => (showWeekPicker = false)}
        onkeydown={(e) => e.key === "Escape" && (showWeekPicker = false)}
        role="presentation"
        transition:fade={{ duration: 200 }}
    >
        <div
            class="w-full max-w-sm bg-surface-white rounded-t-3xl sm:rounded-xl shadow-sm overflow-hidden animate-slide-up sm:animate-scale-in"
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
                    class="p-2.5 hover:bg-surface-muted rounded-full text-text-muted"
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
                {#each visibleWeeks as wk}
                    <button
                        onclick={() => {
                            weekNumber = wk;
                            termNumber = calendarEntries.find((w) => w.week_number === wk)?.term || termNumber;
                            targetConfirmed = !!teachingLoadId && !!termNumber && !!wk;
                            showWeekPicker = false;
                        }}
                        role="option"
                        aria-selected={weekNumber === wk}
                        class="w-full min-h-12 rounded-lg border px-4 py-2 text-left transition-colors flex items-center justify-between group {weekNumber === wk
                            ? 'border-transparent bg-surface-muted text-gov-blue'
                            : 'border-transparent bg-surface-white text-text-primary hover:bg-surface-muted'}"
                    >
                        <span class="text-lg font-bold">Week {wk}</span>
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

{#if showTermPicker}
    <div
        class="fixed inset-0 z-[var(--z-modal)] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60  transition-opacity"
        onclick={() => (showTermPicker = false)}
        onkeydown={(e) => e.key === "Escape" && (showTermPicker = false)}
        role="presentation"
        transition:fade={{ duration: 200 }}
    >
        <div
            class="w-full max-w-sm bg-surface-white rounded-t-3xl sm:rounded-xl shadow-sm overflow-hidden animate-slide-up sm:animate-scale-in"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => { e.stopPropagation(); if (e.key === "Escape") showTermPicker = false; }}
            role="dialog"
            aria-modal="true"
            aria-label="Select Term"
            tabindex="-1"
            use:focusTrap
        >
            <div class="p-6 border-b border-border-subtle flex items-center justify-between">
                <h3 class="text-xl font-semibold text-text-primary">
                    Select Term
                </h3>
                <button
                    onclick={() => (showTermPicker = false)}
                    class="p-2.5 hover:bg-surface-muted rounded-full text-text-muted"
                    aria-label="Close"
                >
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div class="max-h-[60vh] overflow-y-auto p-4 grid grid-cols-1 gap-3">
                {#each availableTerms as term}
                    <button
                        onclick={() => {
                            termNumber = term.value;
                            targetConfirmed = false;
                            if (weekNumber && !calendarEntries.some((w) => w.week_number === weekNumber && w.term === term.value)) {
                                weekNumber = undefined;
                            }
                            showTermPicker = false;
                        }}
                        role="option"
                        aria-selected={termNumber === term.value}
                        class="w-full min-h-12 rounded-lg border px-4 py-2 text-left transition-colors flex items-center justify-between group {termNumber === term.value
                            ? 'border-transparent bg-surface-muted text-gov-blue'
                            : 'border-transparent bg-surface-white text-text-primary hover:bg-surface-muted'}"
                    >
                        <span class="text-base font-bold">{term.label}</span>
                        <span class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                            Weeks {(term.value - 1) * 13 + 1}-{term.value * 13}
                        </span>
                    </button>
                {:else}
                    <p class="py-8 text-center text-sm text-text-muted">
                        No academic terms are currently Open for uploads.
                    </p>
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
