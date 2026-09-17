<script lang="ts">
    import { profile } from "$lib/utils/auth";
    import { supabase } from "$lib/utils/supabase";
    import StatCard from "$lib/components/StatCard.svelte";
    import StatusBadge from "$lib/components/StatusBadge.svelte";
    import ComplianceTrendChart from "$lib/components/ComplianceTrendChart.svelte";
    import AlertBanner from "$lib/components/AlertBanner.svelte";
    import { onMount, onDestroy } from "svelte";
    import { fly, fade } from "svelte/transition";
    import { goto } from "$app/navigation";
    import TeacherChecklist from "$lib/components/TeacherChecklist.svelte";
    import {
        calculateCompliance,
        groupSubmissionsByWeek,
        getComplianceClass,
        getComplianceBgClass,
        getDefinedWeeksCount,
        getDynamicSchoolYear,
        normalizeComplianceStatus,
        isComplianceTrackedDocType,
    } from "$lib/utils/useDashboardData";
    import {
        QrCode,
        CloudUpload,
        Archive,
        ShieldCheck,
        Zap,
        Activity,
        Clock,
        ShieldAlert,
        Briefcase,
        Users,
        FileText,
        ShieldX,
        Search,
        Building2,
        WifiOff,
    } from "lucide-svelte";
    import { showQRScanner } from "$lib/stores/ui";
    import { connectivity } from "$lib/stores/connectivity";
    const { isOnline: onlineStatus } = connectivity;

    let submissions = $state<any[]>([]);
    let weeklyData = $state<any[]>([]);
    let complianceStats = $state({
        Compliant: 0,
        Late: 0,
        NonCompliant: 0,
        totalUploaded: 0,
        expected: 0,
        rate: 0,
    });
    let teachingLoadsCount = $state(0);
    let activeTeachingLoads = $state<any[]>([]);
    let academicCalendar = $state<any[]>([]);
    let recentActivity = $state<any[]>([]);
    let stats = $state({
        totalUploads: 0,
        compliantRate: 0,
        totalTeachers: 0,
        compliantCount: 0,
        lateCount: 0,
        nonCompliantCount: 0,
    });
    let alerts = $state<any[]>([]);
    let teacherCompliance = $state<any[]>([]);
    // Master Teacher: school submissions with no reviewer remark yet.
    let awaitingReview = $state<any[]>([]);
    // District Supervisor: teacherCompliance rolled up to one row per school.
    let schoolStandings = $state<
        { name: string; expected: number; compliant: number; late: number; missing: number; rate: number }[]
    >([]);
    let loading = $state(true);

    let channel: any;

    // Guards against write-triggered reload feedback loops:
    // our own compliance-fix UPDATE fires a postgres_changes event, so we
    // skip reloading while we are the ones applying a fix.
    let applyingFix = $state(false);
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;

    let sortField = $state<string>("created_at");
    let sortDir = $state<"asc" | "desc">("desc");
    let filterStatus = $state("all");

    // 70% is the same "needs attention" threshold the District Monitoring page
    // uses, so a school flagged in one place is flagged in the other.
    const AT_RISK_RATE = 70;
    const teachersAtRisk = $derived(
        teacherCompliance.filter((t) => t.rate < AT_RISK_RATE),
    );
    const schoolsBelowTarget = $derived(
        schoolStandings.filter((s) => s.rate < AT_RISK_RATE),
    );
    // Lowest performers first — the ones a School Head would act on today.
    const needsAttention = $derived(
        [...teacherCompliance].sort((a, b) => a.rate - b.rate).slice(0, 5),
    );

    onMount(async () => {
        try {
            await loadDashboard();
            setupRealtime();
        } catch (err) {
            console.error("[dashboard] Failed to load dashboard:", err);
        }
        loading = false;
    });

    onDestroy(() => {
        if (channel) supabase.removeChannel(channel);
        if (reloadTimer) clearTimeout(reloadTimer);
    });

    // Debounce reloads so bursts of realtime events (e.g. bulk inserts or the
    // page's own compliance-fix writes) collapse into a single refresh.
    function scheduleReload() {
        if (reloadTimer) clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
            loadDashboard().catch((err) => console.error("[dashboard] Realtime refresh failed:", err));
        }, 500);
    }

    function setupRealtime() {
        channel = supabase
            .channel("dashboard-changes")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "submissions" },
                async (payload) => {
                    // Skip reload entirely if the change was caused by our own
                    // compliance-status fix write (prevents feedback loops).
                    if (applyingFix) return;

                    // Real-time compliance risk alerts for supervisors
                    const role = $profile?.role;
                    if (role && role !== "Teacher" && payload?.new) {
                        const rec = payload.new as any;
                        if (
                            rec?.compliance_status === "late" ||
                            rec?.compliance_status === "missing"
                        ) {
                            try {
                                const { alertComplianceRisk } = await import(
                                    "$lib/utils/notificationSystem"
                                );
                                await alertComplianceRisk(
                                    $profile?.district_id || undefined,
                                    "Your school/district",
                                    rec.compliance_status === "missing"
                                        ? "high"
                                        : "medium",
                                    `A teacher submitted a ${rec.compliance_status} DLL (Week ${rec.week_number || "?"}).`,
                                );
                            } catch (e) {
                                console.warn(
                                    "[dashboard] Compliance alert skipped:",
                                    e,
                                );
                            }
                        }
                    }
                    scheduleReload();
                },
            )
            .subscribe();
    }

    async function loadDashboard() {
        const userProfile = $profile;
        if (!userProfile) return;
        const role = userProfile.role;

        if (role === "Teacher") {
            await loadTeacherDashboard(userProfile);
        } else {
            await loadSupervisorDashboard(userProfile, role);
        }
    }

    async function loadTeacherDashboard(userProfile: any) {
        // Fix existing submissions that were incorrectly marked 'missing'
        // by the old day-of-week fallback. Only fixes real uploads, not missing placeholders.
        // Guarded so the resulting realtime event doesn't trigger a reload loop.
        applyingFix = true;
        try {
            await supabase
                .from("submissions")
                .update({ compliance_status: "compliant" })
                .eq("user_id", userProfile.id)
                .eq("compliance_status", "missing")
                .not("file_hash", "like", "nc_%");
        } finally {
            applyingFix = false;
        }

        // Batch: fetch all submissions + teaching loads count + academic calendar in parallel
        const results = await Promise.allSettled([
            supabase
                .from("submissions")
                .select(
                    "id, file_name, doc_type, compliance_status, created_at, week_number, teaching_loads(subject, grade_level)",
                )
                .eq("user_id", userProfile.id)
                .order("created_at", { ascending: false })
                .limit(50),
            supabase
                .from("teaching_loads")
                .select("*", { count: "exact" })
                .eq("user_id", userProfile.id)
                .eq("is_active", true),
            supabase
                .from("academic_calendar")
                .select("*")
                .eq("school_year", getDynamicSchoolYear())
                .order("week_number", { ascending: true }),
        ]);

        const subsResult = results[0].status === 'fulfilled' ? results[0].value : { data: [], count: 0 };
        const loadsResult = results[1].status === 'fulfilled' ? results[1].value : { data: [], count: 0 };
        const calendarResult = results[2].status === 'fulfilled' ? results[2].value : { data: [] };

        submissions = subsResult.data || [];
        activeTeachingLoads = loadsResult.data || [];
        teachingLoadsCount = loadsResult.count || 0;
        academicCalendar = calendarResult.data || [];
        const calendar = academicCalendar;

        // Calculate cumulative expected loads to date based on defined calendar weeks
        const definedWeeks = await getDefinedWeeksCount(
            supabase,
            getDynamicSchoolYear(),
            userProfile.district_id,
        );
        const cumulativeExpected = teachingLoadsCount * definedWeeks;

        // Calculate compliance stats using ACTUAL submission statuses
        // Rate = compliant / cumulativeExpected
        complianceStats = calculateCompliance(submissions, cumulativeExpected);

        // Weekly breakdown for chart + widget (uses calendar weeks)
        weeklyData = groupSubmissionsByWeek(
            submissions,
            teachingLoadsCount,
            8,
            calendar,
        );

        // 15 rather than 5: the list is now a fixed-height scrollable box,
        // so extra rows add history to scroll through instead of lengthening
        // the page.
        recentActivity = (subsResult.data || []).slice(0, 15);
        // ISP/ISR aren't part of the weekly DLL cadence — excluded from the
        // upload count the same way calculateCompliance excludes them above.
        stats.totalUploads = submissions.filter((s: any) =>
            isComplianceTrackedDocType(s.doc_type),
        ).length;
        stats.compliantRate = complianceStats.rate;
    }

    async function loadSupervisorDashboard(userProfile: any, role: string) {
        // Fix existing submissions incorrectly marked 'missing' by old fallback
        let fixQuery = supabase
            .from("submissions")
            .update({ compliance_status: "compliant" })
            .eq("compliance_status", "missing")
            .not("file_hash", "like", "nc_%");
        if (role === "School Head" || role === "Master Teacher") {
            if (userProfile.school_id) {
                const { data: teacherIds } = await supabase
                    .from("profiles")
                    .select("id")
                    .eq("school_id", userProfile.school_id);
                if (teacherIds && teacherIds.length > 0) {
                    fixQuery = fixQuery.in("user_id", teacherIds.map((t) => t.id));
                }
            }
        } else if (role === "District Supervisor" && userProfile.district_id) {
            const { data: schoolIds } = await supabase
                .from("schools")
                .select("id")
                .eq("district_id", userProfile.district_id);
            if (schoolIds && schoolIds.length > 0) {
                const { data: teacherIds } = await supabase
                    .from("profiles")
                    .select("id")
                    .in("school_id", schoolIds.map((s) => s.id));
                if (teacherIds && teacherIds.length > 0) {
                    fixQuery = fixQuery.in("user_id", teacherIds.map((t) => t.id));
                }
            }
        }
        applyingFix = true;
        try {
            await fixQuery;
        } finally {
            applyingFix = false;
        }

        // Fetch academic calendar for the school year
        const { data: calendar } = await supabase
            .from("academic_calendar")
            .select("*")
            .eq("school_year", getDynamicSchoolYear())
            .order("week_number", { ascending: true });

        // Scope to this supervisor's own district (academic_calendar rows
        // carry a district_id, and a district-wide school year can have
        // several districts' rows in it). Without this filter, "defined
        // weeks" below counted every district's calendar weeks combined,
        // inflating the "expected" denominator and producing a compliance
        // rate that didn't match the District Monitoring page's own number
        // for the exact same district.
        const calendarArr = (calendar || []).filter(
            (c: any) => c.district_id === userProfile.district_id || !c.district_id,
        );



        // Fetch teachers in the scope (School or District)
        // NOTE: Do NOT embed `schools(name)` here — the profiles->schools FK is
        // not visible to PostgREST in this database (PGRST200), which returns a
        // 400 and makes the whole teacher query fail. School names are resolved
        // separately below.
        let teacherQuery = supabase
            .from("profiles")
            .select("id, full_name, role, school_id, district_id")
            .in("role", ["Teacher", "Master Teacher"]);

        // Fetch submissions in the scope
        let subQuery = supabase
            .from("submissions")
            .select("*, uploader:profiles!inner(school_id, district_id)", {
                count: "exact",
            });

        if (role === "School Head" || role === "Master Teacher") {
            if (userProfile.school_id) {
                teacherQuery = teacherQuery.eq(
                    "school_id",
                    userProfile.school_id,
                );
                subQuery = subQuery.eq(
                    "profiles.school_id",
                    userProfile.school_id,
                );
            }
        } else if (role === "District Supervisor") {
            if (userProfile.district_id) {
                teacherQuery = teacherQuery.eq(
                    "district_id",
                    userProfile.district_id,
                );
                subQuery = subQuery.eq(
                    "profiles.district_id",
                    userProfile.district_id,
                );
            }
        }

        const results = await Promise.allSettled([
            teacherQuery,
            subQuery.order("created_at", { ascending: false }),
        ]);

        const teachers = results[0].status === 'fulfilled' ? results[0].value.data || [] : [];
        const allSubs = results[1].status === 'fulfilled' ? results[1].value.data || [] : [];

        // Resolve school names for alerts (can't use the schools() embed here)
        const teacherSchoolIds = [...new Set(
            (teachers as any[]).map((t) => t.school_id).filter(Boolean)
        )];
        let schoolNameMap: Record<string, string> = {};
        if (teacherSchoolIds.length > 0) {
            const { data: schData } = await supabase
                .from("schools")
                .select("id, name")
                .in("id", teacherSchoolIds);
            if (schData) {
                for (const s of schData) {
                    schoolNameMap[s.id] = s.name;
                }
            }
        }
        const teachersWithNames = (teachers as any[]).map((t) => ({
            ...t,
            school_name: t.school_id ? (schoolNameMap[t.school_id] || 'Unknown School') : 'Unknown School',
            schools: { name: t.school_id ? (schoolNameMap[t.school_id] || 'Unknown School') : 'Unknown School' },
        }));

        const { data: loadsData } = await supabase
            .from("teaching_loads")
            .select("id, user_id, subject")
            .in(
                "user_id",
                teachersWithNames.map((t) => t.id),
            );

        const loads = loadsData || [];
        // Only weeks actually opened count toward "expected" — matches the
        // semantics used everywhere else (getDefinedWeeksCount, District
        // Monitoring's currentDefinedWeeks).
        const definedWeeks = calendarArr.filter((c: any) => c.is_active).length || 1;

        // ISP/ISR are one-off administrative uploads, not part of the weekly
        // DLL cadence — excluded here (and below) so they never inflate
        // "total uploads" or skew compliant/late/missing counts. They still
        // show up in recentActivity (with their doc type labeled) since that
        // list is meant to reflect everything uploaded, not just DLLs.
        const complianceSubs = allSubs.filter((s) => isComplianceTrackedDocType(s.doc_type));

        // Per-teacher compliance: expected = active loads x defined weeks.
        // Missing = expected - (compliant + late). This matches the teacher
        // dashboard's own numbers, just summed across the supervisor's scope.
        const loadsByTeacher: Record<string, any[]> = {};
        for (const l of loads) {
            (loadsByTeacher[l.user_id] ||= []).push(l);
        }
        teacherCompliance = teachersWithNames.map((t) => {
            const myLoads = loadsByTeacher[t.id] || [];
            const expected = myLoads.length * definedWeeks;
            const mySubs = complianceSubs.filter((s) => s.user_id === t.id);
            const compliant = mySubs.filter(
                (s) =>
                    !s.compliance_status ||
                    s.compliance_status === "compliant" ||
                    s.compliance_status === "on-time",
            ).length;
            const late = mySubs.filter(
                (s) => s.compliance_status === "late",
            ).length;
            const missing = Math.max(0, expected - (compliant + late));
            return {
                id: t.id,
                name: t.full_name,
                school_name: t.school_name,
                expected,
                compliant,
                late,
                missing,
                rate:
                    expected > 0
                        ? Math.round(((compliant + late) / expected) * 100)
                        : 0,
            };
        });

        const totalLoads = loads.length;
        const totalExpected = totalLoads * definedWeeks;

        stats.totalTeachers = teachersWithNames.length;
        stats.totalUploads = complianceSubs.length;
        stats.compliantCount = complianceSubs.filter(
            (s) =>
                !s.compliance_status ||
                s.compliance_status === "compliant" ||
                s.compliance_status === "on-time",
        ).length;
        stats.lateCount = complianceSubs.filter(
            (s) => s.compliance_status === "late",
        ).length;

        stats.nonCompliantCount = teacherCompliance.reduce(
            (sum, t) => sum + t.missing,
            0,
        );

        // Use the new standard calculateCompliance for the overall rate to keep display consistent with expected defaults
        const overallStats = calculateCompliance(complianceSubs, totalExpected);
        stats.compliantRate = overallStats.rate;

        // Recent activity intentionally keeps ISP/ISR (shown with their doc
        // type) — it's a feed of everything uploaded, not a compliance metric.
        recentActivity = allSubs.slice(0, 15);

        // Predictive integrity alerts (pattern detection) — DLL-cadence only.
        const { detectPatterns } = await import("$lib/utils/patternDetection");
        alerts = detectPatterns(complianceSubs, calendarArr, teachersWithNames);

        // ── Role-specific figures ──
        // Each role's Home answers a different question, so each needs a
        // different number. These are derived from the same already-fetched
        // rows rather than re-querying.

        if (role === "Master Teacher") {
            // A Master Teacher's job here is reviewing. "Awaiting review" is
            // the school's submissions that carry no reviewer remark yet —
            // the actual size of their queue, not a compliance percentage.
            const subIds = allSubs.map((s: any) => s.id).filter(Boolean);
            if (subIds.length > 0) {
                const { data: reviews } = await supabase
                    .from("dll_reviews")
                    .select("submission_id, reviewer_comment")
                    .in("submission_id", subIds);
                const reviewed = new Set(
                    (reviews || [])
                        .filter((r: any) => r.reviewer_comment)
                        .map((r: any) => r.submission_id),
                );
                const nameById: Record<string, string> = {};
                for (const t of teachersWithNames) nameById[t.id] = t.full_name;
                awaitingReview = allSubs
                    .filter((s: any) => !reviewed.has(s.id))
                    .map((s: any) => ({ ...s, teacher_name: nameById[s.user_id] || "Unknown teacher" }));
            } else {
                awaitingReview = [];
            }
        }

        if (role === "District Supervisor") {
            // District works at school altitude, not teacher altitude — the
            // per-teacher breakdown belongs on the Schools tab. Roll the same
            // teacher rows up into one entry per school.
            const bySchool: Record<string, { name: string; expected: number; compliant: number; late: number; missing: number }> = {};
            for (const t of teacherCompliance) {
                const name = t.school_name || "Unassigned";
                bySchool[name] ||= { name, expected: 0, compliant: 0, late: 0, missing: 0 };
                bySchool[name].expected += t.expected;
                bySchool[name].compliant += t.compliant;
                bySchool[name].late += t.late;
                bySchool[name].missing += t.missing;
            }
            schoolStandings = Object.values(bySchool)
                .map((s) => ({
                    ...s,
                    rate: s.expected > 0 ? Math.round(((s.compliant + s.late) / s.expected) * 100) : 0,
                }))
                .sort((a, b) => a.rate - b.rate);
        }
    }



    // Teacher table: filtered & sorted submissions
    const displaySubmissions = $derived(() => {
        let result = [...submissions];
        if (filterStatus !== "all") {
            result = result.filter((s) => {
                let cs = s.compliance_status || "compliant";
                // Normalize for filtering
                if (
                    cs.toLowerCase() === "on-time" ||
                    cs.toLowerCase() === "compliant"
                )
                    cs = "compliant";
                else if (cs.toLowerCase() === "late") cs = "late";
                else if (
                    cs.toLowerCase() === "missing" ||
                    cs.toLowerCase() === "non-compliant"
                )
                    cs = "missing";

                return cs === filterStatus;
            });
        }
        result.sort((a, b) => {
            const aVal = a[sortField] || "";
            const bVal = b[sortField] || "";
            if (sortDir === "asc") return aVal > bVal ? 1 : -1;
            return aVal < bVal ? 1 : -1;
        });
        return result.slice(0, 20);
    });

    function toggleSort(field: string) {
        if (sortField === field) sortDir = sortDir === "asc" ? "desc" : "asc";
        else {
            sortField = field;
            sortDir = "desc";
        }
    }


    function formatDate(dateStr: string): string {
        return new Date(dateStr).toLocaleDateString("en-PH", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function getStatusBadgeType(
        s: any,
    ): "compliant" | "late" | "missing" {
        const cs = (s.compliance_status || "compliant").toLowerCase();
        if (cs === "compliant" || cs === "on-time") return "compliant";
        if (cs === "late") return "late";
        return "missing";
    }
</script>

<svelte:head>
    <title>Home — CEDIMS</title>
</svelte:head>

<div>
    <!-- Header -->
    <div class="mb-6">
        <h1 class="text-3xl font-semibold text-text-primary tracking-tight">
            {$profile?.role === "Teacher"
                ? "Overview"
                : "Supervision Dashboard"}
        </h1>
        <p class="text-base text-text-secondary mt-1">
            Welcome back, <span class="font-bold text-gov-blue"
                >{$profile?.full_name || "User"}</span
            >
        </p>
    </div>

    <!-- This page has no cache-then-network fallback the way archive/
         monitoring do — adding one would be new data-fetching logic, out
         of scope for a presentation-only pass. What belongs here: making
         the existing silent failure honest. Without this, a fetch that
         fails offline leaves every stat at zero with no explanation,
         while the header's connectivity pill can be easy to miss. -->
    {#if !loading && !$onlineStatus}
        <div
            class="mb-6 flex items-center gap-2 rounded-lg border border-gov-gold/30 bg-gov-gold/10 px-4 py-3 text-sm font-medium text-gov-gold-dark"
            role="status"
        >
            <WifiOff size={16} strokeWidth={2} class="flex-shrink-0" aria-hidden="true" />
            You're offline — the figures below may be incomplete or out of date.
        </div>
    {/if}

    {#if $profile?.role === "Teacher"}
        <!-- ========== TEACHER DASHBOARD ========== -->

        <!-- Stats Row -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div in:fly={{ y: 20, duration: 400, delay: 0 }}>
                <StatCard
                    icon="CloudUpload"
                    value={stats.totalUploads}
                    label="Total Uploads"
                />
            </div>
            <div in:fly={{ y: 20, duration: 400, delay: 100 }}>
                <StatCard
                    icon="ShieldCheck"
                    value="{complianceStats.rate}%"
                    label="Compliance Rate"
                    color="from-gov-green to-gov-green-dark"
                />
            </div>
            <div in:fly={{ y: 20, duration: 400, delay: 200 }}>
                <StatCard
                    icon="Clock"
                    value={complianceStats.Late}
                    label="Late Submissions"
                    color="from-gov-gold to-gov-gold-dark"
                />
            </div>
            <div in:fly={{ y: 20, duration: 400, delay: 300 }}>
                <StatCard
                    icon="ShieldAlert"
                    value={complianceStats.NonCompliant}
                    label="Missing"
                    color="from-gov-red to-red-700"
                />
            </div>
            <div in:fly={{ y: 20, duration: 400, delay: 400 }}>
                <StatCard
                    icon="Activity"
                    value="{complianceStats.rate}%"
                    label="Compliance Snapshot"
                    color="from-gov-blue to-gov-blue-dark"
                />
            </div>
        </div>

        <!-- Quick Actions -->
        <div class="mb-10" in:fade={{ duration: 600, delay: 500 }}>
            <div class="flex items-center gap-3 mb-6">
                <div class="p-2 rounded-md bg-gov-blue/10 text-gov-blue">
                    <Zap size={20} fill="currentColor" strokeWidth={1.5} />
                </div>
                <h2
                    class="text-xl font-semibold text-text-primary tracking-tight"
                >
                    Quick Actions
                </h2>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-5">
                <a
                    href="/dashboard/upload"
                    class="gov-card p-5 flex flex-col gap-4 no-underline group"
                >
                    <div
                        class="w-10 h-10 rounded-md bg-gov-blue/5 text-gov-blue flex items-center justify-center group-hover:bg-gov-blue group-hover:text-white transition-colors duration-300"
                    >
                        <CloudUpload size={20} strokeWidth={1.5} />
                    </div>
                    <div>
                        <p
                            class="font-bold text-sm text-text-primary group-hover:text-gov-blue transition-colors"
                        >
                            Upload
                        </p>
                        <p
                            class="text-[10px] text-text-muted mt-1 leading-relaxed"
                        >
                            Submit DLL, ISP, or ISR reports.
                        </p>
                    </div>
                </a>
                <a
                    href="/dashboard/archive"
                    class="gov-card p-5 flex flex-col gap-4 no-underline group"
                >
                    <div
                        class="w-10 h-10 rounded-md bg-gov-blue/5 text-gov-blue flex items-center justify-center group-hover:bg-gov-blue group-hover:text-white transition-colors duration-300"
                    >
                        <Archive size={20} strokeWidth={1.5} />
                    </div>
                    <div>
                        <p
                            class="font-bold text-sm text-text-primary group-hover:text-gov-blue transition-colors"
                        >
                            Archive
                        </p>
                        <p
                            class="text-[10px] text-text-muted mt-1 leading-relaxed"
                        >
                            Retrieve submitted documents.
                        </p>
                    </div>
                </a>
                <a
                    href="/dashboard/load"
                    class="gov-card p-5 flex flex-col gap-4 no-underline group"
                >
                    <div
                        class="w-10 h-10 rounded-md bg-gov-blue/5 text-gov-blue flex items-center justify-center group-hover:bg-gov-blue group-hover:text-white transition-colors duration-300"
                    >
                        <Briefcase size={20} strokeWidth={1.5} />
                    </div>
                    <div>
                        <p
                            class="font-bold text-sm text-text-primary group-hover:text-gov-blue transition-colors"
                        >
                            Load
                        </p>
                        <p
                            class="text-[10px] text-text-muted mt-1 leading-relaxed"
                        >
                            Manage subjects and schedules.
                        </p>
                    </div>
                </a>
                <button
                    onclick={() => showQRScanner.set(true)}
                    class="gov-card p-5 flex flex-col gap-4 no-underline group text-left w-full cursor-pointer"
                >
                    <div
                        class="w-10 h-10 rounded-md bg-gov-blue/5 text-gov-blue flex items-center justify-center group-hover:bg-gov-blue group-hover:text-white transition-colors duration-300"
                    >
                        <QrCode size={20} strokeWidth={1.5} />
                    </div>
                    <div>
                        <p
                            class="font-bold text-sm text-text-primary group-hover:text-gov-blue transition-colors"
                        >
                            Scan
                        </p>
                        <p
                            class="text-[10px] text-text-muted mt-1 leading-relaxed"
                        >
                            Verify document authenticity.
                        </p>
                    </div>
                </button>
            </div>
        </div>

        <div class="mb-6 rounded-2xl border border-border-subtle bg-surface-white p-5 shadow-sm" in:fade={{ duration: 500, delay: 400 }}>
            <h3 class="text-sm font-semibold uppercase tracking-wide text-text-primary mb-3">
                Current Focus
            </h3>
            <p class="text-sm text-text-secondary">
                Keep your submissions up to date and review your archive regularly so monitoring remains simple and current.
            </p>
        </div>

        <!-- Teacher Checklist: Interactive checkpoint hub for all active teaching loads -->
        <div class="mb-6" in:fade={{ duration: 500, delay: 600 }}>
            <TeacherChecklist
                {submissions}
                teachingLoads={activeTeachingLoads}
                calendarWeeks={academicCalendar}
            />
        </div>
    {:else}
        <!-- ========== SUPERVISOR DASHBOARD ========== -->

        <!-- Priority alerts -->
        {#if alerts.length > 0}
            <AlertBanner {alerts} />
        {/if}

        <!-- Stats and the primary section below are role-specific.
             Master Teacher, School Head and District Supervisor previously
             shared one identical view whose centrepiece was a Teacher
             Compliance table that also exists on the School/Staff tab. Each
             role now gets the figures and the one action list that match its
             actual job, at its own altitude, with no section repeated from
             another tab. All values derive from the same rows already
             fetched above. -->

        {#if $profile?.role === "Master Teacher"}
            <!-- Reviewing is the Master Teacher's job here, so the queue is
                 the headline, not a compliance percentage. -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <div in:fly={{ y: 20, duration: 400, delay: 0 }}>
                    <StatCard icon="ClipboardList" value={awaitingReview.length} label="Awaiting My Review" color="gov-gold" />
                </div>
                <div in:fly={{ y: 20, duration: 400, delay: 100 }}>
                    <StatCard icon="Users" value={teachersAtRisk.length} label="Teachers Needing Support" color="gov-red" />
                </div>
                <div in:fly={{ y: 20, duration: 400, delay: 150 }}>
                    <StatCard icon="ShieldCheck" value="{stats.compliantRate}%" label="School Rate" color="gov-green" />
                </div>
                <div in:fly={{ y: 20, duration: 400, delay: 200 }}>
                    <StatCard icon="Clock" value={stats.lateCount} label="Late Submissions" color="gov-blue" />
                </div>
            </div>

            <div class="mb-6" in:fade={{ duration: 500, delay: 300 }}>
                <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 class="text-sm font-bold text-text-muted uppercase tracking-widest flex items-center gap-2">
                        <div class="h-1 w-4 bg-gov-gold"></div>
                        Awaiting My Review
                        <span class="text-xs font-semibold text-text-muted/70">({awaitingReview.length})</span>
                    </h2>
                    <button onclick={() => goto("/dashboard/archive")} class="text-xs font-bold text-gov-blue hover:underline">
                        Open Archives →
                    </button>
                </div>

                {#if awaitingReview.length === 0}
                    <div class="gov-card-static p-8 text-center rounded-2xl">
                        <p class="text-text-muted font-bold text-xs uppercase tracking-widest">Nothing waiting — every document has a remark</p>
                    </div>
                {:else}
                    <div class="gov-card-static rounded-2xl divide-y divide-border-subtle max-h-[26rem] overflow-y-auto">
                        {#each awaitingReview.slice(0, 25) as doc}
                            <div class="flex items-center justify-between gap-3 p-4">
                                <div class="min-w-0">
                                    <p class="text-sm font-semibold text-text-primary truncate">{doc.file_name}</p>
                                    <p class="text-[11px] text-text-muted mt-0.5">
                                        {doc.teacher_name}
                                        · {doc.doc_type || "DLL"}{doc.week_number != null ? ` · Week ${doc.week_number}` : ""}
                                    </p>
                                </div>
                                <span class="text-[10px] font-bold uppercase tracking-widest text-gov-gold-dark shrink-0">
                                    {formatDate(doc.created_at)}
                                </span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

        {:else if $profile?.role === "School Head"}
            <!-- The School Head is accountable for staff. The full sortable
                 roster lives on the Staff tab; Home shows only who needs
                 acting on today. -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <div in:fly={{ y: 20, duration: 400, delay: 0 }}>
                    <StatCard icon="Users" value={stats.totalTeachers} label="Teachers" />
                </div>
                <div in:fly={{ y: 20, duration: 400, delay: 100 }}>
                    <StatCard icon="ShieldCheck" value="{stats.compliantRate}%" label="School Rate" color="gov-green" />
                </div>
                <div in:fly={{ y: 20, duration: 400, delay: 150 }}>
                    <StatCard icon="ShieldAlert" value={teachersAtRisk.length} label="Teachers At Risk" color="gov-red" />
                </div>
                <div in:fly={{ y: 20, duration: 400, delay: 200 }}>
                    <StatCard icon="ShieldX" value={stats.nonCompliantCount} label="Missing" color="gov-red" />
                </div>
            </div>

            <div class="mb-6" in:fade={{ duration: 500, delay: 300 }}>
                <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 class="text-sm font-bold text-text-muted uppercase tracking-widest flex items-center gap-2">
                        <div class="h-1 w-4 bg-gov-red"></div>
                        Needs Attention
                    </h2>
                    <button onclick={() => goto("/dashboard/monitoring/school")} class="text-xs font-bold text-gov-blue hover:underline">
                        Open Staff →
                    </button>
                </div>

                {#if needsAttention.length === 0}
                    <div class="gov-card-static p-8 text-center rounded-2xl">
                        <p class="text-text-muted font-bold text-xs uppercase tracking-widest">No teacher records yet</p>
                    </div>
                {:else}
                    <div class="gov-card-static rounded-2xl divide-y divide-border-subtle">
                        {#each needsAttention as t}
                            <div class="flex items-center justify-between gap-3 p-4">
                                <div class="min-w-0">
                                    <p class="text-sm font-semibold text-text-primary truncate">{t.name}</p>
                                    <p class="text-[11px] text-text-muted mt-0.5">
                                        {t.missing} missing · {t.late} late · {t.expected} expected
                                    </p>
                                </div>
                                <span class="text-sm font-bold shrink-0 {getComplianceClass(t.rate)}">{t.rate}%</span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

        {:else}
            <!-- District Supervisor: school altitude. Per-teacher detail is
                 the Schools tab's job, so this rolls the same rows up. -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <div in:fly={{ y: 20, duration: 400, delay: 0 }}>
                    <StatCard icon="Building2" value={schoolStandings.length} label="Schools" />
                </div>
                <div in:fly={{ y: 20, duration: 400, delay: 100 }}>
                    <StatCard icon="ShieldCheck" value="{stats.compliantRate}%" label="District Rate" color="gov-green" />
                </div>
                <div in:fly={{ y: 20, duration: 400, delay: 150 }}>
                    <StatCard icon="ShieldAlert" value={schoolsBelowTarget.length} label="Schools Below Target" color="gov-red" />
                </div>
                <div in:fly={{ y: 20, duration: 400, delay: 200 }}>
                    <StatCard icon="ShieldX" value={stats.nonCompliantCount} label="Missing" color="gov-red" />
                </div>
            </div>

            <div class="mb-6" in:fade={{ duration: 500, delay: 300 }}>
                <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 class="text-sm font-bold text-text-muted uppercase tracking-widest flex items-center gap-2">
                        <div class="h-1 w-4 bg-gov-blue"></div>
                        School Standings
                        <span class="text-xs font-semibold text-text-muted/70">(lowest first)</span>
                    </h2>
                    <button onclick={() => goto("/dashboard/monitoring/district")} class="text-xs font-bold text-gov-blue hover:underline">
                        Open Schools →
                    </button>
                </div>

                {#if schoolStandings.length === 0}
                    <div class="gov-card-static p-8 text-center rounded-2xl">
                        <p class="text-text-muted font-bold text-xs uppercase tracking-widest">No school records yet</p>
                    </div>
                {:else}
                    <div class="gov-card-static rounded-2xl divide-y divide-border-subtle max-h-[26rem] overflow-y-auto">
                        {#each schoolStandings as s}
                            <div class="flex items-center justify-between gap-3 p-4">
                                <div class="min-w-0 flex-1">
                                    <p class="text-sm font-semibold text-text-primary truncate">{s.name}</p>
                                    <p class="text-[11px] text-text-muted mt-0.5">
                                        {s.missing} missing · {s.late} late · {s.expected} expected
                                    </p>
                                </div>
                                <span class="text-sm font-bold shrink-0 {getComplianceClass(s.rate)}">{s.rate}%</span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}



        <!-- Recent Activity as Cards -->
        <div in:fade={{ duration: 600, delay: 600 }}>
            <h2
                class="text-sm font-bold text-text-muted uppercase tracking-widest mb-6 flex items-center gap-2"
            >
                <div class="h-1 w-4 bg-gov-gold"></div>
                <!-- This whole block lives in the non-Teacher branch, so only
                     School Head / Master Teacher / District Supervisor reach
                     it; a Teacher has no Recent Activity section at all. -->
                {$profile?.role === "District Supervisor"
                    ? "Recent District Activity"
                    : "Recent School Activity"}
            </h2>

            {#if recentActivity.length === 0}
                <div class="gov-card-static p-12 text-center rounded-2xl">
                    <p
                        class="text-text-muted font-bold text-xs uppercase tracking-widest"
                    >
                        No recent submissions detected
                    </p>
                </div>
            {:else}
                <!-- Boxed with its own scrollbar so a long activity list stays
                     a fixed block on the dashboard instead of pushing every
                     section below it off the screen. -->
                <div
                    class="gov-card-static rounded-2xl p-4 max-h-[26rem] overflow-y-auto"
                >
                <div
                    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
                >
                    {#each recentActivity as item, i}
                        <div
                            class="bg-surface-white border border-border-subtle rounded-xl p-5 shadow-sm hover:shadow-md transition-colors flex flex-col group relative"
                            in:fly={{
                                x: -20,
                                duration: 400,
                                delay: 700 + i * 50,
                            }}
                        >
                            <div class="absolute top-4 right-4">
                                <StatusBadge
                                    status={normalizeComplianceStatus(
                                        item.compliance_status,
                                    )}
                                    size="sm"
                                />
                            </div>

                            <div class="mb-4">
                                <h4
                                    class="font-bold text-sm text-text-primary group-hover:text-gov-blue transition-colors leading-snug line-clamp-2 pr-12"
                                >
                                    {item.file_name}
                                </h4>
                                <div class="flex flex-wrap items-center gap-1.5 mt-2">
                                    <span
                                        class="px-2 py-0.5 bg-gov-blue/5 text-gov-blue text-[10px] font-bold rounded uppercase tracking-wider"
                                    >
                                        {item.doc_type || "Unknown"}
                                    </span>
                                    {#if item.doc_type === "DLL" && item.week_number != null}
                                        <span
                                            class="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold rounded uppercase tracking-wider"
                                        >
                                            W{item.week_number}
                                        </span>
                                    {/if}
                                </div>
                            </div>

                            <div
                                class="mt-auto pt-3 border-t border-border-subtle flex items-center justify-between"
                            >
                                <div
                                    class="flex items-center gap-2 text-text-muted"
                                >
                                    <Clock size={12} strokeWidth={2} />
                                    <span
                                        class="text-[10px] font-bold uppercase tracking-tighter"
                                        >{formatDate(item.created_at)}</span
                                    >
                                </div>
                                <span
                                    class="text-[9px] font-bold text-gov-blue/60 uppercase tracking-widest"
                                    >Archived</span
                                >
                            </div>
                        </div>
                    {/each}
                </div>
                </div>
            {/if}
        </div>
    {/if}
</div>
