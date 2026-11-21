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
        cacheMetadata,
        getCachedMetadata,
        pendingSyncCount,
    } from "$lib/utils/offline";

    import { profile, type Profile } from "$lib/utils/auth";
    import { isMobileDevice } from "$lib/utils/device";
    import { settings } from "$lib/stores/settings";
    import { connectivity } from "$lib/stores/connectivity";
    import { addToast } from "$lib/stores/toast";
    import { supabase } from "$lib/utils/supabase";
    import { goto } from "$app/navigation";
    import { onMount, untrack } from "svelte";
    import { fade } from "svelte/transition";
    import { extractMetadata, warmPdfReader, resolveWeekFromDates, createDefaultMetadata, type DocMetadata } from "$lib/utils/ocr";
    import { fileNameAsHeaderText, readHeaderPeriod, resolveHeaderUploadPeriod, resolveUniqueOpenUploadPeriod } from "$lib/utils/headerPeriod";
    import { gradeLabel, resolveTeachingLoadMatch, teachingLoadNotice, validAssignedLoad } from "$lib/utils/teachingLoadMatching";
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
    import { requestUploadTargets, requestUploadTargetsReliably, openUploadTargets, preserveUploadPeriod, parseTrackerUploadTarget, type TrackerUploadTarget } from "$lib/utils/uploadTargets";

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
    $effect(() => {
        if (typeof document === 'undefined') return;
        const pending = !!selectedFile || processing || detectingMetadata || checkingTarget || confirmArchiveOpen || showSuccessModal;
        document.documentElement.toggleAttribute('data-cedims-upload-pending', pending);
        window.dispatchEvent(new CustomEvent('cedims:upload-state', { detail: { pending } }));
    });
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
    let checkingTarget = $state(false);
    let scanController: AbortController | null = null;
    let optionsRequest: { key: string; promise: Promise<void> } | null = null;
    let result = $state<PipelineResult | null>(null);
    let showSuccessModal = $state(false);
    let completedDetails = $state<{ docType: string; weekNumber?: number } | null>(null);
    let awaitingArchive = $state<PipelineResult | null>(null);
    let checkingArchive = false;

    async function confirmPendingArchive() {
        const pending = awaitingArchive;
        if (!pending || checkingArchive || !navigator.onLine || !$profile) return;
        checkingArchive = true;
        try {
            const { data, error } = await supabase.from('submissions').select('id')
                .eq('user_id', $profile.id).eq('file_hash', pending.fileHash)
                .eq('file_path', pending.filePath).limit(1).maybeSingle();
            if (!error && data && awaitingArchive?.fileHash === pending.fileHash) {
                result = pending;
                awaitingArchive = null;
                currentPhase = 'done';
                progress = 100;
                message = 'Upload Successful!';
                showSuccessModal = true;
                const { speak, VoicePrompts } = await import('$lib/utils/voiceGuide');
                speak(VoicePrompts.UPLOAD_COMPLETE);
            }
        } catch {
            // A failed confirmation stays pending; the next online poll retries.
        } finally {
            checkingArchive = false;
        }
    }
    let mismatchAlert = $state<any>(null);
    // Whether the server has answered, kept apart from whether the lists have
    // items. "No teaching loads" must only ever be said after a real answer.
    let loadsStatus = $state<'loading' | 'ready' | 'failed'>('loading');
    let calendarStatus = $state<'loading' | 'ready' | 'failed'>('loading');
    let optionsVersion = $state(0);
    let lastOptionsRefreshAt = 0;
    let targetNotice = $state('');
    let targetsFromFileName = $state(false);
    let targetsChosenByHand = false;
    let scannedDocument: { file: File; metadata: any } | null = null;
    let autofillWaiting = false;
    let autofillRunning = false;
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
    let metadataRun = 0;
    let submissionCheckRun = 0;
    let targetProfileId = "";
    let trackerTarget: TrackerUploadTarget | null = null;
    let trackerTargetApplied = false;
    function applyTrackerTarget() {
        if (!trackerTarget || trackerTargetApplied || !teachingLoads.length || !calendarEntries.length) return;
        const load = teachingLoads.find(item => item.id === trackerTarget?.loadId);
        const period = calendarEntries.find(item => item.term === trackerTarget?.term && item.week_number === trackerTarget?.week);
        if (!load || !period) return;
        teachingLoadId = load.id;
        subject = load.subject;
        termNumber = period.term;
        weekNumber = period.week_number;
        currentDeadline = period;
        targetConfirmed = false;
        trackerTargetApplied = true;
    }

    let showLoadPicker = $state(false);
    let loadRefreshRun = 0;
    let lastLoadsFetchAt = 0;
    async function refreshTeachingLoads(notifyOnFailure = true): Promise<TeachingLoad[] | null> {
        const profileId = $profile?.id;
        if (!profileId || !navigator.onLine) return null;
        const runId = ++loadRefreshRun;
        loadingTeachingLoads = true;
        try {
            const { data, error } = await requestUploadTargetsReliably((signal) => supabase
                .from('teaching_loads').select('id, subject, grade_level')
                .eq('user_id', profileId).eq('is_active', true)
                .order('subject').order('grade_level').abortSignal(signal));
            if (error) throw error;
            if (!data || runId !== loadRefreshRun || $profile?.id !== profileId) return null;
            if (JSON.stringify(data) !== JSON.stringify(teachingLoads)) optionsVersion++;
            teachingLoads = data;
            loadsStatus = 'ready';
            lastLoadsFetchAt = Date.now();
            if (teachingLoadId && !data.some((load) => load.id === teachingLoadId)) teachingLoadId = '';
            void requestUploadTargets(() => cacheMetadata(`teaching_loads_${profileId}`, data), 1500).catch(() => {});
            return data;
        } catch (error) {
            debugLog('[upload] Could not refresh teaching loads:', error);
            if (runId === loadRefreshRun && !teachingLoads.length) loadsStatus = 'failed';
            if (notifyOnFailure && !teachingLoads.length) addToast('warning', 'Your teaching loads have not loaded yet. The system keeps trying.');
            return null;
        } finally {
            if (runId === loadRefreshRun) loadingTeachingLoads = false;
        }
    }
    function openTeachingLoadPicker() {
        useManualTargets();
        showLoadPicker = true;
        // The saved list opens at once. A refresh only runs when it may be out of date.
        if (!teachingLoads.length || Date.now() - lastLoadsFetchAt > 60000) void refreshTeachingLoads();
    }
    let showTermPicker = $state(false);
    let showWeekPicker = $state(false);
    let calendarEntries = $state<CalendarEntry[]>([]);
    let allCalendarEntries = $state<CalendarEntry[]>([]);
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
        } else {
            const period = preserveUploadPeriod(calendarEntries, termNumber, weekNumber);
            termNumber = period?.term;
            weekNumber = period?.week_number;
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

    const loadsConfirmedEmpty = $derived(!teachingLoads.length && loadsStatus === 'ready');
    const loadsPendingLabel = $derived(!teachingLoads.length && loadsStatus !== 'ready' ? 'Loading your teaching loads…' : '');
    const calendarPendingLabel = $derived(!calendarEntries.length && calendarStatus !== 'ready' ? 'Loading…' : !calendarEntries.length ? 'No Open period' : '');
    const periodLocked = $derived(!calendarEntries.length || (requiresTeachingLoadSelection($profile?.role || '', docType) && loadsConfirmedEmpty));
    const suggestedLoad = $derived(mismatchAlert?.action?.teachingLoadId ? teachingLoads.find((load) => load.id === mismatchAlert.action.teachingLoadId) : undefined);
    const optionsStatusMessage = $derived.by(() => {
        const waiting = (!teachingLoads.length && loadsStatus !== 'ready') || (!calendarEntries.length && calendarStatus !== 'ready');
        if (!waiting) return '';
        if (!isOnline) return 'You are offline and this device has no saved teaching loads or weeks yet. They will load by themselves when the internet returns.';
        return loadsStatus === 'failed' || calendarStatus === 'failed'
            ? 'Slow connection. Your teaching loads and weeks have not loaded yet. The system keeps trying by itself.'
            : 'Loading your teaching loads and weeks…';
    });

    // Header subtitle reflects only the document types this role can actually submit.
    const uploadSubtitle = $derived(
        allowedDocTypes.length > 0
            ? `Submit your ${formatDocumentList(allowedDocTypes)} for archival`
            : "View and manage submitted documents",
    );

    // Selection changes settle before an advisory server lookup. Never cache duplicate history.
    $effect(() => {
        const target = `${$profile?.id}:${teachingLoadId}:${termNumber}:${weekNumber}:${docType}`;
        if (target && teachingLoadId && weekNumber && docType && $profile) {
            const timer = window.setTimeout(() => { void checkExistingSubmission(); }, 200);
            return () => window.clearTimeout(timer);
        }
        submissionCheckRun++;
        slotAlreadyCovered = false;
        slotNotice = '';
        submissionAlreadyExists = false;
        submissionBlockReason = '';
    });

    async function checkExistingSubmission() {
        const runId = ++submissionCheckRun;
        const selectedTarget = `${teachingLoadId}:${termNumber}:${weekNumber}:${docType}`;
        slotAlreadyCovered = false;
        slotNotice = "";
        if (!navigator.onLine) return;

        if (teachingLoadId && weekNumber && docType === "DLL" && $profile) {
            const selectedLoad = teachingLoads.find((load) => load.id === teachingLoadId);
            const matchingTerms = [...new Set(calendarEntries.filter((w) => w.week_number === weekNumber).map((w) => w.term))];
            const resolvedTerm = termNumber || (matchingTerms.length === 1 ? matchingTerms[0] : undefined);
            if (!resolvedTerm) return;
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
            const { data: slotMatches } = await requestUploadTargets((signal) =>
                (resolvedTerm ? query.eq("term_number", resolvedTerm) : query).abortSignal(signal),
            ).catch(() => ({ data: null }));
            if (runId !== submissionCheckRun || selectedTarget !== `${teachingLoadId}:${termNumber}:${weekNumber}:${docType}`) return;
            const existingSlot = slotMatches?.[0];
            if (existingSlot) {
                slotAlreadyCovered = true;
                slotNotice = `${selectedLoad ? `${selectedLoad.subject} ${gradeLabel(selectedLoad.grade_level)}` : "This teaching load"} already has a counted DLL for Week ${weekNumber}. This upload will be saved as supplementary and will not add another compliant count.`;
            }
        }

        submissionAlreadyExists = false;
    }

    // The target list already contains deadlines. Never put a second network
    // request on the selection path; reconnect refresh verifies the full list.
    $effect(() => {
        currentDeadline = isWeeklyComplianceDocType(docType)
            ? calendarEntries.find((entry) => entry.term === termNumber && entry.week_number === weekNumber) || null
            : null;
    });
    async function preWarmLibraries() {
        if (!navigator.onLine || processing || detectingMetadata) return;
        try { await warmPdfReader(); }
        catch (error) { debugLog('[upload] Reader warmup deferred:', error); }
    }

    $effect(() => {
        if (!selectedFile) resetDocumentTargets();
    });

    // A document scanned before its options arrived fills in as soon as they do.
    $effect(() => {
        optionsVersion;
        untrack(() => {
            const scanned = scannedDocument;
            if (!autofillWaiting || autofillRunning || targetsChosenByHand || detectingMetadata || processing) return;
            if (!scanned || scanned.file !== selectedFile) return;
            autofillRunning = true;
            void applyScanToTargets(scanned.file, scanned.metadata, () => scannedDocument === scanned && selectedFile === scanned.file && !targetsChosenByHand)
                .catch((error) => debugLog('[upload] Autofill retry failed:', error))
                .finally(() => { autofillRunning = false; });
        });
    });

    // Keep this page's pending-sync panel in sync with the shared queue store
    // the instant it changes (e.g. right after a background sync finishes
    // elsewhere), instead of only refreshing on this page's own online/mount
    // events. This also provides the initial fetch on mount.
    $effect(() => {
        $pendingSyncCount;
        refreshPendingItems();
    });

    onMount(() => {
        trackerTarget = parseTrackerUploadTarget(new URLSearchParams(window.location.search));
        if (trackerTarget) {
            applyTrackerTarget();
        }
        const archiveTimer = window.setInterval(() => { void confirmPendingArchive(); }, 5000);
        // Delay pre-warming slightly to not block initial page render
        const warmTimer = window.setTimeout(() => { void preWarmLibraries(); }, 1500);

        const onOnline = () => {
            isOnline = true;
            refreshPendingItems();
            if ($profile && !processing) void fetchInitialData($profile);
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
        // The notice for a cancelled queue item is shown by FailedUploadNotice;
        // this only stops the page from waiting on a file that will never arrive.
        const onUploadCancelled = (event: Event) => {
            const cancelled = (event as CustomEvent).detail;
            void refreshPendingItems();
            if (cancelled?.fileHash === awaitingArchive?.fileHash) {
                awaitingArchive = null;
                message = '';
                progress = 0;
                currentPhase = 'transcoding';
            }
        };
        window.addEventListener("cedims:upload-cancelled", onUploadCancelled);
        const retryOptions = window.setInterval(() => {
            if (!navigator.onLine || !$profile || processing) return;
            const missing = (!teachingLoads.length && loadsStatus !== 'ready') || (!calendarEntries.length && calendarStatus !== 'ready');
            const busy = detectingMetadata || confirmArchiveOpen || showLoadPicker || showTermPicker || showWeekPicker;
            // Missing options are fetched whatever the teacher is doing. Complete
            // ones are only refreshed now and then, to spare a slow connection.
            if (missing || (!busy && Date.now() - lastOptionsRefreshAt > 180000)) void fetchInitialData($profile);
        }, 10000);

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
            document.documentElement.removeAttribute('data-cedims-upload-pending');
            window.dispatchEvent(new CustomEvent('cedims:upload-state', { detail: { pending: false } }));
            window.removeEventListener("online", onOnline);
            window.removeEventListener("offline", onOffline);
            window.removeEventListener("cedims:refresh-visible-route", onRefresh);
            window.removeEventListener("cedims:upload-cancelled", onUploadCancelled);
            window.clearInterval(retryOptions);
            window.clearInterval(archiveTimer);
            window.clearTimeout(warmTimer);
            scanController?.abort();
            metadataRun++;
            initialDataRun++;
            submissionCheckRun++;
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
            const cancelled = pendingItems.find(item => item.key === queueKey);
            await cancelQueuedUpload(queueKey);
            if (cancelled?.fileHash === awaitingArchive?.fileHash) {
                awaitingArchive = null;
                message = '';
            }
            addToast("success", "Queued upload cancelled.");
            await refreshPendingItems();
        } catch (err: any) {
            addToast("error", err?.message || "Could not cancel this queued upload.");
        } finally {
            cancellingQueueKey = "";
        }
    }

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

    function fetchInitialData(userProfile: Profile): Promise<void> {
        const key = `${userProfile.id}:${userProfile.role}:${userProfile.school_id}:${userProfile.district_id}`;
        if (optionsRequest?.key === key) return optionsRequest.promise;
        const promise = loadUploadOptions(userProfile);
        optionsRequest = { key, promise };
        void promise.finally(() => { if (optionsRequest?.promise === promise) optionsRequest = null; }).catch(() => {});
        return promise;
    }

    async function loadUploadOptions(userProfile: Profile) {
        if (targetProfileId !== userProfile.id) {
            targetProfileId = userProfile.id;
            teachingLoads = [];
            calendarEntries = [];
            allCalendarEntries = [];
            teachingLoadId = "";
            termNumber = undefined;
            weekNumber = undefined;
            uploaderSchoolName = "";
            loadsStatus = 'loading';
            calendarStatus = 'loading';
        }
        const runId = ++initialDataRun;
        const isCurrent = () => runId === initialDataRun && $profile?.id === userProfile.id && $profile?.district_id === userProfile.district_id;
        const year = getCurrentSchoolYear();
        const loadsKey = `teaching_loads_${userProfile.id}`;
        const calendarKey = `calendar_${userProfile.district_id}`;
        const schoolKey = `upload_school_${userProfile.school_id}`;
        loadingTeachingLoads = isWeeklyComplianceDocType(docType) && (teachingLoads.length === 0 || calendarEntries.length === 0);

        const applyLoads = (loads: TeachingLoad[]) => {
            if (JSON.stringify(loads) !== JSON.stringify(teachingLoads)) optionsVersion++;
            teachingLoads = loads;
            if (!loads.some((load) => load.id === teachingLoadId)) {
                teachingLoadId = "";
                targetConfirmed = false;
            }
            if (teachingLoads.length && calendarEntries.length) loadingTeachingLoads = false;
            applyTrackerTarget();
        };
        const applyCalendar = (entries: CalendarEntry[]) => {
            const nextEntries = entries.filter(entry => entry.school_year === year);
            if (JSON.stringify(nextEntries) !== JSON.stringify(allCalendarEntries)) optionsVersion++;
            allCalendarEntries = nextEntries;
            calendarEntries = openUploadTargets(entries, year);
            if (!isWeeklyComplianceDocType(docType)) return;
            const period = preserveUploadPeriod(calendarEntries, termNumber, weekNumber);
            if (termNumber !== period?.term || weekNumber !== period?.week_number) targetConfirmed = false;
            termNumber = period?.term;
            weekNumber = period?.week_number;
            currentDeadline = period || null;
            if (teachingLoads.length && calendarEntries.length) loadingTeachingLoads = false;
            applyTrackerTarget();
        };
        const readSaved = async (key: string) => {
            try { return await requestUploadTargets(() => getCachedMetadata(key), 1500); }
            catch { return null; }
        };
        const save = async (key: string, value: unknown) => {
            try { await requestUploadTargets(() => cacheMetadata(key, value), 1500); }
            catch (err) { debugLog("[upload] Could not save options on this device:", err); }
        };

        try {
            // All saved targets appear together before any network work starts.
            const [savedLoads, savedCalendar, savedSchool] = await Promise.all([
                readSaved(loadsKey),
                userProfile.district_id ? readSaved(calendarKey) : Promise.resolve(null),
                userProfile.school_id ? readSaved(schoolKey) : Promise.resolve(null),
            ]);
            if (!isCurrent()) return;
            if (!teachingLoads.length && Array.isArray(savedLoads?.data)) applyLoads(savedLoads.data);
            if (!calendarEntries.length && Array.isArray(savedCalendar?.data)) applyCalendar(savedCalendar.data);
            if (savedSchool?.data) uploaderSchoolName = savedSchool.data;
            if (teachingLoads.length && calendarEntries.length) loadingTeachingLoads = false;
            if (!navigator.onLine) {
                if (!teachingLoads.length) loadsStatus = 'failed';
                if (!calendarEntries.length) calendarStatus = 'failed';
                return;
            }
            if (!teachingLoads.length) loadsStatus = 'loading';
            if (!calendarEntries.length) calendarStatus = 'loading';
            lastOptionsRefreshAt = Date.now();

            // Refresh independently: a slow school lookup must never block the targets.
            await Promise.allSettled([
                (async () => {
                    try {
                        const { data: loads, error } = await requestUploadTargetsReliably((signal) => supabase
                            .from("teaching_loads").select("id, subject, grade_level")
                            .eq("user_id", userProfile.id).eq("is_active", true)
                            .order("subject").order("grade_level").abortSignal(signal), { keepTrying: isCurrent });
                        if (error || !loads) throw error;
                        if (!isCurrent() || processing) return;
                        applyLoads(loads);
                        loadsStatus = 'ready';
                        await save(loadsKey, loads);
                    } catch (failure) {
                        debugLog("[upload] Teaching loads did not load:", failure);
                        if (isCurrent() && !teachingLoads.length) loadsStatus = 'failed';
                    }
                })(),
                (async () => {
                    if (!userProfile.district_id) { calendarStatus = 'ready'; return; }
                    try {
                        const { data: entries, error } = await requestUploadTargetsReliably((signal) => supabase
                            .from("academic_calendar")
                            .select("id, school_year, term, week_number, deadline_date, description, is_active")
                            .eq("district_id", userProfile.district_id).eq("school_year", year).eq("is_published", true)
                            .order("term").order("week_number").abortSignal(signal), { keepTrying: isCurrent });
                        if (error || !entries) throw error;
                        if (!isCurrent() || processing) return;
                        applyCalendar(entries);
                        calendarStatus = 'ready';
                        await save(calendarKey, entries);
                    } catch (failure) {
                        debugLog("[upload] Calendar did not load:", failure);
                        if (isCurrent() && !calendarEntries.length) calendarStatus = 'failed';
                    }
                })(),
                (async () => {
                    if (!userProfile.school_id) return;
                    const { data: school, error } = await requestUploadTargets((signal) => supabase
                        .from("schools").select("name").eq("id", userProfile.school_id)
                        .abortSignal(signal).maybeSingle());
                    if (!isCurrent() || processing || error || !school) return;
                    uploaderSchoolName = school.name;
                    await save(schoolKey, school.name);
                })(),
            ]);
        } finally {
            if (isCurrent()) loadingTeachingLoads = false;
        }
    }
    /** A choice the teacher made outranks anything a later scan or refresh suggests. */
    function markTargetChosen() {
        targetsChosenByHand = true;
        autofillWaiting = false;
        targetNotice = '';
        targetsFromFileName = false;
    }

    function useManualTargets() {
        if (!detectingMetadata) return;
        metadataRun++;
        scanController?.abort();
        detectingMetadata = false;
        scanProgress = 100;
        detectedMetadata = createDefaultMetadata();
        autofillWaiting = false;
    }

    function resetDocumentTargets() {
        metadataRun++;
        submissionCheckRun++;
        scanController?.abort();
        scanController = null;
        teachingLoadId = '';
        subject = '';
        termNumber = undefined;
        weekNumber = undefined;
        currentDeadline = null;
        detectedMetadata = null;
        mismatchAlert = null;
        ocrConfidence = null;
        detectingMetadata = false;
        scanProgress = 0;
        slotAlreadyCovered = false;
        slotNotice = '';
        submissionAlreadyExists = false;
        submissionBlockReason = '';
        targetConfirmed = false;
        targetNotice = '';
        targetsFromFileName = false;
        targetsChosenByHand = false;
        scannedDocument = null;
        autofillWaiting = false;
        uploadConfirmed = false;
        confirmArchiveOpen = false;
        showLoadPicker = false;
        showTermPicker = false;
        showWeekPicker = false;
    }

    function trackerLinkedTargets() {
        if (!trackerTarget) return null;
        const load = teachingLoads.find(item => item.id === trackerTarget?.loadId);
        const period = calendarEntries.find(entry => entry.term === trackerTarget?.term && entry.week_number === trackerTarget?.week);
        return load && period ? { load, period } : null;
    }

    /** Fills the targets from a finished scan. Runs again if the options arrive late. */
    async function applyScanToTargets(file: File, metadata: any, isCurrentScan: () => boolean) {
        const nextDocType = !docTypeManuallySelected && metadata.docType && metadata.docType !== 'Unknown' ? metadata.docType : docType;
        let usedFileName = false;
        let nextTerm: number | undefined;
        let nextWeek: number | undefined;
        let nextLoad = '';
        let nextMetadata = metadata;
        let notice = '';
        if (isWeeklyComplianceDocType(nextDocType)) {
            let match = resolveTeachingLoadMatch(metadata, teachingLoads, file.name);
            if (!match.loadId && (match.reason === 'grade_mismatch' || match.reason === 'no_subject_match') && navigator.onLine) {
                const refreshed = await refreshTeachingLoads(false);
                if (!isCurrentScan()) return;
                if (refreshed) match = resolveTeachingLoadMatch(metadata, refreshed, file.name);
            }
            const year = getCurrentSchoolYear();
            const periodOptions = {
                schoolYear: year, subject: teachingLoads.find(load => load.id === match.loadId)?.subject || match.subject, schoolName: uploaderSchoolName
            };
            // The file name only supplies a period when the document states none at all.
            const documentPeriod = readHeaderPeriod(metadata.rawText || '');
            const documentHasPeriod = documentPeriod.invalid || !!documentPeriod.termNumber || !!documentPeriod.weekNumber || documentPeriod.ranges.length > 0;
            const namePeriod = readHeaderPeriod(fileNameAsHeaderText(file.name));
            const nameHasPeriod = !documentHasPeriod && (!!namePeriod.termNumber || !!namePeriod.weekNumber || namePeriod.ranges.length > 0);
            const periodText = nameHasPeriod ? `${fileNameAsHeaderText(file.name)}\n${metadata.rawText || ''}` : metadata.rawText || '';
            let scannedPeriod = resolveHeaderUploadPeriod(periodText, allCalendarEntries, periodOptions);
            let period = scannedPeriod || resolveUniqueOpenUploadPeriod(periodText, allCalendarEntries, year, periodOptions);
            // Cached options can be from the week that just closed. Refresh the
            // calendar before using its sole Open period as a fallback.
            if (!scannedPeriod && typeof navigator !== 'undefined' && navigator.onLine && $profile?.district_id) {
                try {
                    const { data: currentCalendar, error: calendarError } = await requestUploadTargets((signal) => supabase
                        .from('academic_calendar')
                        .select('id, school_year, term, week_number, deadline_date, description, is_active')
                        .eq('district_id', $profile!.district_id).eq('school_year', year).eq('is_published', true)
                        .order('term').order('week_number').abortSignal(signal));
                    if (!isCurrentScan()) return;
                    if (!calendarError && currentCalendar) {
                        allCalendarEntries = currentCalendar;
                        calendarEntries = openUploadTargets(currentCalendar, year);
                        calendarStatus = 'ready';
                        scannedPeriod = resolveHeaderUploadPeriod(periodText, currentCalendar, periodOptions);
                        period = scannedPeriod || resolveUniqueOpenUploadPeriod(periodText, currentCalendar, year, periodOptions);
                    }
                } catch (error) { debugLog('[upload] Could not refresh the Open calendar period:', error); }
            }
            nextTerm = period?.term;
            nextWeek = period?.week_number;
            nextLoad = match.loadId || '';
            const linked = trackerLinkedTargets();
            if (linked) {
                if ((nextLoad && nextLoad !== linked.load.id) || (nextTerm && nextWeek && (nextTerm !== linked.period.term || nextWeek !== linked.period.week_number))) {
                    notice = 'The scanned document differs from the Tracker item you opened. Review the teaching load and period before uploading.';
                } else {
                    nextLoad ||= linked.load.id;
                    if (!nextTerm || !nextWeek) {
                        nextTerm = linked.period.term;
                        nextWeek = linked.period.week_number;
                    }
                }
            }
            const periodFromName = nameHasPeriod && !!scannedPeriod;
            usedFileName = !!(match.fromFileName && match.subject) || periodFromName;
            nextMetadata = { ...metadata, subject: match.subject, gradeLevel: match.grade || metadata.gradeLevel,
                ...(periodFromName ? { termNumber: nextTerm, weekNumber: nextWeek } : {}) };
            if (!nextLoad && !notice) notice = teachingLoadNotice(match, teachingLoads);
            else if ((!nextTerm || !nextWeek) && !notice) notice = 'Confirm the term and week for this document. No unique Open period could be matched.';
            else if (match.subject === 'HGP' && teachingLoads.find(load => load.id === match.loadId)?.subject !== 'HGP')
                notice = 'HGP will be filed under your assigned GMRC teaching load for the same grade. Please review before uploading.';
            if (!notice && period && !scannedPeriod)
                notice = `Term ${period.term}, Week ${period.week_number} was filled because it is the only Open period. Please review before uploading.`;
            if (usedFileName) {
                const fromName = 'Filled from the file name because the document header could not be read. Check that it is correct before uploading.';
                notice = nextLoad && nextTerm && nextWeek ? fromName : `${fromName} ${notice}`.trim();
            }
        }
        if (!isCurrentScan()) return;
        // Commit one file's complete result together; previous scans never own these fields.
        const weekly = isWeeklyComplianceDocType(nextDocType);
        const optionsMissing = weekly && (!teachingLoads.length || !allCalendarEntries.length);
        const optionsUnconfirmed = loadsStatus !== 'ready' || calendarStatus !== 'ready';
        autofillWaiting = weekly && (optionsMissing || ((!nextLoad || !nextTerm || !nextWeek) && optionsUnconfirmed));
        if (nextDocType !== docType) setDocType(nextDocType, false);
        teachingLoadId = nextLoad;
        termNumber = nextTerm;
        weekNumber = nextWeek;
        if (!autofillWaiting) trackerTarget = null;
        detectedMetadata = nextMetadata;
        ocrConfidence = metadata.confidence || null;
        mismatchAlert = nextLoad && weekly
            ? validateSelection(nextLoad, metadata.rawText, teachingLoads, nextMetadata, file.name) : null;
        targetsFromFileName = usedFileName;
        targetNotice = optionsMissing
            ? 'Document scanned. Your teaching load, term and week will fill in by themselves as soon as they load.'
            : notice;
    }

    async function onFileSelected(file: File) {
        if (processing || checkingTarget) return;
        resetDocumentTargets();
        result = null;
        completedDetails = null;
        showSuccessModal = false;
        awaitingArchive = null;
        progress = 0;
        message = '';
        currentPhase = 'transcoding';
        if ($settings.maintenance_mode) { selectedFile = null; return; }
        if (file.type !== 'application/pdf' && file.name.split('.').pop()?.toLowerCase() !== 'pdf') {
            selectedFile = null;
            addToast('error', 'Only PDF files can be uploaded. Please export or save the document as PDF first.');
            return;
        }
        if (file.size > MAX_SELECTED_PDF_BYTES) {
            selectedFile = null;
            addToast('error', `File too large. Compress the PDF below ${MAX_SELECTED_PDF_SIZE_MB}MB first: ${PDF_COMPRESSOR_URL}`);
            return;
        }
        selectedFile = file;
        const runId = metadataRun;
        const controller = new AbortController();
        scanController = controller;
        const isCurrentScan = () => runId === metadataRun && selectedFile === file && !controller.signal.aborted;
        detectingMetadata = true;
        scanProgress = 5;
        try {
            // Offline upload must never wait for an OCR language pack that may
            // not have been downloaded on this device. Filename hints and the
            // saved target list still support full manual confirmation.
            const metadata = navigator.onLine
                ? await extractMetadata(file, { signal: controller.signal })
                : createDefaultMetadata();
            if (!isCurrentScan()) return;
            scannedDocument = { file, metadata };
            if (loadingTeachingLoads || !$profile) {
                await waitForDataReady(15000);
                if (!isCurrentScan()) return;
            }
            scanProgress = 82;
            await applyScanToTargets(file, metadata, isCurrentScan);
            if (!isCurrentScan()) return;
            scanProgress = 100;
        } catch (error) {
            if (isCurrentScan()) {
                // The file could not be read, but its name, a Tracker link or the
                // only Open period can still fill the form.
                const unread = createDefaultMetadata();
                scannedDocument = { file, metadata: unread };
                try { await applyScanToTargets(file, unread, isCurrentScan); }
                catch (failure) { debugLog('[upload] Could not fill targets for an unread file:', failure); detectedMetadata = unread; }
                if (isCurrentScan()) targetNotice = `The scan could not read this file. ${targetNotice}`.trim();
            }
        } finally {
            if (isCurrentScan()) { detectingMetadata = false; scanProgress = 100; }
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
        if (processing || checkingTarget) { uploadConfirmed = false; return; }
        if (!uploadConfirmed) {
            confirmArchiveOpen = true;
            return;
        }
        uploadConfirmed = false;
        checkingTarget = true;
        try {
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

        // A target already chosen does not need to wait for a background refresh.
        if (!$profile || (loadingTeachingLoads && !teachingLoads.length)) {
            const ready = await waitForDataReady(15000);
            if (!ready) {
                addToast("error", "Your account details are still loading on this connection. Please press Review upload again in a moment.");
                return;
            }
        }

        if (!canUploadDocument($profile?.role || '', docType)) {
            addToast("error", getUploadGuidance($profile?.role || ''));
            return;
        }

        if (isWeeklyComplianceDocType(docType) && !validAssignedLoad(teachingLoads.find(load => load.id === teachingLoadId))) {
            addToast("error", "Please select a teaching load before uploading");
            openTeachingLoadPicker();
            return;
        }

        let openCalendarEntry: CalendarEntry | null = null;
        let queueLocally = false;
        if (isWeeklyComplianceDocType(docType)) {
            if (!termNumber || !weekNumber) {
                addToast("error", "Choose a term and week that is Open in the Academic Calendar.");
                return;
            }

            if (navigator.onLine && $profile?.district_id) {
                const districtId = $profile.district_id;
                const requestedTerm = termNumber;
                const requestedWeek = weekNumber;
                const requestedLoad = teachingLoadId;
                const requestedFile = selectedFile;
                const { data: entry, error } = await requestUploadTargets((signal) => supabase
                    .from("academic_calendar")
                    .select("id, school_year, term, week_number, deadline_date, description, is_active")
                    .eq("district_id", districtId)
                    .eq("school_year", getCurrentSchoolYear())
                    .eq("term", requestedTerm)
                    .eq("week_number", requestedWeek)
                    .eq("is_active", true)
                    .abortSignal(signal).maybeSingle())
                    .catch(() => ({ data: null, error: new Error("Connection unavailable") }));
                if (termNumber !== requestedTerm || weekNumber !== requestedWeek || teachingLoadId !== requestedLoad || selectedFile !== requestedFile) {
                    addToast("info", "Your upload target changed. Please confirm the current selection before uploading.");
                    return;
                }

                if (error) {
                    openCalendarEntry = calendarEntries.find((item) => item.term === termNumber && item.week_number === weekNumber) || null;
                    if (!openCalendarEntry) {
                        addToast("error", "Connect once to load and save this upload period before uploading.");
                        return;
                    }
                    // Queue with the exact saved calendar ID; sync rechecks that it is Open.
                    queueLocally = true;
                }
                if (!error && !entry) {
                    const closedPeriod = `Term ${termNumber}, Week ${weekNumber} is Closed. Choose an Open period from the Academic Calendar.`;
                    calendarEntries = calendarEntries.filter((item) => !(item.term === termNumber && item.week_number === weekNumber));
                    currentDeadline = null;
                    weekNumber = undefined;
                    targetConfirmed = false;
                    addToast("error", closedPeriod);
                    return;
                }
                if (entry) {
                    openCalendarEntry = entry;
                    if (!calendarEntries.some((item) => item.id === entry.id)) {
                        calendarEntries = [...calendarEntries, entry].sort((a, b) => a.term - b.term || a.week_number - b.week_number);
                    }
                    void cacheMetadata(`calendar_open_${districtId}`, calendarEntries).catch(() => {});
                    currentDeadline = entry;
                }
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

        awaitingArchive = null;
        showSuccessModal = false;
        processing = true;
        result = null;

        const { speak, VoicePrompts } = await import("$lib/utils/voiceGuide");
        speak(VoicePrompts.UPLOAD_START);

        // Select the appropriate pipeline based on connectivity
        const pipelineOptions = {
            userId: $profile!.id,
            userRole: $profile!.role,
            queueLocally,
            docType,
            subject: teachingLoads.find((load) => load.id === teachingLoadId)?.subject || subject || undefined,
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
                    // The destination was confirmed before starting the pipeline.
                    // Later OCR events must not change or clear that selection.
                    if (event.metadata.confidence !== undefined)
                        ocrConfidence = event.metadata.confidence;
                    const { speak } = await import("$lib/utils/voiceGuide");
                    speak("Smart detection complete. Details updated.");
                }

                if ((event.phase === 'queued' || event.phase === 'done') && event.result) {
                    completedDetails = { docType: pipelineOptions.docType, weekNumber: pipelineOptions.weekNumber };
                }
                if (event.phase === "queued" && event.result) {
                    awaitingArchive = event.result;
                    selectedFile = null;
                    resetDocumentTargets();
                    await refreshPendingItems();
                    connectivity.refreshPendingCount();
                    void confirmPendingArchive();
                }

                if (event.phase === "done" && event.result) {
                    result = event.result;
                    showSuccessModal = true;
                    speak(VoicePrompts.UPLOAD_COMPLETE);
                    selectedFile = null;
                    resetDocumentTargets();
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
        } catch (error) {
            currentPhase = 'error';
            message = error instanceof Error ? error.message : 'Upload could not be completed. Please try again.';
            addToast('error', message);
        } finally {
            checkingTarget = false;
            processing = false;
        }
    }

    // Reactively validate selection mismatch
    $effect(() => {
        if (teachingLoadId && detectedMetadata?.rawText && isWeeklyComplianceDocType(docType)) {
            mismatchAlert = validateSelection(
                teachingLoadId,
                detectedMetadata.rawText,
                teachingLoads,
                detectedMetadata,
                selectedFile?.name || '',
            );
        } else {
            mismatchAlert = null;
        }
    });

    function closeSuccessModal() {
        showSuccessModal = false;
    }

    function handleUploadAnother() {
        resetDocumentTargets();
        completedDetails = null;
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
    <title>Upload Document — CEDIMS</title>
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
                        · Week {currentDeadline.week_number}
                    {/if}
                </div>
            {/if}
        </div>

        {#if !isOnline}
            <p role="status" class="w-full rounded-lg border border-border-subtle bg-surface-muted p-3 text-sm text-text-secondary">Offline: select a PDF and confirm a saved teaching load and open week. The file will be kept on this device until a connection returns; it is not in the server archive yet. Up to 8 pending files or 20 MB can be kept here.</p>
        {/if}

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
                        {queueCount} file{queueCount > 1 ? "s" : ""} waiting for server confirmation
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
                <p class="px-1 text-xs font-medium text-text-muted" role="status">
                    {isOnline ? "Syncing now. Keep this app available until the server confirms each file." : "Saved on this device. Sync starts when the internet returns."}
                </p>
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
                bind:selectedFile
                onfileselected={onFileSelected}
                disabled={processing || checkingTarget || $settings.maintenance_mode}
                accept=".pdf,application/pdf"
                maxSizeMb={MAX_SELECTED_PDF_SIZE_MB}
                supportedText="PDF only. Compress files below 4MB before uploading."
                oversizedHelpUrl={PDF_COMPRESSOR_URL}
            />

            {#if checkingTarget && !processing}
                <p class="rounded-lg border border-gov-blue/20 bg-gov-blue/5 p-3 text-sm text-gov-blue" role="status" aria-live="polite">Checking your selected upload period. Please wait…</p>
            {/if}

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
                            <p class="mt-2 text-xs text-text-muted">Reading the document. You can choose your teaching load, term, and week below at any time.</p>
                            <button type="button" class="mt-3 min-h-11 rounded-lg border border-gov-blue/30 px-3 text-sm font-semibold text-gov-blue" onclick={useManualTargets}>Use selected targets without waiting for scan</button>
                        </div>
                    {/if}
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
                                                {mismatchAlert.message.replace(/\*\*/g, "")}
                                            </p>
                                            {#if suggestedLoad}
                                                <button
                                                    type="button"
                                                    class="mt-2 min-h-11 rounded-lg border border-gov-blue/30 bg-surface-white px-3 text-sm font-bold text-gov-blue"
                                                    onclick={() => { teachingLoadId = suggestedLoad.id; targetConfirmed = false; markTargetChosen(); }}
                                                >
                                                    Use {suggestedLoad.subject} · {gradeLabel(suggestedLoad.grade_level)}
                                                </button>
                                            {/if}
                                        </div>
                                    </div>
                                </div>
                            {/if}

                            {#if docType === "DLL"}
                            {#if targetNotice && !detectingMetadata}
                                <p class="rounded-lg border border-gov-gold/30 bg-gov-gold/10 px-4 py-3 text-sm font-semibold text-gov-gold-dark" role="status" aria-live="polite">{targetNotice}</p>
                            {/if}
                            <!-- Matched Teaching Load -->
                            <div class="space-y-2">
                                <span
                                    class="text-xs font-bold text-text-muted uppercase tracking-wide ml-1"
                                    >Teaching Load</span
                                >
                                <button
                                    onclick={openTeachingLoadPicker}
                                    class="w-full p-3 rounded-md transition-colors border-2 text-left flex items-center justify-between group {teachingLoadId
                                        ? 'bg-gov-blue/5 border-gov-blue/20 hover:border-gov-blue/40'
                                        : 'bg-gov-red/5 border-gov-red/20 border-dashed '}"
                                >
                                    <div>
                                        {#if teachingLoadId}
                                            <p
                                                class="text-xs font-semibold text-gov-blue uppercase tracking-normal mb-1"
                                            >
                                                Selected Load
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
                                                {gradeLabel(teachingLoads.find(
                                                    (l) =>
                                                        l.id === teachingLoadId,
                                                )?.grade_level)}
                                            </p>
                                        {:else}
                                            <p
                                                class="text-base font-semibold text-gov-red"
                                            >
                                                {loadsPendingLabel || "Tap to Select Load"}
                                            </p>
                                            <p
                                                class="text-xs font-medium text-gov-red/60 uppercase"
                                            >
                                                {loadsPendingLabel ? "Trying automatically" : "Manual selection required"}
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
                                {#if docType === "DLL" && optionsStatusMessage}
                                    <p class="rounded-lg border border-gov-blue/20 bg-gov-blue/5 px-4 py-3 text-sm font-semibold text-gov-blue sm:col-span-2 lg:col-span-3" role="status" aria-live="polite">{optionsStatusMessage}</p>
                                {/if}
                                {#if docType === "DLL" && loadsConfirmedEmpty && ($profile?.role === "Teacher" || $profile?.role === "Master Teacher")}
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
                                        onclick={() => !periodLocked && (useManualTargets(), showTermPicker = true)}
                                        disabled={periodLocked}
                                        class="w-full p-3 rounded-md bg-surface-muted border border-border-subtle transition-colors text-left flex items-center justify-between group {periodLocked
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
                                                    {calendarPendingLabel || "Select Term"}
                                                </p>
                                            {/if}
                                        </div>
                                        <div class="px-2 py-1 rounded bg-gov-blue/10 text-gov-blue text-xs font-semibold uppercase">
                                            {periodLocked ? 'Wait' : 'Edit'}
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
                                        onclick={() => !periodLocked && (useManualTargets(), showWeekPicker = true)}
                                        disabled={periodLocked}
                                        class="w-full p-3 rounded-md bg-surface-muted border border-border-subtle transition-colors text-left flex items-center justify-between group {periodLocked
                                            ? 'opacity-60 cursor-not-allowed'
                                            : 'hover:border-gov-blue/30'}"
                                    >
                                        <div>
                                            {#if requiresTeachingLoadSelection($profile?.role || '', docType) && loadsConfirmedEmpty}
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
                                                    {calendarPendingLabel || "Select Week"}
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
                                            {periodLocked ? 'Wait' : 'Edit'}
                                        </div>
                                    </button>
                                </div>
                                {/if}
                            </div>
                        </div>

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
                                    processing || checkingTarget}
                                class="gov-btn-primary mt-4 w-full"
                            >
                                {#if processing || checkingTarget}
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
                                    {checkingTarget && !processing ? 'Checking upload...' : 'Uploading...'}
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
                                    Review upload
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
                        <p><strong>Teaching Load:</strong> {teachingLoads.find((load) => load.id === teachingLoadId)?.subject || "Not selected"} · {gradeLabel(teachingLoads.find((load) => load.id === teachingLoadId)?.grade_level)}</p>
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
                {#if targetsFromFileName}<p class="rounded-xl border border-gov-gold/30 bg-gov-gold/10 px-4 py-3 text-sm text-gov-gold-dark">These details came from the file name, not the document. Confirm only if the file is named correctly.</p>{/if}
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
                <div class="flex items-center gap-2">
                <button onclick={() => void refreshTeachingLoads()} disabled={loadingTeachingLoads}
                    class="min-h-11 rounded-lg px-3 text-sm font-semibold text-gov-blue hover:bg-surface-muted disabled:opacity-50">
                    {loadingTeachingLoads ? "Updating…" : "Refresh loads"}
                </button>
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
            </div>
            <div class="max-h-[60vh] overflow-y-auto p-4 space-y-2">
                {#if loadingTeachingLoads && !teachingLoads.length}
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
                                markTargetChosen();
                            }}
                            role="option"
                            aria-selected={teachingLoadId === load.id}
                            class="w-full min-h-14 rounded-lg border px-4 py-2.5 text-left transition-colors flex items-center justify-between group {teachingLoadId === load.id
                                ? 'border-gov-blue/20 bg-surface-muted text-gov-blue'
                                : 'border-transparent bg-surface-white text-text-primary hover:bg-surface-muted'}"
                        >
                            <div>
                                <p class="font-bold text-lg">{load.subject}</p>
                                <p class="text-sm font-semibold text-text-secondary">
                                    {gradeLabel(load.grade_level)}
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
                            {#if loadsConfirmedEmpty}
                                <p class="text-sm font-semibold text-text-primary">You have no active teaching loads.</p>
                                <a class="mt-2 inline-block text-sm font-bold text-gov-blue underline" href="/dashboard/load">Open Teaching Load</a>
                            {:else}
                                <p class="text-sm font-semibold text-text-primary">Your teaching loads have not loaded yet.</p>
                                <p class="text-sm text-text-muted mt-2">The connection is slow. The system keeps trying by itself.</p>
                            {/if}
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
        docType={completedDetails?.docType || docType}
        weekNumber={completedDetails?.weekNumber}
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
                            termNumber = calendarEntries.find((w) => w.week_number === wk && (!termNumber || w.term === termNumber))?.term || termNumber;
                            targetConfirmed = !!teachingLoadId && !!termNumber && !!wk;
                            showWeekPicker = false;
                            markTargetChosen();
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
                            markTargetChosen();
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
                            Weeks 1–14
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
