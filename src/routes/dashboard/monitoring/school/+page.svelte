<script lang="ts">
    import { profile } from "$lib/utils/auth";
    import { supabase } from "$lib/utils/supabase";
    import StatCard from "$lib/components/StatCard.svelte";
    import StatusBadge from "$lib/components/StatusBadge.svelte";
    import ComplianceHeatmap from "$lib/components/ComplianceHeatmap.svelte";
    import ComplianceTrendChart from "$lib/components/ComplianceTrendChart.svelte";
    import DrillDownModal from "$lib/components/DrillDownModal.svelte";
    import ProfileUploader from "$lib/components/ProfileUploader.svelte";
    import { onMount, onDestroy } from "svelte";
    import { fly, fade } from "svelte/transition";
    import { goto } from "$app/navigation";
    import { School as SchoolIcon, Eye, Users, LineChart, ArrowUpDown } from "lucide-svelte";
    import EmptyState from "$lib/components/EmptyState.svelte";
    import { addToast } from "$lib/stores/toast";
    import {
        calculateCompliance,
        groupSubmissionsByWeek,
        getComplianceClass,
        getComplianceBgClass,
        getTrendDirection,
        getTrendIcon,
        formatComplianceRate,
        getWeekNumber,
        getDefinedWeeksCount,
        getDynamicSchoolYear,
        getCurrentWeekFromCalendar,
        isComplianceTrackedDocType,
    } from "$lib/utils/useDashboardData";
    import {
        extractFeatures,
        runKMeansClustering,
        canCluster,
    } from "$lib/utils/clusterAnalytics";
    import ClusterVisualization from "$lib/components/ClusterVisualization.svelte";
    import { cacheMetadata, getCachedMetadata } from "$lib/utils/offline";
  import { canViewUploadedISPISR } from "$lib/utils/documentPermissions";

    // Data
    interface Teacher {
        id: string;
        full_name: string;
        role: string;
        district_id: string;
        loadCount?: number;
        rate?: number;
        total?: number;
        Compliant?: number;
        Late?: number;
        NonCompliant?: number;
    }

    interface Submission {
        id: string;
        user_id: string;
        file_name: string;
        doc_type: string;
        compliance_status: string;
        created_at: string;
        week_number?: number;
        teaching_loads?: any;
    }

    interface KPI {
        totalTeachers: number;
        overallRate: number;
        lateCount: number;
        atRiskCount: number;
        previousRate: number;
    }

    // Data
    let teachers = $state<Teacher[]>([]);
    let allSubmissions = $state<Submission[]>([]);
    let loading = $state(true);
    let schoolLogoUrl = $state<string | null>(null);
    let currentDefinedWeeks = $state(1);
    // KPI state
    let kpi = $state<KPI>({
        totalTeachers: 0,
        overallRate: 0,
        lateCount: 0,
        atRiskCount: 0,
        previousRate: 0,
    });

    // Heatmap data
    let heatmapRows = $state<string[]>([]);
    let heatmapWeeks = $state<{ week: number; label: string }[]>([]);
    let heatmapCells = $state<any[]>([]);

    // Trend chart data
    let trendLabels = $state<string[]>([]);
    let trendDatasets = $state<any[]>([]);

    // Cluster state
    let clusterShow = $state(false);
    let clusterResults = $state<any[]>([]);
    let clusterSummaries = $state<any[]>([]);
    let clusterReady = $state(false);

    // Table controls
    let sortField = $state<string>("rate");
    let sortDir = $state<"asc" | "desc">("asc");
    let searchQuery = $state("");
    let currentWk = $state(1);

    // Drill-down modal
    let showModal = $state(false);
    let selectedTeacher = $state<Teacher | null>(null);
    let selectedSubmissions = $state<Submission[]>([]);

    // Alert teachers (≥2 late submissions)
    const alertTeachers = $derived(() => {
        return teachers.filter((t: Teacher) => {
            const subs = allSubmissions.filter(
                (s: Submission) => s.user_id === t.id,
            );
            const late = subs.filter(
                (s: Submission) => s.compliance_status === "late",
            ).length;
            return late >= 2;
        });
    });

    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    onMount(async () => {
        try {
            await loadSchoolData();
        } finally {
            loading = false;
        }

        // Subscribe to real-time submission changes
        realtimeChannel = supabase
            .channel("school-submissions")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "submissions" },
                () => {
                    if (!loading) loadSchoolData();
                },
            )
            .subscribe();
    });

    onDestroy(() => {
        if (realtimeChannel) {
            supabase.removeChannel(realtimeChannel);
        }
    });

    async function loadSchoolData() {
        const userProfile = $profile;
        if (!userProfile?.school_id) return;

        // Offline: restore cached monitoring snapshot without touching Supabase
        if (typeof navigator !== "undefined" && !navigator.onLine) {
            const cached = await getCachedMetadata(
                `school_monitor_${userProfile.school_id}`,
            );
            if (cached?.data) {
                applySchoolSnapshot(cached.data);
            }
            return;
        }

        // Fetch School Logo
        const { data: schoolData } = await supabase.from('schools').select('avatar_url').eq('id', userProfile.school_id).single();
        if (schoolData) schoolLogoUrl = schoolData.avatar_url;

        // Batch fetch: teachers + all submissions + all teaching loads + academic calendar
        const [teachersRes, subsRes, loadsRes, calendarRes] = await Promise.all(
            [
                supabase
                    .from("profiles")
                    .select("id, full_name, role, district_id")
                    .eq("school_id", userProfile.school_id)
                    .in("role", ["Teacher", "Master Teacher"])
                    .order("full_name"),
                supabase
                    .from("submissions")
                    .select(
                        "id, user_id, file_name, doc_type, compliance_status, created_at, week_number, profiles!inner(school_id), teaching_loads(subject, grade_level)",
                    )
                    .eq("profiles.school_id", userProfile.school_id)
                    .order("created_at", { ascending: false }),
                supabase
                    .from("teaching_loads")
                    .select("id, user_id, profiles!inner(school_id)")
                    .eq("profiles.school_id", userProfile.school_id),
                supabase
                    .from("academic_calendar")
                    .select("*")
                    .eq("school_year", getDynamicSchoolYear())
                    .order("week_number", { ascending: true }),
            ],
        );

        teachers = (teachersRes.data || []).map((t: any) => t as Teacher);
        const schoolLoads = loadsRes.data || [];
        const districtId = teachers[0]?.district_id || userProfile.district_id;

        let calendar = (calendarRes.data || []) as any[];
        if (districtId) {
            calendar = calendar.filter(
                (c: any) => c.district_id === districtId,
            );
        }

        currentDefinedWeeks = await getDefinedWeeksCount(supabase);
        currentWk = await getCurrentWeekFromCalendar(
            supabase,
            getDynamicSchoolYear(),
            districtId ?? undefined,
        );

        // Attach load count to each teacher
        teachers = teachers.map((t: Teacher) => ({
            ...t,
            loadCount: schoolLoads.filter((l: any) => l.user_id === t.id)
                .length,
        }));

        allSubmissions = (subsRes.data || []).map((s: any) => s as Submission);
        const teacherIds = new Set(teachers.map((t: Teacher) => t.id));
        allSubmissions = allSubmissions.filter((s: Submission) => {
            // Include submission if from a teacher in this school
            if (!teacherIds.has(s.user_id)) {
                return false;
            }
            // Additional filter for ISP/ISR: only show if School Head uploaded it
            const role = userProfile?.role || '';
            return canViewUploadedISPISR(role, s.doc_type, s.user_id, userProfile?.id || '');
        });

        // Calculate KPIs
        const totalSchoolLoads = teachers.reduce(
            (sum: number, t: Teacher) => sum + (t.loadCount || 0),
            0,
        );

        const cumulativeExpectedDistrict =
            totalSchoolLoads * currentDefinedWeeks;

        const overallStats = calculateCompliance(
            allSubmissions,
            cumulativeExpectedDistrict,
        );
        kpi.totalTeachers = teachers.length;
        kpi.overallRate = overallStats.rate;
        kpi.lateCount = overallStats.Late;

        // At-risk: teachers with <70% compliance
        kpi.atRiskCount = teachers.filter((t: Teacher) => {
            const subs = allSubmissions.filter(
                (s: Submission) => s.user_id === t.id,
            );
            const stats = calculateCompliance(subs, t.loadCount);
            return stats.rate < 70 && subs.length > 0;
        }).length;

        // Previous week rate for trend
        const prevCal = calendar.find(
            (c: any) => c.week_number === currentWk - 1,
        );
        const prevWeekSubs = allSubmissions.filter((s: Submission) => {
            const wn = s.week_number || getWeekNumber(new Date(s.created_at));
            return wn === currentWk - 1;
        });
        kpi.previousRate = calculateCompliance(
            prevWeekSubs,
            totalSchoolLoads, // Strictly for one week
        ).rate;

        // Build heatmap & trend chart (only weeks up to the actual current
        // week — the calendar can have far-future weeks pre-defined for the
        // whole school year, which would otherwise dominate the "recent 8
        // weeks" picture with weeks nobody has reached yet, showing 0%).
        const upToDateCalendar = calendar.filter(
            (c: any) => c.week_number <= currentWk,
        );
        buildHeatmap(upToDateCalendar);

        // Build trend chart
        const weeklyData = groupSubmissionsByWeek(
            allSubmissions,
            totalSchoolLoads,
            8,
            upToDateCalendar,
        );
        trendLabels = weeklyData.map((w: any) => w.label);
        trendDatasets = [
            {
                label: "School Compliance",
                data: weeklyData.map((w: any) => w.rate),
                color: "#2563eb",
            },
            {
                label: "100% Target",
                data: weeklyData.map(() => 100),
                color: "#dc2626",
                dashed: true,
            },
        ];

        // K-Means clustering — ISP/ISR aren't part of the weekly DLL cadence
        // these behavioral features (punctuality, completeness) measure, so
        // they're excluded the same way calculateCompliance excludes them.
        const tData = allSubmissions
            .filter((s) => isComplianceTrackedDocType(s.doc_type))
            .map((s) => ({
                user_id: s.user_id,
                compliance_status: s.compliance_status,
                week_number: s.week_number,
                created_at: s.created_at,
            }));
        // Use weeks elapsed so far (not the full calendar's defined weeks,
        // which can include far-future weeks nobody has reached yet) so
        // "completeness" isn't unfairly diluted for teachers who are fully
        // caught up on every week due so far.
        const features = extractFeatures(teachers, tData, Math.max(1, currentWk));
        clusterReady = canCluster(features.length, tData.length);
        if (clusterReady) {
            const output = runKMeansClustering(features, 3);
            clusterResults = output.results;
            clusterSummaries = output.summaries;
        }

        // Cache the full monitoring snapshot for offline viewing
        try {
            await cacheMetadata(`school_monitor_${userProfile.school_id}`, {
                schoolLogoUrl,
                teachers,
                allSubmissions,
                currentDefinedWeeks,
                kpi,
                heatmapRows,
                heatmapWeeks,
                heatmapCells,
                trendLabels,
                trendDatasets,
                clusterReady,
                clusterResults,
                clusterSummaries,
            });
        } catch (e) {
            console.warn(
                "[school-monitor] Failed to cache snapshot:",
                e,
            );
        }
    }

    function applySchoolSnapshot(s: any) {
        schoolLogoUrl = s.schoolLogoUrl ?? null;
        teachers = s.teachers || [];
        allSubmissions = s.allSubmissions || [];
        currentDefinedWeeks = s.currentDefinedWeeks ?? 1;
        kpi = { totalTeachers: 0, overallRate: 0, lateCount: 0, atRiskCount: 0, previousRate: 0, ...(s.kpi || {}) };
        heatmapRows = s.heatmapRows || [];
        heatmapWeeks = s.heatmapWeeks || [];
        heatmapCells = s.heatmapCells || [];
        trendLabels = s.trendLabels || [];
        trendDatasets = s.trendDatasets || [];
        clusterReady = s.clusterReady ?? false;
        clusterResults = s.clusterResults || [];
        clusterSummaries = s.clusterSummaries || [];
        console.log(
            "[school-monitor] Restored monitoring snapshot from offline cache",
        );
    }

    function buildHeatmap(calendar: any[] = []) {
        const currentWeek = getWeekNumber();
        const weekCount = 8;
        const weeks = [];

        if (calendar.length > 0) {
            const recentCal = [...calendar]
                .filter((c: any) => c.is_active === true)
                .sort((a, b) => b.week_number - a.week_number)
                .slice(0, weekCount)
                .reverse();
            for (const cal of recentCal) {
                weeks.push({
                    week: cal.week_number,
                    label: `W${cal.week_number}`,
                    deadline: cal.deadline_date,
                });
            }
        } else {
            for (let i = weekCount - 1; i >= 0; i--) {
                const wk = currentWeek - i;
                if (wk >= 1)
                    weeks.push({ week: wk, label: `W${wk}`, deadline: null });
            }
        }

        heatmapWeeks = weeks;
        heatmapRows = teachers.map((t: Teacher) => t.full_name);

        const cells: any[] = [];
        for (const t of teachers) {
            const teacherSubs = allSubmissions.filter(
                (s: Submission) => s.user_id === t.id,
            );
            for (const w of weeks) {
                const weekSubs = teacherSubs.filter(
                    (s: Submission) => s.week_number === w.week,
                );
                const stats = calculateCompliance(weekSubs, t.loadCount);
                cells.push({
                    row: t.full_name,
                    week: w.week,
                    weekLabel: w.label,
                    rate: stats.rate,
                    count: weekSubs.length,
                    tooltip: `${t.full_name} - ${w.label}: ${stats.rate}% (${stats.Compliant} compliant, ${stats.Late} late, ${stats.NonCompliant} missing)`,
                });
            }
        }
        heatmapCells = cells;
    }

    // Teacher table with sorting + search
    const sortedTeachers = $derived(() => {
        let result = teachers.map((t: Teacher) => {
            const subs = allSubmissions.filter(
                (s: Submission) => s.user_id === t.id,
            );
            // We use a promise inside derived which is not ideal, but for now we'll assume definedWeeks is pre-calculated or use a local reactive state
            // Actually, sortedTeachers is a $derived, so it should be synchronous.
            // I'll need to pre-fetch definedWeeks in loadSchoolData.
            const stats = calculateCompliance(
                subs,
                (t.loadCount || 0) * currentDefinedWeeks,
            );
            return { ...t, ...stats };
        });

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter((t: any) =>
                t.full_name.toLowerCase().includes(q),
            );
        }

        result.sort((a: any, b: any) => {
            const aVal = a[sortField];
            const bVal = b[sortField];
            if (typeof aVal === "number" && typeof bVal === "number") {
                return sortDir === "asc" ? aVal - bVal : bVal - aVal;
            }
            return sortDir === "asc"
                ? String(aVal).localeCompare(String(bVal))
                : String(bVal).localeCompare(String(aVal));
        });

        return result;
    });

    function toggleSort(field: string) {
        if (sortField === field) sortDir = sortDir === "asc" ? "desc" : "asc";
        else {
            sortField = field;
            sortDir = field === "full_name" ? "asc" : "desc";
        }
    }

    function openDrillDown(teacher: any) {
        selectedTeacher = teacher;
        selectedSubmissions = allSubmissions
            .filter((s) => s.user_id === teacher.id)
            .slice(0, 20);
        showModal = true;
    }

    function formatDate(dateStr: string): string {
        return new Date(dateStr).toLocaleDateString("en-PH", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }
</script>

<svelte:head>
    <title>School Monitoring — CEDIMS</title>
</svelte:head>

<div>
    <!-- Header -->
    <div class="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
            <h1 class="text-2xl font-bold text-text-primary">
                {$profile?.role === "Master Teacher"
                    ? "Instructional Supervision"
                    : "Staff Compliance"}
            </h1>
            <p class="text-base text-text-secondary mt-1">
                {$profile?.role === "Master Teacher"
                    ? "See which teachers need coaching and where submissions break down"
                    : "Track staff submissions, rates and who needs follow-up"}
            </p>
        </div>

        {#if $profile?.role === 'School Head' && $profile?.school_id}
        <div class="flex items-center gap-4 bg-surface-white p-4 rounded-2xl border border-border-subtle shadow-sm" in:fade>
            <ProfileUploader 
                id={$profile.school_id}
                bucket="avatars"
                path="schools"
                label="School Logo"
                size="md"
                placeholderIcon={SchoolIcon}
                bind:url={schoolLogoUrl} 
                onUpload={async (newUrl) => {
                    await supabase.from('schools').update({ avatar_url: newUrl }).eq('id', $profile?.school_id || '');
                    addToast("success", "School logo updated");
                }}
            />
            <div class="hidden sm:block">
                <h4 class="text-sm font-bold text-text-primary uppercase tracking-tight">School Branding</h4>
                <p class="text-[10px] text-text-muted font-medium">Official Institutional Logo</p>
            </div>
        </div>
        {/if}
    </div>

        <!-- KPI Cards -->
        <!-- KPI Row -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            <div in:fly={{ y: 20, duration: 400 }}>
                <StatCard
                    icon="Users"
                    value={kpi.totalTeachers}
                    label="Total Teachers"
                />
            </div>
            <div in:fly={{ y: 20, duration: 400, delay: 100 }}>
                <StatCard
                    icon="Activity"
                    value="{kpi.overallRate}%"
                    label="School Rate"
                    color="from-gov-green to-gov-green-dark"
                />
            </div>
            <div in:fly={{ y: 20, duration: 400, delay: 200 }}>
                <StatCard
                    icon="Clock"
                    value={kpi.lateCount}
                    label="Late Submissions"
                    color="from-gov-gold to-gov-gold-dark"
                />
            </div>
            <div in:fly={{ y: 20, duration: 400, delay: 300 }}>
                <StatCard
                    icon="ShieldAlert"
                    value={kpi.atRiskCount}
                    label="Teachers At Risk"
                    color="from-gov-red to-red-700"
                />
            </div>
        </div>

        <!-- Alerts -->
        {#if alertTeachers().length > 0}
            <div
                class="gov-card-static bg-gov-gold/5 p-5 mb-8"
                in:fade={{ duration: 500, delay: 400 }}
            >
                <h3 class="text-sm font-bold text-gov-gold-dark mb-2">
                    Attention: {alertTeachers().length} teacher{alertTeachers()
                        .length > 1
                        ? "s"
                        : ""} with ≥2 late submissions
                </h3>
                <div class="flex flex-wrap gap-2">
                    {#each alertTeachers() as teacher}
                        <button
                            class="px-3 py-1.5 text-xs font-semibold bg-gov-gold/10 text-gov-gold-dark rounded-lg hover:bg-gov-gold/20 transition-colors"
                            onclick={() => openDrillDown(teacher)}
                        >
                            {teacher.full_name}
                        </button>
                    {/each}
                </div>
            </div>
        {/if}

        <!-- Diagnosis vs reporting: the heatmap shows which weeks a teacher
             breaks down on (coaching material, Master Teacher) while the
             trend line tracks the school against target over time (reporting
             upward, School Head). Showing both to both roles made the page
             longer without making either better. -->
        <div class="grid grid-cols-1 gap-6 mb-8">
            {#if $profile?.role === "Master Teacher"}
            <div
                class="gov-card-static p-6"
                in:fly={{ y: 20, duration: 500, delay: 500 }}
            >
                <h3 class="text-lg font-bold text-text-primary mb-4">
                    Submissions by Week
                </h3>
                <div class="overflow-auto max-h-[70vh] touch-pan-x cedims-scroll">
                <ComplianceHeatmap
                    rows={heatmapRows}
                    weeks={heatmapWeeks}
                    cells={heatmapCells}
                    onCellClick={(row, week) => {
                        const teacher = teachers.find(
                            (t) => t.full_name === row,
                        );
                        if (teacher) openDrillDown(teacher);
                    }}
                />
                </div>
            </div>
            {:else}
            <div
                class="gov-card-static p-6"
                in:fly={{ y: 20, duration: 500, delay: 600 }}
            >
                <h3 class="text-lg font-bold text-text-primary mb-4">
                    School vs Target
                </h3>
                {#if trendLabels.length > 0}
                    <ComplianceTrendChart
                        labels={trendLabels}
                        datasets={trendDatasets}
                        height={260}
                    />
                {:else}
                    <div
                        class="flex flex-col items-center justify-center gap-2 h-[260px] text-text-muted"
                    >
                        <LineChart size={28} strokeWidth={1.5} aria-hidden="true" />
                        <p class="text-sm">No trend data available yet</p>
                    </div>
                {/if}
            </div>
            {/if}
        </div>

        <!-- Teacher Table -->
        <div
            class="gov-card-static overflow-hidden"
            in:fade={{ duration: 500, delay: 700 }}
        >
            <div
                class="px-6 py-4 border-b border-border-subtle flex items-center justify-between flex-wrap gap-3"
            >
                <h3 class="text-lg font-bold text-text-primary">
                    Teacher Compliance
                </h3>
                <div class="flex items-center gap-2 w-full sm:w-auto">
                    <input
                        type="text"
                        bind:value={searchQuery}
                        placeholder="Search teacher..."
                        class="flex-1 sm:w-56 px-4 py-2 text-sm bg-surface-white/60 border border-border-subtle rounded-xl focus:ring-2 focus:ring-gov-blue/30 focus:border-gov-blue outline-none"
                    />
                    <select
                        bind:value={sortField}
                        aria-label="Sort teachers by"
                        class="px-3 py-2 text-sm font-bold bg-surface-white/60 border border-border-subtle rounded-xl focus:ring-2 focus:ring-gov-blue/30 focus:border-gov-blue outline-none"
                    >
                        <option value="full_name">Name</option>
                        <option value="rate">Compliance Rate</option>
                        <option value="Late">Late</option>
                        <option value="NonCompliant">Missing</option>
                    </select>
                    <button
                        type="button"
                        onclick={() => (sortDir = sortDir === "asc" ? "desc" : "asc")}
                        class="p-2.5 rounded-xl bg-surface-white/60 border border-border-subtle text-text-muted hover:text-gov-blue hover:border-gov-blue/30 transition-colors flex-shrink-0"
                        title={sortDir === "asc" ? "Ascending — click to reverse" : "Descending — click to reverse"}
                        aria-label="Toggle sort direction"
                    >
                        <ArrowUpDown size={16} class={sortDir === "asc" ? "" : "scale-y-[-1]"} />
                    </button>
                </div>
            </div>

            {#if sortedTeachers().length === 0}
                <EmptyState
                    icon={Users}
                    title="No teachers found"
                    description={searchQuery ? "Try a different search." : "No teachers are assigned to this school yet."}
                />
            {:else}
                <div class="p-6">
                    <div
                        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-h-[60vh] overflow-y-auto pr-1"
                    >
                        {#each sortedTeachers() as teacher}
                            <button
                                type="button"
                                class="bg-surface-white border border-border-subtle rounded-xl p-6 shadow-sm hover:shadow-md hover:border-gov-blue/20 transition-colors flex flex-col group cursor-pointer text-left w-full"
                                onclick={() => openDrillDown(teacher)}
                                in:fly={{ y: 20, duration: 400 }}
                            >
                                <div
                                    class="flex justify-between items-start mb-4"
                                >
                                    <div>
                                        <h4
                                            class="font-bold text-base text-text-primary group-hover:text-gov-blue transition-colors leading-tight"
                                        >
                                            {teacher.full_name}
                                        </h4>
                                        <p
                                            class="text-[10px] text-text-muted font-bold uppercase tracking-tight mt-1"
                                        >
                                            Total: {teacher.total} Documents
                                        </p>
                                    </div>
                                    <span
                                        class="px-2.5 py-1 rounded-full text-[10px] font-bold {getComplianceBgClass(
                                            teacher.rate,
                                        )} {getComplianceClass(
                                            teacher.rate,
                                        )} uppercase tracking-wide"
                                    >
                                        {teacher.rate}%
                                    </span>
                                </div>

                                <div class="grid grid-cols-3 gap-2 mb-6">
                                    <div
                                        class="bg-gov-green/5 p-2 rounded text-center"
                                    >
                                        <p
                                            class="text-[9px] font-bold text-gov-green uppercase leading-none mb-1"
                                        >
                                            Pass
                                        </p>
                                        <p
                                            class="text-xs font-bold text-text-primary"
                                        >
                                            {teacher.Compliant}
                                        </p>
                                    </div>
                                    <div
                                        class="bg-gov-gold/5 p-2 rounded text-center"
                                    >
                                        <p
                                            class="text-[9px] font-bold text-gov-gold-dark uppercase leading-none mb-1"
                                        >
                                            Late
                                        </p>
                                        <p
                                            class="text-xs font-bold text-text-primary"
                                        >
                                            {teacher.Late}
                                        </p>
                                    </div>
                                    <div
                                        class="bg-gov-red/5 p-2 rounded text-center"
                                    >
                                        <p
                                            class="text-[9px] font-bold text-gov-red uppercase leading-none mb-1"
                                        >
                                            Miss
                                        </p>
                                        <p
                                            class="text-xs font-bold text-text-primary"
                                        >
                                            {teacher.NonCompliant}
                                        </p>
                                    </div>
                                </div>

                                <div
                                    class="mt-auto pt-4 border-t border-gray-50"
                                >
                                    <div
                                        class="w-full py-2 bg-gov-blue/5 text-gov-blue group-hover:bg-gov-blue group-hover:text-white rounded-lg transition-colors font-bold text-[10px] uppercase tracking-widest border border-gov-blue/10 flex items-center justify-center"
                                    >
                                        View Details
                                    </div>
                                </div>
                            </button>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>

        <!-- K-Means Cluster Analysis — grouping teachers by submission
             behaviour is a coaching tool, so it belongs to the Master
             Teacher. A School Head already has the at-risk count and the
             roster, and the District Supervisor gets clustering at school
             level on the Analytics page. -->
        {#if $profile?.role === "Master Teacher" && clusterReady && clusterResults.length > 0}
            <div class="mt-8" in:fade={{ duration: 600 }}>
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h3 class="text-lg font-bold text-text-primary">
                            Teacher Performance Groups
                        </h3>
                        <p class="text-sm text-text-secondary">
                            Teachers grouped by how consistently they submit
                        </p>
                    </div>
                    <button
                        onclick={() => (clusterShow = !clusterShow)}
                        class="px-4 py-2 text-sm font-semibold rounded-xl border border-border-subtle hover:bg-surface-muted transition-colors"
                    >
                        {clusterShow ? "Hide" : "Show"} Clusters
                    </button>
                </div>
                {#if clusterShow}
                    <ClusterVisualization
                        results={clusterResults}
                        summaries={clusterSummaries}
                    />
                {/if}
            </div>
        {/if}
</div>

<!-- Drill-Down Modal -->
<DrillDownModal
    isOpen={showModal}
    title={selectedTeacher
        ? `Submissions: ${selectedTeacher.full_name}`
        : "Teacher Details"}
    onClose={() => {
        showModal = false;
        selectedTeacher = null;
    }}
>
    {#if selectedTeacher}
        {@const stats = calculateCompliance(selectedSubmissions)}
        <div class="grid grid-cols-3 gap-3 mb-4">
            <div class="text-center p-3 rounded-xl bg-gov-green/10">
                <p class="text-lg font-bold text-gov-green">
                    {stats.Compliant}
                </p>
                <p class="text-xs text-text-muted">Compliant</p>
            </div>
            <div class="text-center p-3 rounded-xl bg-gov-gold/10">
                <p class="text-lg font-bold text-gov-gold-dark">
                    {stats.Late}
                </p>
                <p class="text-xs text-text-muted">Late</p>
            </div>
            <div class="text-center p-3 rounded-xl bg-gov-red/10">
                <p class="text-lg font-bold text-gov-red">
                    {stats.NonCompliant}
                </p>
                <p class="text-xs text-text-muted">Missing</p>
            </div>
        </div>

        {#if selectedSubmissions.length === 0}
            <p class="text-center text-text-muted py-6">No submissions found</p>
        {:else}
            <div class="divide-y divide-border-subtle max-h-[55vh] overflow-y-auto pr-1 cedims-scroll">
                {#each selectedSubmissions as sub}
                    {@const tl = Array.isArray(sub.teaching_loads)
                        ? sub.teaching_loads[0]
                        : sub.teaching_loads}
                    <div class="flex items-center justify-between py-3">
                        <div class="min-w-0 flex-1">
                            <p
                                class="text-sm font-medium text-text-primary truncate"
                            >
                                {sub.file_name}
                            </p>
                            <p class="text-xs text-text-muted">
                                {sub.doc_type}
                                {#if tl}
                                    - {tl.subject} - Gr. {tl.grade_level}{/if}
                            </p>
                        </div>
                        <div class="flex items-center gap-3 flex-shrink-0">
                            <StatusBadge
                                status={!sub.compliance_status ||
                                sub.compliance_status === "on-time" ||
                                sub.compliance_status === "compliant"
                                    ? "compliant"
                                    : sub.compliance_status === "late"
                                      ? "late"
                                      : "missing"}
                                size="sm"
                            />
                            <span class="text-xs text-text-muted whitespace-nowrap"
                                >{formatDate(sub.created_at)}</span
                            >

                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    {/if}
</DrillDownModal>

