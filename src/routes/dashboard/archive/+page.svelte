<script lang="ts">
    import { supabase, getRows } from "$lib/utils/supabase";
    import PageHeader from '$lib/components/PageHeader.svelte';
    import { profile } from "$lib/utils/auth";
    import StatusBadge from "$lib/components/StatusBadge.svelte";
    import FolderCard from "$lib/components/FolderCard.svelte";
    import { normalizeComplianceStatus } from "$lib/utils/useDashboardData";
    import {
        canAddReviewRemarks,
        canAddRemarkToISPISR,
        canViewUploadedISPISR,
    } from "$lib/utils/documentPermissions";
    import { shareVerification } from "$lib/utils/shareIntegration";
    import { addToast } from "$lib/stores/toast";
    import { fly, fade } from "svelte/transition";
    import { onMount } from "svelte";
    import {
        FolderOpen,
        FileText,
        ChevronRight,
        Home,
        Search,
        Download,
        Eye,
        MessageSquare,
        Share2,
        Trash2,
        X,
        ArrowLeft,
        ArrowUpDown,
        ArrowRightLeft,
    } from "lucide-svelte";
    import { cacheMetadata, getCachedMetadata } from "$lib/utils/offline";
    import EmptyState from "$lib/components/EmptyState.svelte";
    import SkeletonLoader from "$lib/components/SkeletonLoader.svelte";
    import { focusTrap } from "$lib/actions/focusTrap";
    import { getDocumentLabel } from "$lib/utils/documentLabels";
    import { getCurrentSchoolYear } from "$lib/utils/schoolYear";
    import { logAudit } from "$lib/utils/audit";

    // â"€â"€ Types â"€â"€
    interface Submission {
        id: string;
        user_id: string;
        file_name: string;
        file_hash: string;
        file_size: number;
        doc_type: string;
        compliance_status: string;
        term_number: number | null;
        week_number: number | null;
        subject: string | null;
        grade_level?: string | null;
        teaching_load_id: string | null;
        created_at: string;
        file_path: string;
        uploader?: {
            full_name: string;
            school_id: string | null;
            district_id: string | null;
            avatar_url?: string | null;
            role: string;
        };
        school_name?: string;
        school_avatar?: string | null;
    }

    interface PathSegment {
        type: "root" | "docType" | "school" | "teacher" | "grade" | "subject" | "term" | "week";
        id: string;
        label: string;
    }

    interface FolderItem {
        id: string;
        label: string;
        count: number;
        type: "docType" | "school" | "teacher" | "grade" | "subject" | "term" | "week";
        icon?: string;
        avatar_url?: string | null;
    }

    // â"€â"€ State â"€â"€
    let allSubmissions = $state<Submission[]>([]);
    let schoolsMap = $state<Record<string, { label: string; avatar_url: string | null }>>({});
    let teachersMap = $state<Record<string, { label: string; avatar_url: string | null }>>({});
    let loading = $state(true);
    let loadError = $state<string | null>(null);
    let searchQuery = $state("");
    let currentPage = $state(1);
    let folderPage = $state(1);
    const pageSize = 8;
    const folderPageSize = 10;
    let currentPath = $state<PathSegment[]>([
        { type: "root", id: "root", label: "Archive" },
    ]);

    // â"€â"€ Remarks & Review Status â"€â"€
    let reviewsMap = $state<Record<string, { reviewer_comment: string | null; status: string | null; return_reason: string | null; reviewer_id: string | null; reviewer_name: string | null }>>({});
    let statusFilter = $state<"all" | "for-checking" | "checked">("all");
    let sortField = $state<"date" | "name" | "grade" | "size">("date");
    let sortDir = $state<"asc" | "desc">("desc");

    let remarkModalOpen = $state(false);
    let remarkTarget = $state<Submission | null>(null);
    let remarkText = $state("");
    let existingRemark = $state<string | null>(null);
    let savingRemark = $state(false);
    let openingSubmissionId = $state<string | null>(null);
    let deleteModalOpen = $state(false);
    let deleteTarget = $state<Submission | null>(null);
    let deletingSubmissionId = $state<string | null>(null);
    let moveTarget = $state<Submission | null>(null);
    let moveLoads = $state<any[]>([]);
    let moveLoadId = $state("");
    let moveTerm = $state<number | null>(null);
    let moveWeek = $state<number | null>(null);
    let moveStatus = $state<"compliant" | "supplementary">("compliant");
    let moveCalendarEntries = $state<any[]>([]);
    let movingSubmission = $state(false);
    let requestedReview = $state<string | null>(null);
    let fromCompliance = $state(false);
    $effect(() => {
        if (loading || !requestedReview) return;
        const id = requestedReview;
        requestedReview = null;
        const target = filteredByPath.find(s => s.id === id);
        if (target && canAddRemarkToSubmission(target)) openRemarkModal(target);
        else addToast('error', 'This document is unavailable or you do not have permission to review it.');
    });

    const canReview = $derived(
        $profile ? canAddReviewRemarks($profile.role) : false,
    );

    function isLessonPlanDoc(docType: string | null | undefined): boolean {
        const normalized = (docType || "").toUpperCase();
        return normalized === "DLL" || normalized === "DLP";
    }

    function getArchiveDocTypeId(docType: string | null | undefined): string {
        return isLessonPlanDoc(docType) ? "DLL" : (docType || "Other");
    }

    function getArchiveSubject(sub: Submission): string {
        return sub.subject || (isLessonPlanDoc(sub.doc_type) ? "Unassigned" : getDocumentLabel(sub.doc_type));
    }

    function getArchiveGrade(sub: Submission): string {
        const grade = (sub.grade_level || "").trim();
        return grade || "Unassigned Grade";
    }

    function canAddRemarkToSubmission(sub: Submission): boolean {
        if (!$profile) return false;
        // For ISP/ISR, check the specific uploader role
        if (sub.doc_type === 'ISP' || sub.doc_type === 'ISR') {
            return canAddRemarkToISPISR(
                $profile.role,
                sub.uploader?.role || 'Teacher',
                sub.doc_type
            );
        }
        // For DLL, anyone who can review can add remarks
        return canReview;
    }

    function canViewRemarkForSubmission(sub: Submission): boolean {
        if (!$profile) return false;
        if (!reviewsMap[sub.id]?.reviewer_comment) return canAddRemarkToSubmission(sub);

        if ($profile.role === "Teacher") {
            return sub.user_id === $profile.id;
        }

        return canAddRemarkToSubmission(sub);
    }

    // Keep Archive review filters aligned with Compliance and the Review Tracker.
    // ISP/ISR and missing/unsubmitted records are not part of the DLL review queue.
    function isReviewQueueSubmission(sub: Submission): boolean {
        const docType = (sub.doc_type || "").toUpperCase();
        const status = (sub.compliance_status || "").toLowerCase();
        return (docType === "DLL" || docType === "DLP") &&
            ["compliant", "on-time", "late", "supplementary", "extra"].includes(status);
    }

    function hasReviewRemark(submissionId: string): boolean {
        return !!reviewsMap[submissionId]?.reviewer_comment?.trim();
    }

    function canDeleteSubmission(sub: Submission): boolean {
        if (!$profile) return false;
        return sub.user_id === $profile.id && ($profile.role === "Teacher" || $profile.role === "Master Teacher");
    }

    function canMoveSubmission(sub: Submission): boolean {
        return $profile?.role === "Admin" && isLessonPlanDoc(sub.doc_type);
    }

    async function openMoveModal(sub: Submission) {
        if (!canMoveSubmission(sub)) return;
        const { data: loads } = await supabase
            .from("teaching_loads")
            .select("id, user_id, subject, grade_level, is_active")
            .eq("user_id", sub.user_id)
            .eq("is_active", true)
            .order("grade_level")
            .order("subject");
        const { data: calendar } = await supabase
            .from("academic_calendar")
            .select("id, term, week_number, deadline_date, is_active, school_year")
            .eq("school_year", getCurrentSchoolYear())
            .eq("is_active", true)
            .order("term")
            .order("week_number");
        moveTarget = sub;
        moveLoads = loads || [];
        moveCalendarEntries = calendar || [];
        moveLoadId = sub.teaching_load_id || "";
        moveTerm = sub.term_number;
        moveWeek = sub.week_number;
        moveStatus = sub.compliance_status === "supplementary" ? "supplementary" : "compliant";
    }

    function closeMoveModal() {
        if (movingSubmission) return;
        moveTarget = null;
        moveLoads = [];
        moveLoadId = "";
        moveCalendarEntries = [];
        moveStatus = "compliant";
    }

    async function confirmMove() {
        if (!moveTarget || $profile?.role !== "Admin") return;
        const load = moveLoads.find((item) => item.id === moveLoadId);
        const calendar = moveCalendarEntries.find((item) => item.term === moveTerm && item.week_number === moveWeek);
        if (!load || !moveTerm || !moveWeek || !calendar) {
            addToast("error", "Choose a valid teaching load, term, and open week.");
            return;
        }
        movingSubmission = true;
        let { data, error } = await supabase.rpc("admin_move_submission", {
            p_submission_id: moveTarget.id,
            p_teaching_load_id: load.id,
            p_term_number: moveTerm,
            p_week_number: moveWeek,
            p_calendar_id: calendar.id,
            p_compliance_status: moveStatus,
        });
        if (error?.code === "PGRST202" || error?.message?.includes("schema cache")) {
            const fallback = await supabase.rpc("admin_move_submission", {
                p_submission_id: moveTarget.id,
                p_teaching_load_id: load.id,
                p_term_number: moveTerm,
                p_week_number: moveWeek,
                p_calendar_id: calendar.id,
            });
            data = fallback.data;
            error = fallback.error;
        }
        if (error) {
            addToast("error", error.message || "Could not move the archive file.");
        } else {
            const updated = { ...moveTarget, teaching_load_id: load.id, subject: load.subject, grade_level: load.grade_level, term_number: moveTerm, week_number: moveWeek, compliance_status: moveStatus };
            allSubmissions = allSubmissions.map((item) => item.id === updated.id ? updated : item);
            addToast("success", "Archive file moved. Original file, QR code, uploader, upload time, and remarks were preserved.");
            closeMoveModal();
        }
        movingSubmission = false;
    }

    function openDeleteModal(sub: Submission) {
        if (!canDeleteSubmission(sub) || deletingSubmissionId) return;
        deleteTarget = sub;
        deleteModalOpen = true;
    }

    function closeDeleteModal() {
        if (deletingSubmissionId) return;
        deleteModalOpen = false;
        deleteTarget = null;
    }

    function openRemarkModal(sub: Submission) {
        if (!canViewRemarkForSubmission(sub)) return;
        remarkTarget = sub;
        remarkText = "";
        existingRemark = reviewsMap[sub.id]?.reviewer_comment || null;
        remarkText = existingRemark || "";
        remarkModalOpen = true;
    }

    function closeRemarkModal() {
        remarkModalOpen = false;
        remarkTarget = null;
    }

    async function saveRemark() {
        if (!remarkTarget || !canAddRemarkToSubmission(remarkTarget)) {
            addToast(
                "error",
                "You don't have permission to add remarks to this document",
            );
            return;
        }
        if (!remarkText.trim() || !$profile) return;
        savingRemark = true;
        const { error } = await supabase.from("dll_reviews").upsert({
            submission_id: remarkTarget.id,
            reviewer_id: $profile.id,
            reviewer_comment: remarkText.trim(),
            status: "needs-check",
        }, { onConflict: "submission_id" });
        savingRemark = false;
        if (error) {
            addToast("error", "Failed to save remark: " + error.message);
        } else {
            reviewsMap[remarkTarget.id] = {
                reviewer_comment: remarkText.trim(),
                status: "needs-check",
                return_reason: null,
                reviewer_id: $profile.id,
                reviewer_name: $profile.full_name || "Checker",
            };
            addToast("success", "Remark saved successfully");
            void logAudit($profile!.id, "remark.created", "submission", remarkTarget.id, { document_type: remarkTarget.doc_type });
            closeRemarkModal();
        }
    }

    // â"€â"€ Lifecycle â"€â"€
    // Reactive on $profile?.id (not just onMount) as defense-in-depth: if the
    // resolved profile ever changes after mount (auth state event, token
    // refresh resolving a different cached vs. server profile, etc.), this
    // re-fetches scoped to whichever account is actually current instead of
    // being locked to whatever was true at the moment this page first mounted.
    let loadedForProfileId: string | null = null;
    let loadRun = 0;
    $effect(() => {
        const currentId = $profile?.id ?? null;
        if (currentId && currentId !== loadedForProfileId) {
            loadedForProfileId = currentId;
            const runId = ++loadRun;
            loading = true;
            allSubmissions = [];
            loadData().then(() => {
                if (runId === loadRun) loading = false;
            });
        }
    });

    onMount(() => {
        requestedReview = new URLSearchParams(window.location.search).get('review');
        fromCompliance = !!requestedReview;
        const onRefresh = () => {
            if (!$profile || document.hidden) return;
            const runId = ++loadRun;
            loadData().finally(() => {
                if (runId === loadRun) loading = false;
            });
        };
        window.addEventListener("cedims:refresh-visible-route", onRefresh);
        return () => window.removeEventListener("cedims:refresh-visible-route", onRefresh);
    });

    // â"€â"€ Data Fetching â"€â"€
    async function loadData() {
        const runId = loadRun;
        loadError = null;
        const userProfile = $profile;
        if (!userProfile) return;

        const role = userProfile.role;
        const currentSchoolYear = getCurrentSchoolYear();
        // Offline: restore cached archive view
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            const cached = await getCachedMetadata(`archive_state_${role}_${userProfile.id}`);
            if (cached?.data) {
                if (runId !== loadRun) return;
                allSubmissions = cached.data.submissions || [];
                schoolsMap = cached.data.schoolsMap || {};
                teachersMap = cached.data.teachersMap || {};
                reviewsMap = cached.data.reviewsMap || {};
                return;
            }
            allSubmissions = [];
            loadError = "You are offline and no cached archive is available on this device yet.";
            return;
        }

        try {

        if (role === "Teacher") {
            const { data } = await supabase
                .from("submissions")
                .select("*, uploader:profiles!inner(full_name, school_id, district_id, avatar_url, role)")
                .eq("user_id", userProfile.id)
                .eq("school_year", currentSchoolYear)
                .in("doc_type", ["DLL", "DLP"])
                .order("created_at", { ascending: false });
            if (runId !== loadRun) return;
            allSubmissions = getRows<Submission>(data).filter((s) => s.user_id === userProfile.id);
            teachersMap = buildTeachersMap(allSubmissions);
            if (userProfile.school_id) {
                const { data: school } = await supabase
                    .from("schools")
                    .select("id, name, avatar_url")
                    .eq("id", userProfile.school_id)
                    .maybeSingle();
                if (school) {
                    schoolsMap = {
                        [school.id]: { label: school.name, avatar_url: school.avatar_url || null },
                    };
                }
            }
        } else if (role === "Master Teacher") {
            if (!userProfile.school_id) return;

            const { data } = await supabase
                .from("submissions")
                .select(
                    "*, uploader:profiles!inner(full_name, school_id, district_id, avatar_url, role)",
                )
                .eq("profiles.school_id", userProfile.school_id)
                .eq("school_year", currentSchoolYear)
                .in("doc_type", ["DLL", "DLP", "ISP", "ISR"])
                .order("created_at", { ascending: false });
            if (runId !== loadRun) return;

            allSubmissions = getRows<Submission>(data)
                .filter(s => canViewUploadedISPISR(
                    role,
                    userProfile.id,
                    s.user_id,
                    s.uploader?.role || 'Teacher',
                    s.doc_type,
                    userProfile.school_id,
                    s.uploader?.school_id || null,
                    userProfile.district_id,
                    s.uploader?.district_id || null
                ));
            teachersMap = buildTeachersMap(allSubmissions);
        } else if (role === "School Head") {
            if (!userProfile.school_id) return;

            const { data } = await supabase
                .from("submissions")
                .select(
                    "*, uploader:profiles!inner(full_name, school_id, district_id, avatar_url, role)",
                )
                .eq("profiles.school_id", userProfile.school_id)
                .eq("school_year", currentSchoolYear)
                .in("doc_type", ["DLL", "DLP", "ISP", "ISR"])
                .order("created_at", { ascending: false });
            if (runId !== loadRun) return;

            allSubmissions = getRows<Submission>(data)
                .filter(s => canViewUploadedISPISR(
                    role,
                    userProfile.id,
                    s.user_id,
                    s.uploader?.role || 'Teacher',
                    s.doc_type,
                    userProfile.school_id,
                    s.uploader?.school_id || null,
                    userProfile.district_id,
                    s.uploader?.district_id || null
                ));
            teachersMap = buildTeachersMap(allSubmissions);
        } else if (role === "District Supervisor" || role === "Admin") {
            // District-scoped: fetch submissions from all schools in district
            if (role === "District Supervisor" && !userProfile.district_id) return;

            // First get all schools in the district
            let schoolsQuery = supabase
                .from("schools")
                .select("id, name, avatar_url");
            if (role === "District Supervisor" || role === "Admin") {
                if (userProfile.district_id) {
                    schoolsQuery = schoolsQuery.eq("district_id", userProfile.district_id);
                }
            }
            const { data: schoolsData } = await schoolsQuery;
            if (runId !== loadRun) return;

            const schools = schoolsData || [];
            const sMap: Record<string, { label: string; avatar_url: string | null }> = {};
            for (const s of schools) {
                sMap[s.id] = {
                    label: s.name,
                    avatar_url: s.avatar_url || null
                };
            }
            schoolsMap = sMap;

            // Fetch all submissions from teachers in those schools
            let submissionsQuery = supabase
                .from("submissions")
                .select(
                    "*, uploader:profiles!inner(full_name, school_id, district_id, avatar_url, role)",
                )
                .eq("school_year", currentSchoolYear)
                .in("doc_type", ["DLL", "DLP", "ISP", "ISR"])
                .order("created_at", { ascending: false });
            if (role === "District Supervisor" || role === "Admin") {
                if (userProfile.district_id) {
                    submissionsQuery = submissionsQuery.eq("profiles.district_id", userProfile.district_id);
                } else if (role === "District Supervisor") {
                    return;
                }
            }
            const { data } = await submissionsQuery;
            if (runId !== loadRun) return;

            allSubmissions = getRows<Submission>(data).map((s) => {
                const schoolInfo = sMap[s.uploader?.school_id || ""];
                return {
                    ...s,
                    uploader: s.uploader,
                    school_name: schoolInfo?.label || "Unknown School",
                    school_avatar: schoolInfo?.avatar_url || null
                };
            });
            teachersMap = buildTeachersMap(allSubmissions);
        }

        // â"€â"€ Resolve missing school names â"€â"€
        const missingSchoolIds = [...new Set(allSubmissions
            .filter(s => s.uploader?.school_id && !schoolsMap[s.uploader.school_id])
            .map(s => s.uploader!.school_id!)
        )];
        if (missingSchoolIds.length > 0) {
            const { data: missingSchools } = await supabase
                .from("schools")
                .select("id, name, avatar_url")
                .in("id", missingSchoolIds);
            if (missingSchools) {
                for (const ms of missingSchools) {
                    schoolsMap[ms.id] = { label: ms.name, avatar_url: ms.avatar_url || null };
                }
            }
        }

        // Resolve missing subject/grade details from teaching_loads for lesson-plan archives.
        const missingLoadIds = [...new Set(allSubmissions
            .filter(s => s.teaching_load_id && (!s.subject || !s.grade_level))
            .map(s => s.teaching_load_id!)
        )];
        if (missingLoadIds.length > 0) {
            const { data: loads } = await supabase
                .from("teaching_loads")
                .select("id, subject, grade_level")
                .in("id", missingLoadIds);
            if (loads) {
                const loadMap: Record<string, { subject: string | null; grade_level: string | null }> = {};
                for (const l of loads) {
                    loadMap[l.id] = { subject: l.subject, grade_level: l.grade_level };
                }
                for (const s of allSubmissions) {
                    const load = s.teaching_load_id ? loadMap[s.teaching_load_id] : null;
                    if (!load) continue;
                    if (!s.subject && load.subject) {
                        s.subject = load.subject;
                    }
                    if (!s.grade_level && load.grade_level) {
                        s.grade_level = load.grade_level;
                    }
                }
            }
        }

        // Fallback: resolve subject/grade for older submissions without teaching_load_id.
        const userIdsWithMissingLoadDetails = [...new Set(allSubmissions
            .filter(s => (!s.subject || !s.grade_level) && !s.teaching_load_id && s.user_id)
            .map(s => s.user_id!)
        )];
        if (userIdsWithMissingLoadDetails.length > 0) {
            const { data: userLoads } = await supabase
                .from("teaching_loads")
                .select("user_id, subject, grade_level")
                .in("user_id", userIdsWithMissingLoadDetails)
                .eq("is_active", true);
            if (userLoads) {
                const userLoadMap: Record<string, { subject: string | null; grade_level: string | null }[]> = {};
                for (const l of userLoads) {
                    (userLoadMap[l.user_id] ||= []).push({ subject: l.subject, grade_level: l.grade_level });
                }
                for (const s of allSubmissions) {
                    const loadsForUser = s.user_id ? userLoadMap[s.user_id] || [] : [];
                    const load = loadsForUser.find((item) =>
                        item.subject && s.subject && item.subject.trim().toLowerCase() === s.subject.trim().toLowerCase(),
                    ) || (loadsForUser.length === 1 ? loadsForUser[0] : null);
                    if (!load || s.teaching_load_id) continue;
                    if (!s.subject && load.subject) {
                        s.subject = load.subject;
                    }
                    if (!s.grade_level && load.grade_level) {
                        s.grade_level = load.grade_level;
                    }
                }
            }
        }

        // Re-map school_name for DS submissions now that schoolsMap is complete
        for (const s of allSubmissions) {
            if (s.uploader?.school_id) {
                const info = schoolsMap[s.uploader.school_id];
                if (info) {
                    s.school_name = info.label;
                    s.school_avatar = info.avatar_url || null;
                }
            }
        }

        // Fill in missing teacher names
        const missingTeacherIds = [...new Set(allSubmissions
            .filter(s => s.user_id && !teachersMap[s.user_id])
            .map(s => s.user_id!)
        )];
        if (missingTeacherIds.length > 0) {
            const { data: missingProfiles } = await supabase
                .from("profiles")
                .select("id, full_name")
                .in("id", missingTeacherIds);
            if (missingProfiles) {
                for (const p of missingProfiles) {
                    teachersMap[p.id] = { label: p.full_name || p.id.slice(0, 8), avatar_url: null };
                }
            }
        }

        // Fetch dll_reviews for all loaded submissions
        const ids = allSubmissions.map((s) => s.id);
        if (ids.length > 0) {
            const reviews: any[] = [];
            const reviewBatchSize = 25;
            for (let i = 0; i < ids.length; i += reviewBatchSize) {
                const { data, error } = await supabase
                    .from("dll_reviews")
                    .select("submission_id, reviewer_id, reviewer_comment, status, return_reason")
                    .in("submission_id", ids.slice(i, i + reviewBatchSize));
                if (error) throw error;
                reviews.push(...(data || []));
            }
            if (reviews) {
                const reviewerIds = [...new Set(reviews.map((r: any) => r.reviewer_id).filter(Boolean))];
                const reviewerNames: Record<string, string> = {};
                if (reviewerIds.length > 0) {
                    const { data: reviewerProfiles } = await supabase
                        .from("profiles")
                        .select("id, full_name, email")
                        .in("id", reviewerIds);
                    for (const p of reviewerProfiles || []) {
                        reviewerNames[(p as any).id] = (p as any).full_name || (p as any).email || "Checker";
                    }
                }
                const map: Record<string, { reviewer_comment: string | null; status: string | null; return_reason: string | null; reviewer_id: string | null; reviewer_name: string | null }> = {};
                for (const r of reviews) {
                    map[r.submission_id] = {
                        reviewer_comment: r.reviewer_comment,
                        status: r.status,
                        return_reason: r.return_reason,
                        reviewer_id: r.reviewer_id,
                        reviewer_name: reviewerNames[r.reviewer_id] || "Checker",
                    };
                }
                reviewsMap = map;
            }
        }

        // â"€â"€ Cache finalized state for offline viewing ─â"€
        try {
            await cacheMetadata(`archive_state_${role}_${userProfile.id}`, {
                submissions: allSubmissions,
                schoolsMap,
                teachersMap,
                reviewsMap,
            });
        } catch (e) {
            console.warn("[archive] Failed to cache archive state:", e);
        }
        } catch (err) {
            console.error("[archive] Failed to load data:", err);
            loadError = 'Failed to load archive data. Please try refreshing the page.';
        }
    }

    // â"€â"€ Navigation â"€â"€
    function navigateTo(segment: PathSegment) {
        currentPath = [...currentPath, segment];
    }

    function navigateToBreadcrumb(index: number) {
        currentPath = currentPath.slice(0, index + 1);
    }

    function goBack() {
        if (currentPath.length > 1) {
            currentPath = currentPath.slice(0, -1);
        }
    }

    // â"€â"€ Current Level & Filtering â"€â"€
    const currentLevel = $derived(currentPath[currentPath.length - 1]);

    // Get submissions filtered by the current path
    const filteredByPath = $derived.by(() => {
        const role = $profile?.role || '';
        const userId = $profile?.id || '';
        let filtered = allSubmissions.filter((s) => {
            if (role === "Teacher" && s.user_id !== userId) {
                return false;
            }

            const canView = canViewUploadedISPISR(
                role,
                userId,
                s.user_id,
                s.uploader?.role || 'Teacher',
                s.doc_type,
                $profile?.school_id || null,
                s.uploader?.school_id || null,
                $profile?.district_id || null,
                s.uploader?.district_id || null
            );
            return canView;
        });
        for (const seg of currentPath) {
            if (seg.type === "docType") {
                filtered = filtered.filter((s) => getArchiveDocTypeId(s.doc_type) === seg.id);
            } else if (seg.type === "school") {
                filtered = filtered.filter(
                    (s) => s.uploader?.school_id === seg.id,
                );
            } else if (seg.type === "teacher") {
                filtered = filtered.filter((s) => s.user_id === seg.id);
            } else if (seg.type === "grade") {
                filtered = filtered.filter((s) => getArchiveGrade(s) === seg.id);
            } else if (seg.type === "subject") {
                filtered = filtered.filter((s) => getArchiveSubject(s) === seg.id);
            } else if (seg.type === "term") {
                filtered = filtered.filter((s) => getTermFolderId(s) === seg.id);
            } else if (seg.type === "week") {
                filtered = filtered.filter(
                    (s) => String(s.week_number) === seg.id,
                );
            }
        }
        // Apply search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(
                (s) =>
                    s.file_name.toLowerCase().includes(q) ||
                    s.doc_type?.toLowerCase().includes(q) ||
                    getDocumentLabel(s.doc_type).toLowerCase().includes(q) ||
                    s.grade_level?.toLowerCase().includes(q) ||
                    s.uploader?.full_name?.toLowerCase().includes(q) ||
                    s.file_hash?.toLowerCase().includes(q),
            );
        }
        // Status filter (for DLL review status)
        if (statusFilter !== "all") {
            filtered = filtered.filter((s) => {
                if (!isReviewQueueSubmission(s)) return false;
                const isChecked = hasReviewRemark(s.id);
                return statusFilter === "checked" ? isChecked : !isChecked;
            });
        }
        // Sort — keeps large document lists navigable instead of stuck in
        // whatever order the database happened to return them.
        filtered = [...filtered].sort((a, b) => {
            let cmp = 0;
            if (sortField === "date") {
                cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            } else if (sortField === "name") {
                cmp = a.file_name.localeCompare(b.file_name);
            } else if (sortField === "grade") {
                cmp = getArchiveGrade(a).localeCompare(getArchiveGrade(b), undefined, { numeric: true });
            } else if (sortField === "size") {
                cmp = (a.file_size || 0) - (b.file_size || 0);
            }
            return sortDir === "asc" ? cmp : -cmp;
        });
        return filtered;
    });

    // Determine what folders to show at the current level
    const currentFolders = $derived.by((): FolderItem[] => {
        const role = $profile?.role;
        const depth = currentPath.length;

        if (role === "Teacher") {
            if (depth === 1) return getDocTypeFolders(filteredByPath);
            if (depth === 2) return getSchoolFolders(filteredByPath);
            if (depth === 3) return getTeacherFolders(filteredByPath);
            if (depth === 4) return getGradeFolders(filteredByPath);
            if (depth === 5) return getSubjectFolders(filteredByPath);
            if (depth === 6) return getTermFolders(filteredByPath);
            if (depth === 7) return getWeekFolders(filteredByPath);
            return [];
        }

        if (role === "Master Teacher" || role === "School Head" || role === "District Supervisor" || role === "Admin") {
            if (depth === 1) return getDocTypeFolders(filteredByPath);
            if (depth === 2) return getSchoolFolders(filteredByPath);
            if (depth === 3) return getTeacherFolders(filteredByPath);
            const currentDocType = currentPath.find(p => p.type === "docType");
            if (depth === 4) {
                if (isLessonPlanDoc(currentDocType?.id)) return getGradeFolders(filteredByPath);
                return [];
            }
            if (depth === 5) return getSubjectFolders(filteredByPath);
            if (depth === 6) return getTermFolders(filteredByPath);
            if (depth === 7) return getWeekFolders(filteredByPath);
            return [];
        }

        return [];
    });

    // Whether we're at the file/leaf level
    const isFileLevel = $derived(
        currentFolders.length === 0 ||
            (searchQuery &&
                filteredByPath.length > 0 &&
                currentFolders.length === 0),
    );

    // â"€â"€ Pagination â"€â"€
    const totalPages = $derived(Math.ceil(filteredByPath.length / pageSize) || 1);
    const paginatedData = $derived(filteredByPath.slice((currentPage - 1) * pageSize, currentPage * pageSize));
    const totalFolderPages = $derived(Math.ceil(currentFolders.length / folderPageSize) || 1);
    const paginatedFolders = $derived(currentFolders.slice((folderPage - 1) * folderPageSize, folderPage * folderPageSize));

    $effect(() => {
        searchQuery;
        statusFilter;
        sortField;
        sortDir;
        currentPath;
        currentPage = 1;
        folderPage = 1;
    });

    $effect(() => {
        if (folderPage > totalFolderPages) folderPage = totalFolderPages;
    });

    // â"€â"€ Folder Generators â"€â"€
    function getDocTypeFolders(subs: Submission[]): FolderItem[] {
        const grouped = new Map<string, number>();
        for (const s of subs) {
            const dt = getArchiveDocTypeId(s.doc_type);
            grouped.set(dt, (grouped.get(dt) || 0) + 1);
        }

        const fixedTypes = ["DLL", "ISP", "ISR"];
        const dynamicTypes = Array.from(grouped.keys())
            .filter((dt) => !fixedTypes.includes(dt))
            .sort((a, b) => getDocumentLabel(a).localeCompare(getDocumentLabel(b)));

        const result = [...fixedTypes, ...dynamicTypes].map((dt) => ({
            id: dt,
            label: getDocumentLabel(dt),
            count: grouped.get(dt) || 0,
            type: "docType" as const,
        }));
        return result;
    }

    function getSchoolFolders(subs: Submission[]): FolderItem[] {
        const grouped = new Map<string, number>();
        for (const s of subs) {
            const sid = s.uploader?.school_id;
            if (sid) {
                grouped.set(sid, (grouped.get(sid) || 0) + 1);
            }
        }
        return Array.from(grouped.entries())
            .sort(([a], [b]) =>
                (schoolsMap[a]?.label || a).localeCompare(schoolsMap[b]?.label || b),
            )
            .map(([sid, count]) => {
                const info = schoolsMap[sid];
                return {
                    id: sid,
                    label: info?.label || "Unknown School",
                    count,
                    type: "school" as const,
                    avatar_url: info?.avatar_url || null
                };
            });
    }

    function getTeacherFolders(subs: Submission[]): FolderItem[] {
        const grouped = new Map<string, number>();
        for (const s of subs) {
            if (s.user_id) {
                grouped.set(s.user_id, (grouped.get(s.user_id) || 0) + 1);
            }
        }
        return Array.from(grouped.entries())
            .sort(([a], [b]) =>
                (teachersMap[a]?.label || a).localeCompare(teachersMap[b]?.label || b),
            )
            .map(([uid, count]) => {
                const info = teachersMap[uid];
                return {
                    id: uid,
                    label: info?.label || "Unknown Teacher",
                    count,
                    type: "teacher" as const,
                    avatar_url: info?.avatar_url || null
                };
            });
    }

    function getSubjectFolders(subs: Submission[]): FolderItem[] {
        const grouped = new Map<string, number>();
        for (const s of subs) {
            const sub = getArchiveSubject(s);
            grouped.set(sub, (grouped.get(sub) || 0) + 1);
        }
        return Array.from(grouped.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([sub, count]) => ({
                id: sub,
                label: sub,
                count,
                type: "subject" as const,
            }));
    }

    function getGradeFolders(subs: Submission[]): FolderItem[] {
        const grouped = new Map<string, number>();
        for (const s of subs) {
            if (!isLessonPlanDoc(s.doc_type)) continue;
            const grade = getArchiveGrade(s);
            grouped.set(grade, (grouped.get(grade) || 0) + 1);
        }
        return Array.from(grouped.entries())
            .sort(([a], [b]) => {
                const na = parseInt(a.replace(/\D+/g, ""), 10);
                const nb = parseInt(b.replace(/\D+/g, ""), 10);
                if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
                if (a === "Unassigned Grade") return 1;
                if (b === "Unassigned Grade") return -1;
                return a.localeCompare(b);
            })
            .map(([grade, count]) => ({
                id: grade,
                label: grade,
                count,
                type: "grade" as const,
            }));
    }

    function getTermFolderId(submission: Submission): string {
        if (submission.term_number && Number.isFinite(submission.term_number)) {
            return String(Math.min(3, Math.max(1, submission.term_number)));
        }
        const pathTerm = submission.file_path?.match(/(?:^|\/)Term_([1-3])(?:\/|$)/i)?.[1];
        if (pathTerm) return pathTerm;
        return "unassigned";
    }

    function getTermFolders(subs: Submission[]): FolderItem[] {
        const grouped = new Map<string, number>();
        for (const s of subs) {
            if (!isLessonPlanDoc(s.doc_type)) continue;
            const term = getTermFolderId(s);
            grouped.set(term, (grouped.get(term) || 0) + 1);
        }
        return Array.from(grouped.entries())
            .sort(([a], [b]) => {
                if (a === "unassigned") return 1;
                if (b === "unassigned") return -1;
                return Number(a) - Number(b);
            })
            .map(([term, count]) => ({
                id: term,
                label: term === "unassigned" ? "Unassigned Term" : `Term ${term}`,
                count,
                type: "term" as const,
            }));
    }

    function getWeekFolders(subs: Submission[]): FolderItem[] {
        const grouped = new Map<string, number>();
        for (const s of subs) {
            if (!isLessonPlanDoc(s.doc_type)) continue;
            const wk = String(s.week_number);
            grouped.set(wk, (grouped.get(wk) || 0) + 1);
        }
        return Array.from(grouped.entries())
            .sort(([a], [b]) => {
                const na = parseInt(a);
                const nb = parseInt(b);
                if (isNaN(na) && isNaN(nb)) return a.localeCompare(b);
                if (isNaN(na)) return 1;
                if (isNaN(nb)) return -1;
                return na - nb;
            })
            .map(([wk, count]) => ({
                id: wk,
                label: wk === "Unassigned" ? "Unassigned" : `Week ${wk}`,
                count,
                type: "week" as const,
            }));
    }

    // â"€â"€ File Helpers â"€â"€
    function formatDate(dateStr: string): string {
        return new Date(dateStr).toLocaleDateString("en-PH", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }

    function formatSize(bytes: number): string {
        if (!bytes) return "-";
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }

    async function getSignedUrl(path: string): Promise<string | null> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) return null;

            const res = await fetch('/api/storage/presign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ key: path, intent: 'download' })
            });

            if (!res.ok) throw new Error('Failed to get download URL');
            const { url } = await res.json();
            return url;
        } catch (err) {
            console.error("Error getting R2 signed URL:", err);
            return null;
        }
    }

    async function handleView(sub: Submission) {
        if (openingSubmissionId) return;
        const path = sub.file_path || `${sub.id}/${sub.file_name}`;
        // Open synchronously so popup blockers do not reject the tab after the
        // asynchronous presign request completes.
        const previewWindow = window.open("about:blank", "_blank");
        openingSubmissionId = sub.id;
        try {
            const url = await getSignedUrl(path);
            if (!url) throw new Error("Could not retrieve a secure preview link");
            if (previewWindow && !previewWindow.closed) {
                previewWindow.location.href = url;
            } else {
                window.location.href = url;
            }
        } catch (err) {
            previewWindow?.close();
            addToast("error", "Could not open this document. Please try again.");
        } finally {
            openingSubmissionId = null;
        }
    }

    async function handleDownload(sub: Submission) {
        const path = sub.file_path || `${sub.id}/${sub.file_name}`;
        const url = await getSignedUrl(path);
        
        if (!url) {
            addToast("error", "Download failed: could not generate secure link.");
            return;
        }

        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = sub.file_name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);
            addToast("success", `${sub.file_name} downloaded`);
        } catch (err) {
            console.error("Download error:", err);
            addToast("error", "Download failed during retrieval.");
        }
    }

    async function handleShare(sub: Submission) {
        const result = await shareVerification(sub.file_hash, sub.file_name);
        if (result?.success) {
            if (result.method === 'clipboard') {
                addToast("success", "Verification link copied to clipboard");
            }
        } else if (result?.error) {
            addToast("error", "Share failed: " + result.error);
        } else {
            addToast("info", "Share cancelled");
        }
    }

    async function deleteStorageObject(sub: Submission) {
        const path = sub.file_path || `${sub.id}/${sub.file_name}`;
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("You have been signed out. Please sign in again.");

        const res = await fetch('/api/storage/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ key: path })
        });

        if (!res.ok) {
            const detail = await res.text();
            throw new Error(detail || "Storage deletion failed.");
        }
    }

    async function confirmDelete() {
        const target = deleteTarget;
        if (!target || !canDeleteSubmission(target)) return;
        deletingSubmissionId = target.id;
        try {
            await deleteStorageObject(target);
            const { data: deletedRows, error: deleteError } = await supabase
                .from("submissions")
                .delete()
                .eq("id", target.id)
                .eq("user_id", $profile?.id || "")
                .select("id");
            if (deleteError) throw deleteError;
            if (!deletedRows?.length) throw new Error("No archive record was deleted. Please refresh and try again.");

            allSubmissions = allSubmissions.filter((s) => s.id !== target.id);
            const { [target.id]: _deleted, ...remainingReviews } = reviewsMap;
            reviewsMap = remainingReviews;
            void logAudit($profile!.id, "archive.deleted", "submission", target.id, { file_name: target.file_name, original_uploader: target.user_id });
            addToast("success", "Uploaded file deleted from Archives.");
            deleteModalOpen = false;
            deleteTarget = null;
        } catch (err: any) {
            console.error("Delete submission error:", err);
            addToast("error", err?.message || "Could not delete this file. Please try again.");
        } finally {
            deletingSubmissionId = null;
        }
    }

    function buildTeachersMap(subs: Submission[]) {
        const tMap: Record<string, { label: string; avatar_url: string | null }> = {};
        for (const s of subs) {
            if (s.user_id && s.uploader?.full_name) {
                tMap[s.user_id] = {
                    label: s.uploader.full_name,
                    avatar_url: s.uploader.avatar_url || null
                };
            }
        }
        return tMap;
    }

    function getSubtitle(): string {
        const role = $profile?.role;
        if (role === "Teacher")
            return "Find, review, download, and share your archived submissions";
        if (role === "District Supervisor" || role === "Admin")
            return "Review and export district archives";
        return "Review and export school archives";
    }
</script>

<svelte:head>
    <title>Archive â€" CEDIMS</title>
</svelte:head>

<div>
    <!-- Header -->
    <PageHeader title="Archives" description={getSubtitle()} />
    {#if fromCompliance}<a href="/dashboard/compliance" class="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gov-blue"><ArrowLeft size={16} />Back to compliance</a>{/if}

    <!-- Breadcrumb + Search Bar -->
    <div
        class="gov-card-static p-3 mb-4 flex flex-wrap items-center gap-2"
    >
        <!-- Breadcrumb -->
        <div class="flex items-center gap-1 min-w-0 max-w-full overflow-x-auto">
            {#if currentPath.length > 1}
                <button
                    onclick={goBack}
                    class="cedims-back-button flex-shrink-0"
                    title="Go back"
                    aria-label="Go back"
                >
                    <ArrowLeft size={18} />
                    Back
                </button>
            {/if}
            {#each currentPath as seg, i}
                {#if i > 0}
                    <ChevronRight
                        size={14}
                        class="text-text-muted flex-shrink-0 mx-0.5"
                    />
                {/if}
                <button
                    onclick={() => navigateToBreadcrumb(i)}
                    class="text-sm font-medium px-2 py-1 rounded-md transition-colors whitespace-nowrap flex-shrink-0
                        {i === currentPath.length - 1
                        ? 'text-gov-blue bg-gov-blue/5 font-bold'
                        : 'text-text-muted hover:text-text-primary hover:bg-surface-muted'}"
                >
                    {#if i === 0}
                        <span class="flex items-center gap-1.5">
                            <Home size={14} />
                            Archives
                        </span>
                    {:else}
                        {seg.label}
                    {/if}
                </button>
            {/each}
        </div>

        <!-- Search -->
        <div class="relative flex-1 min-w-[14rem] max-w-sm">
            <Search
                size={16}
                class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />
            <input
                type="text"
                bind:value={searchQuery}
                placeholder="Search files..."
                class="w-full pl-9 pr-3 py-2 text-sm bg-surface-muted border border-border-subtle rounded-lg focus:ring-2 focus:ring-gov-blue/30 focus:border-gov-blue outline-none min-h-[40px]"
            />
        </div>

        <!-- Status Filter -->
        <div class="flex items-center gap-1 bg-surface-muted border border-border-subtle rounded-lg p-1 flex-shrink-0">
            {#each ["all", "for-checking", "checked"] as opt}
                <button
                    onclick={() => (statusFilter = opt as typeof statusFilter)}
                    class="min-h-[36px] px-2.5 flex items-center justify-center text-xs font-bold rounded-md transition-colors {statusFilter === opt ? 'bg-gov-blue text-white shadow-sm' : 'text-text-muted hover:text-text-primary'}"
                >
                    {opt === "all" ? "All" : opt === "for-checking" ? "For Checking" : "Checked"}
                </button>
            {/each}
        </div>

        <!-- Sort -->
        <div class="flex items-center gap-1 flex-shrink-0">
            <select
                bind:value={sortField}
                aria-label="Sort files by"
                class="px-3 py-2 text-sm font-bold bg-surface-muted border border-border-subtle rounded-lg outline-none focus:ring-2 focus:ring-gov-blue/30 focus:border-gov-blue"
            >
                <option value="date">Date</option>
                <option value="name">Name</option>
                <option value="grade">Grade</option>
                <option value="size">Size</option>
            </select>
            <button
                type="button"
                onclick={() => (sortDir = sortDir === "asc" ? "desc" : "asc")}
                class="p-2 rounded-lg bg-surface-muted border border-border-subtle text-text-muted hover:text-gov-blue hover:border-gov-blue/30 transition-colors"
                title={sortDir === "asc" ? "Ascending, click to reverse" : "Descending, click to reverse"}
                aria-label="Toggle sort direction"
            >
                <ArrowUpDown size={16} class={sortDir === "asc" ? "" : "scale-y-[-1]"} />
            </button>
        </div>

    </div>

    <!-- Content -->
    {#if loading}
        <SkeletonLoader variant="card-grid" />
    {:else if loadError}
        <div class="gov-card-static p-6 text-center">
            <div class="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
                </svg>
            </div>
            <p class="text-red-600 dark:text-red-400 font-medium mb-2">Something went wrong</p>
            <p class="text-sm text-text-muted mb-4">{loadError}</p>
            <button onclick={() => { loadData(); }} class="px-4 py-2 bg-gov-blue text-white text-sm font-bold rounded-xl hover:bg-gov-blue-dark transition-colors">
                Try Again
            </button>
        </div>
    {:else if !isFileLevel && currentFolders.length > 0}
        <!-- Folder Grid -->
        <div
            class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
        >
            {#each paginatedFolders as folder, i (folder.id)}
                <FolderCard
                    label={folder.label}
                    count={folder.count}
                    type={folder.type}
                    avatar_url={folder.avatar_url}
                    onclick={() => navigateTo({ type: folder.type, id: folder.id, label: folder.label })}
                    transitionDelay={i * 40}
                />
            {/each}
        </div>
        <div class="cedims-pagination-shell mt-4 rounded-xl border border-border-subtle bg-surface-white px-4 py-3 shadow-sm">
            <p class="text-sm text-text-muted">
                Showing {(folderPage - 1) * folderPageSize + 1}&ndash;{Math.min(folderPage * folderPageSize, currentFolders.length)} of {currentFolders.length} folders
            </p>
            <div class="cedims-pagination">
                <button
                    onclick={() => { if (folderPage > 1) folderPage--; }}
                    disabled={folderPage <= 1}
                    class="cedims-page-button"
                >
                    Previous
                </button>
                <span class="cedims-page-indicator">
                    {folderPage} / {totalFolderPages}
                </span>
                <button
                    onclick={() => { if (folderPage < totalFolderPages) folderPage++; }}
                    disabled={folderPage >= totalFolderPages}
                    class="cedims-page-button is-next"
                >
                    Next
                </button>
            </div>
        </div>
    {:else if filteredByPath.length === 0}
        <!-- Empty State -->
        <div>
            <EmptyState
                icon={FolderOpen}
                title={searchQuery ? "No matching files" : "This folder is empty"}
                description={searchQuery
                    ? "Try a different search term."
                    : "No documents have been uploaded yet."}
                actionLabel={searchQuery ? "Clear Search" : ""}
                onAction={searchQuery ? () => (searchQuery = "") : undefined}
            />
        </div>
    {:else}
        <!-- File List -->
        <!-- File Grid -->
        <div
            class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
        >
            {#each paginatedData as sub, i (sub.id)}
                <div
                    class="gov-card p-0 overflow-hidden flex flex-col group h-[202px]"
                >
                    <!-- Card Top: Icon & Status -->
                    <div
                            class="p-3 flex-1 flex flex-col items-center text-center relative min-h-0"
                    >
                        <!-- Top Floating Status -->
                        <div class="absolute top-3 right-3">
                            <StatusBadge
                                status={normalizeComplianceStatus(
                                    sub.compliance_status,
                                )}
                                size="sm"
                            />
                        </div>

                        <!-- Centered Icon -->
                        <div
                            class="w-10 h-10 rounded-md bg-gov-blue/10 flex items-center justify-center mb-2 group-hover:scale-105 group-hover:bg-gov-blue/15 transition-[color,background-color,border-color,transform] duration-300 shadow-sm"
                        >
                            <FileText size={20} class="text-gov-blue" />
                        </div>

                        <!-- Filename -->
                        <div class="w-full min-h-[2.5rem] px-2 mb-2 flex items-start justify-center">
                            <h4
                                class="text-sm font-bold text-text-primary leading-tight line-clamp-2 break-words overflow-hidden max-w-full"
                                title={sub.file_name}
                            >
                                {sub.file_name}
                            </h4>
                        </div>

                        <!-- Metadata Row -->
                        <div
                            class="flex flex-wrap items-center justify-center gap-1 mt-auto"
                        >
                            {#if isLessonPlanDoc(sub.doc_type)}
                                {#if reviewsMap[sub.id]?.reviewer_comment}
                                    <span class="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-bold rounded uppercase tracking-wider">
                                        Checked
                                    </span>
                                {:else}
                                    <span class="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-bold rounded uppercase tracking-wider">
                                        For Checking
                                    </span>
                                {/if}
                            {/if}
                            <span
                                class="px-2 py-0.5 bg-gov-blue/5 text-gov-blue text-xs font-bold rounded uppercase tracking-wider"
                            >
                                {getDocumentLabel(sub.doc_type)}
                            </span>
                            {#if sub.week_number != null}
                                <span
                                    class="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 text-xs font-bold rounded uppercase tracking-wider"
                                >
                                    W{sub.week_number}
                                </span>
                            {/if}
                            {#if isLessonPlanDoc(sub.doc_type) && sub.grade_level}
                                <span
                                    class="px-2 py-0.5 bg-surface-muted text-text-secondary text-xs font-bold rounded uppercase tracking-wider"
                                >
                                    {sub.grade_level}
                                </span>
                            {/if}
                        </div>
                    </div>

                    <!-- Card Footer: Metadata & Actions -->
                    <div
                        class="px-3 py-2 bg-surface-muted border-t border-border-subtle flex items-center justify-between gap-2"
                    >
                        <div class="flex flex-col min-w-0">
                            <span
                                class="text-xs font-semibold text-text-muted uppercase tracking-tight whitespace-nowrap"
                            >
                                {formatDate(sub.created_at)}
                            </span>
                            {#if sub.file_size}
                                <span
                                    class="text-xs text-text-muted/70 font-medium"
                                >
                                    {formatSize(sub.file_size)}
                                </span>
                            {/if}
                        </div>

                        <!-- Action Buttons -->
                        <div class="flex items-center gap-1 flex-shrink-0">
                            <button
                                onclick={(e) => {
                                    e.stopPropagation();
                                    handleView(sub);
                                }}
                                class="w-8 h-8 flex items-center justify-center text-text-muted hover:text-gov-blue hover:bg-gov-blue/10 rounded-lg transition-colors"
                                title={openingSubmissionId === sub.id ? "Opening document" : "View document"}
                                aria-label={openingSubmissionId === sub.id ? "Opening document" : `View ${sub.file_name}`}
                                disabled={openingSubmissionId !== null}
                            >
                                <Eye size={16} />
                            </button>
                            {#if canViewRemarkForSubmission(sub)}
                                <button
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        openRemarkModal(sub);
                                    }}
                                    class="w-8 h-8 flex items-center justify-center text-text-muted hover:text-gov-gold-dark hover:bg-gov-gold/10 rounded-lg transition-colors"
                                    title={canAddRemarkToSubmission(sub) ? "Add Remarks" : "View Remarks"}
                                    aria-label={canAddRemarkToSubmission(sub) ? `Add remarks to ${sub.file_name}` : `View remarks for ${sub.file_name}`}
                                >
                                    <MessageSquare size={16} />
                                </button>
                            {/if}
                            <button
                                onclick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(sub);
                                }}
                                class="w-8 h-8 flex items-center justify-center text-text-muted hover:text-gov-blue hover:bg-gov-blue/10 rounded-lg transition-colors"
                                title="Download File"
                            >
                                <Download size={16} />
                            </button>
                            <button
                                onclick={(e) => {
                                    e.stopPropagation();
                                    handleShare(sub);
                                }}
                                class="w-8 h-8 flex items-center justify-center text-text-muted hover:text-gov-gold-dark hover:bg-gov-gold/10 rounded-lg transition-colors"
                                title="Share Verification Link"
                            >
                                <Share2 size={16} />
                            </button>
                            {#if canMoveSubmission(sub)}
                                <button
                                    onclick={(e) => { e.stopPropagation(); openMoveModal(sub); }}
                                    class="w-8 h-8 flex items-center justify-center text-text-muted hover:text-gov-blue hover:bg-gov-blue/10 rounded-lg transition-colors"
                                    title="Move archive file"
                                    aria-label={`Move ${sub.file_name}`}
                                >
                                    <ArrowRightLeft size={16} />
                                </button>
                            {/if}
                            {#if canDeleteSubmission(sub)}
                                <button
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        openDeleteModal(sub);
                                    }}
                                    class="w-8 h-8 flex items-center justify-center text-text-muted hover:text-gov-red hover:bg-gov-red/10 rounded-lg transition-colors"
                                    title="Delete uploaded file"
                                    aria-label={`Delete ${sub.file_name}`}
                                    disabled={deletingSubmissionId !== null}
                                >
                                    <Trash2 size={16} />
                                </button>
                            {/if}
                        </div>
                    </div>
                </div>
            {/each}
        </div>

        <!-- Pagination -->
        <div class="cedims-pagination-shell mt-6 rounded-xl border border-border-subtle bg-surface-white px-4 py-3 shadow-sm">
            <p class="text-sm text-text-muted">
                Showing {(currentPage - 1) * pageSize + 1}&ndash;{Math.min(currentPage * pageSize, filteredByPath.length)} of {filteredByPath.length} files
            </p>
            <div class="cedims-pagination">
                <button
                    onclick={() => { if (currentPage > 1) currentPage--; }}
                    disabled={currentPage <= 1}
                    class="cedims-page-button"
                >
                    Previous
                </button>
                <span class="cedims-page-indicator">
                    {currentPage} / {totalPages}
                </span>
                <button
                    onclick={() => { if (currentPage < totalPages) currentPage++; }}
                    disabled={currentPage >= totalPages}
                    class="cedims-page-button is-next"
                >
                    Next
                </button>
            </div>
        </div>
    {/if}
</div>

{#if moveTarget}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="presentation">
        <div class="w-full max-w-lg mx-4 rounded-2xl bg-surface-white shadow-2xl border border-border-subtle overflow-hidden" role="dialog" aria-modal="true" aria-label="Move archive file" use:focusTrap>
            <div class="px-6 py-4 border-b border-border-subtle flex items-center justify-between">
                <div><p class="text-xs font-bold text-gov-blue uppercase tracking-wide">Admin correction</p><h3 class="text-lg font-bold text-text-primary">Move archive file</h3></div>
                <button onclick={closeMoveModal} class="w-9 h-9 rounded-lg hover:bg-surface-muted flex items-center justify-center text-text-muted" aria-label="Close move dialog" disabled={movingSubmission}><X size={18} /></button>
            </div>
            <div class="px-6 py-5 space-y-4">
                <p class="text-sm text-text-secondary">Only the archive target will change. The original file, QR code, upload time, uploader, file hash, and remarks will remain unchanged.</p>
                <p class="text-sm font-bold text-text-primary break-words">{moveTarget.file_name}</p>
                <label class="block text-sm font-semibold text-text-primary">Teaching load
                    <select bind:value={moveLoadId} class="mt-1 w-full min-h-11 rounded-lg border border-border-subtle bg-surface-white px-3 text-sm">
                        <option value="">Select teaching load</option>
                        {#each moveLoads as load}<option value={load.id}>{load.grade_level} · {load.subject}</option>{/each}
                    </select>
                </label>
                <div class="grid grid-cols-2 gap-3">
                    <label class="block text-sm font-semibold text-text-primary">Term
                        <select bind:value={moveTerm} class="mt-1 w-full min-h-11 rounded-lg border border-border-subtle bg-surface-white px-3 text-sm">
                            <option value={null}>Select term</option>
                            {#each [...new Set(moveCalendarEntries.map((entry) => entry.term))] as term}<option value={term}>Term {term}</option>{/each}
                        </select>
                    </label>
                    <label class="block text-sm font-semibold text-text-primary">Week
                        <select bind:value={moveWeek} class="mt-1 w-full min-h-11 rounded-lg border border-border-subtle bg-surface-white px-3 text-sm">
                            <option value={null}>Select week</option>
                            {#each moveCalendarEntries.filter((entry) => !moveTerm || entry.term === Number(moveTerm)) as entry}<option value={entry.week_number}>Week {entry.week_number}</option>{/each}
                        </select>
                    </label>
                </div>
                <label class="block text-sm font-semibold text-text-primary">Archive status
                    <select bind:value={moveStatus} class="mt-1 w-full min-h-11 rounded-lg border border-border-subtle bg-surface-white px-3 text-sm">
                        <option value="compliant">Compliant</option>
                        <option value="supplementary">Supplementary</option>
                    </select>
                </label>
                {#if moveLoadId && moveTerm && moveWeek}
                    {@const selectedLoad = moveLoads.find((load) => load.id === moveLoadId)}
                    <div class="rounded-xl border border-gov-blue/20 bg-gov-blue/5 px-4 py-3 text-sm text-text-primary">New archive path: <strong>{selectedLoad?.grade_level} · {selectedLoad?.subject} · Term {moveTerm} · Week {moveWeek}</strong></div>
                {/if}
            </div>
            <div class="px-6 py-4 bg-surface-muted border-t border-border-subtle flex justify-end gap-3">
                <button onclick={closeMoveModal} class="min-h-11 px-4 rounded-xl border border-border-subtle bg-surface-white text-sm font-bold" disabled={movingSubmission}>Cancel</button>
                <button onclick={confirmMove} class="min-h-11 px-4 rounded-xl bg-gov-blue text-white text-sm font-bold disabled:opacity-60" disabled={movingSubmission || !moveLoadId || !moveTerm || !moveWeek}>{movingSubmission ? "Moving..." : "Move file"}</button>
            </div>
        </div>
    </div>
{/if}

<!-- Delete Confirmation Modal -->
{#if deleteModalOpen && deleteTarget}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onclick={closeDeleteModal}
        transition:fade={{ duration: 150 }}
    >
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="w-full max-w-md mx-4 rounded-2xl bg-surface-white shadow-2xl border border-border-subtle overflow-hidden"
            onclick={(e) => e.stopPropagation()}
            transition:fly={{ y: 20, duration: 180 }}
        >
            <div class="px-6 py-4 border-b border-border-subtle flex items-center justify-between">
                <div>
                    <p class="text-xs font-bold text-gov-red uppercase tracking-wide">Delete upload</p>
                    <h3 class="text-lg font-bold text-text-primary">Remove this archive file?</h3>
                </div>
                <button
                    onclick={closeDeleteModal}
                    class="w-9 h-9 rounded-lg hover:bg-surface-muted flex items-center justify-center text-text-muted"
                    aria-label="Close delete confirmation"
                    disabled={deletingSubmissionId !== null}
                >
                    <X size={18} />
                </button>
            </div>

            <div class="px-6 py-4 space-y-3">
                <p class="text-sm text-text-primary">
                    This will delete <strong>{deleteTarget.file_name}</strong> from your Archives and remove it from compliance tracking.
                </p>
                <p class="rounded-xl border border-gov-red/20 bg-gov-red/5 px-3 py-2 text-sm font-medium text-gov-red">
                    Use this only when the file was uploaded with the wrong subject, teaching load, week, or document.
                </p>
            </div>

            <div class="px-6 py-4 bg-surface-muted border-t border-border-subtle flex justify-end gap-3">
                <button
                    onclick={closeDeleteModal}
                    class="min-h-11 px-4 rounded-xl border border-border-subtle bg-surface-white text-sm font-bold text-text-primary hover:bg-surface-muted"
                    disabled={deletingSubmissionId !== null}
                >
                    Cancel
                </button>
                <button
                    onclick={confirmDelete}
                    class="min-h-11 px-4 rounded-xl bg-gov-red text-white text-sm font-bold hover:bg-gov-red-dark disabled:opacity-60"
                    disabled={deletingSubmissionId !== null}
                >
                    {deletingSubmissionId === deleteTarget.id ? "Deleting..." : "Delete file"}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Remarks Modal -->
{#if remarkModalOpen && remarkTarget}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onclick={closeRemarkModal}
        onkeydown={(e) => { if (e.key === 'Escape') closeRemarkModal(); }}
        role="presentation"
        tabindex="-1"
    >
        <div
            class="bg-surface-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => { if (e.key === 'Escape') closeRemarkModal(); }}
            role="dialog"
            aria-modal="true"
            aria-label="Document remarks"
            tabindex="-1"
            use:focusTrap
        >
            <div class="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
                <div>
                    <h3 class="text-lg font-bold text-text-primary">
                        {#if existingRemark}
                            Remark for {getDocumentLabel(remarkTarget?.doc_type)}
                        {:else if canAddRemarkToSubmission(remarkTarget)}
                            Add Remark to {getDocumentLabel(remarkTarget?.doc_type)}
                        {:else}
                            View Remarks
                        {/if}
                    </h3>
                    <p class="text-xs text-text-muted mt-1">{remarkTarget?.file_name}</p>
                </div>
                <button
                    onclick={closeRemarkModal}
                    class="p-1 text-text-muted hover:text-text-primary hover:bg-surface-muted rounded-lg transition-colors flex-shrink-0"
                >
                    <X size={18} />
                </button>
            </div>

            <div class="px-6 py-4">
                {#if fromCompliance}<button class="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gov-blue" onclick={() => remarkTarget && handleView(remarkTarget)}><Eye size={16} />Open DLL document</button>{/if}
                {#if existingRemark}
                    <!-- View existing remark (everyone, including Master Teacher) -->
                    <div class="p-4 bg-gov-green/10 border border-gov-green/30 rounded-xl mb-3">
                        <p class="text-xs font-bold uppercase tracking-wider text-gov-green">Checked</p>
                    </div>
                    <div class="p-4 bg-gov-gold/5 border border-gov-gold/20 rounded-xl">
                        <p class="text-sm text-text-primary leading-relaxed">{existingRemark}</p>
                        <p class="text-xs text-text-muted mt-2 font-medium">Checked by {reviewsMap[remarkTarget.id]?.reviewer_name || "Checker"}</p>
                    </div>
                    <div class="flex justify-end mt-4">
                        <button
                            onclick={closeRemarkModal}
                            class="px-5 py-2 bg-surface-muted text-text-primary text-sm font-bold rounded-xl hover:bg-surface-muted transition-colors"
                        >
                            Close
                        </button>
                    </div>
                {:else}
                    {#if canAddRemarkToSubmission(remarkTarget)}
                        <!-- Add new remark (School Head for Master Teacher ISP/ISR, District Supervisor for any ISP/ISR, anyone for DLL) -->
                        <textarea
                            bind:value={remarkText}
                            placeholder="Enter your remarks for this {getDocumentLabel(remarkTarget?.doc_type)}..."
                            rows="4"
                            class="w-full p-3 border border-border-subtle rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gov-blue/30"
                        ></textarea>
                        <div class="flex justify-end gap-2 mt-4">
                            <button
                                onclick={closeRemarkModal}
                                class="px-4 py-2 text-sm font-semibold text-text-muted hover:text-text-primary transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onclick={saveRemark}
                                disabled={!remarkText.trim() || savingRemark}
                                class="px-5 py-2 bg-gov-gold-dark text-white text-sm font-bold rounded-xl hover:bg-gov-gold-dark/90 disabled:opacity-50 transition-colors"
                            >
                                {savingRemark ? "Saving..." : "Save Remark"}
                            </button>
                        </div>
                    {:else}
                        <div class="p-4 bg-surface-muted border border-border-subtle rounded-xl">
                            <p class="text-xs font-bold uppercase tracking-wider text-text-muted mb-1">Remarks</p>
                            <p class="text-sm text-text-muted">
                                No remarks have been added for this document yet.
                            </p>
                        </div>
                        <div class="flex justify-end mt-4">
                            <button
                                onclick={closeRemarkModal}
                                class="px-5 py-2 bg-surface-muted text-text-primary text-sm font-bold rounded-xl hover:bg-surface-muted transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    {/if}
                {/if}
            </div>
        </div>
    </div>
{/if}
