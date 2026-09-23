<script lang="ts">
    import PageHeader from "$lib/components/PageHeader.svelte";
    import SkeletonLoader from "$lib/components/SkeletonLoader.svelte";
    import { addToast } from "$lib/stores/toast";
    import { profile } from "$lib/utils/auth";
    import { supabase } from "$lib/utils/supabase";
    import {
        calculateCompliance,
        getCurrentWeekFromCalendar,
        getDefinedWeeksCount,
        getDynamicSchoolYear,
        isComplianceTrackedDocType,
    } from "$lib/utils/useDashboardData";
    import { canCluster, extractFeatures, runKMeansClustering, type ClusterSummary } from "$lib/utils/clusterAnalytics";
    import {
        ArrowLeft,
        ArrowUpDown,
        CheckCircle2,
        Clock3,
        Eye,
        FileCheck2,
        Search,
        ShieldAlert,
        Sparkles,
        Users,
    } from "lucide-svelte";
    import { onDestroy, onMount } from "svelte";

    type ScopeMode = "school" | "district";

    type TeacherRow = {
        id: string;
        name: string;
        loadLabel: string;
        expected: number;
        compliant: number;
        missing: number;
        late: number;
        forChecking: number;
        checked: number;
        rate: number;
        schoolId?: string | null;
        schoolName?: string;
    };

    type SchoolRow = {
        id: string;
        name: string;
        teacherCount: number;
        compliant: number;
        missing: number;
        late: number;
        forChecking: number;
        checked: number;
        rate: number;
    };

    type Summary = {
        compliant: number;
        missing: number;
        late: number;
        forChecking: number;
        checked: number;
    };

    let loading = $state(true);
    let loadError = $state<string | null>(null);
    let mode = $state<ScopeMode>("school");
    let teacherRows = $state<TeacherRow[]>([]);
    let schoolRows = $state<SchoolRow[]>([]);
    let selectedSchoolId = $state<string | null>(null);
    let selectedSchoolName = $state<string | null>(null);
    let clusterSummaries = $state<ClusterSummary[]>([]);
    let canShowClusters = $state(false);
    let clusterTeachers = $state<any[]>([]);
    let clusterSubmissions = $state<any[]>([]);
    let clusterWeeks = $state(1);
    let search = $state("");
    let statusFilter = $state("all");
    let weekFilter = $state("all");
    let sortField = $state<keyof TeacherRow>("name");
    let sortDir = $state<"asc" | "desc">("asc");
    let currentPage = $state(1);
    let currentWeek = $state(1);
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const pageSize = 8;

    const visibleTeacherRows = $derived.by(() => {
        if (mode !== "district" || !selectedSchoolId) return teacherRows;
        return teacherRows.filter((row) => row.schoolId === selectedSchoolId);
    });

    const summary = $derived.by((): Summary => summarizeRows(visibleTeacherRows));
    const districtSummary = $derived.by((): Summary => summarizeRows(teacherRows));

    const filteredRows = $derived.by(() => {
        const q = search.trim().toLowerCase();
        let rows = visibleTeacherRows.filter((row) => {
            const matchesSearch =
                !q ||
                row.name.toLowerCase().includes(q) ||
                row.loadLabel.toLowerCase().includes(q) ||
                (row.schoolName || "").toLowerCase().includes(q);
            const matchesStatus =
                statusFilter === "all" ||
                (statusFilter === "compliant" && row.missing === 0) ||
                (statusFilter === "missing" && row.missing > 0) ||
                (statusFilter === "late" && row.late > 0) ||
                (statusFilter === "forChecking" && row.forChecking > 0) ||
                (statusFilter === "checked" && row.checked > 0);
            return matchesSearch && matchesStatus;
        });

        rows = [...rows].sort((a, b) => {
            const aVal = a[sortField];
            const bVal = b[sortField];
            if (typeof aVal === "number" && typeof bVal === "number") {
                return sortDir === "asc" ? aVal - bVal : bVal - aVal;
            }
            return sortDir === "asc"
                ? String(aVal).localeCompare(String(bVal))
                : String(bVal).localeCompare(String(aVal));
        });
        return rows;
    });

    const totalPages = $derived(Math.max(1, Math.ceil(filteredRows.length / pageSize)));
    $effect(() => {
        if (currentPage > totalPages) currentPage = totalPages;
    });
    const pageRows = $derived(filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize));

    const statCards = $derived([
        { label: "Compliant", value: (mode === "district" && !selectedSchoolId ? districtSummary : summary).compliant, icon: CheckCircle2, tone: "text-gov-green", bg: "bg-gov-green/10" },
        { label: "Missing", value: (mode === "district" && !selectedSchoolId ? districtSummary : summary).missing, icon: ShieldAlert, tone: "text-gov-red", bg: "bg-gov-red/10" },
        { label: "Late", value: (mode === "district" && !selectedSchoolId ? districtSummary : summary).late, icon: Clock3, tone: "text-gov-gold", bg: "bg-gov-gold/10" },
        { label: "For Checking", value: (mode === "district" && !selectedSchoolId ? districtSummary : summary).forChecking, icon: Eye, tone: "text-gov-blue", bg: "bg-gov-blue/10" },
        { label: "Checked", value: (mode === "district" && !selectedSchoolId ? districtSummary : summary).checked, icon: FileCheck2, tone: "text-gov-green", bg: "bg-gov-green/10" },
    ]);

    onMount(async () => {
        await loadCompliance();
        realtimeChannel = supabase
            .channel("compliance-monitoring-live")
            .on("postgres_changes", { event: "*", schema: "public", table: "submissions" }, queueRefresh)
            .on("postgres_changes", { event: "*", schema: "public", table: "dll_reviews" }, queueRefresh)
            .on("postgres_changes", { event: "*", schema: "public", table: "teaching_loads" }, queueRefresh)
            .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, queueRefresh)
            .subscribe();
    });

    onDestroy(() => {
        if (refreshTimer) clearTimeout(refreshTimer);
        if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    });

    function queueRefresh() {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
            loadCompliance();
            refreshTimer = null;
        }, 350);
    }

    async function loadCompliance() {
        const userProfile = $profile;
        if (!userProfile || !["Master Teacher", "School Head", "District Supervisor"].includes(userProfile.role || "")) {
            loadError = "Compliance Monitoring is available to supervisors.";
            loading = false;
            return;
        }

        loading = true;
        loadError = null;

        try {
            mode = userProfile.role === "District Supervisor" ? "district" : "school";
            if (mode === "district") await loadDistrictCompliance(userProfile);
            else await loadSchoolCompliance(userProfile);
        } catch (err) {
            console.error("[compliance-monitoring] load failed", err);
            loadError = "Failed to load compliance monitoring data. Please try again.";
            addToast("error", loadError);
        } finally {
            loading = false;
        }
    }

    async function loadSchoolCompliance(userProfile: any) {
        const [teachersRes, loadsRes, submissionsRes, reviewsRes] = await Promise.all([
            supabase
                .from("profiles")
                .select("id, full_name, role, school_id")
                .eq("school_id", userProfile.school_id)
                .in("role", ["Teacher", "Master Teacher"])
                .order("full_name"),
            supabase
                .from("teaching_loads")
                .select("id, user_id, subject, grade_level, profiles!inner(school_id)")
                .eq("profiles.school_id", userProfile.school_id),
            supabase
                .from("submissions")
                .select("id, user_id, file_name, doc_type, compliance_status, created_at, week_number, teaching_load_id, teaching_loads(subject, grade_level), profiles!inner(school_id)")
                .eq("profiles.school_id", userProfile.school_id)
                .order("created_at", { ascending: false }),
            supabase.from("dll_reviews").select("submission_id, reviewer_comment"),
        ]);

        if (teachersRes.error) throw teachersRes.error;
        if (loadsRes.error) throw loadsRes.error;
        if (submissionsRes.error) throw submissionsRes.error;

        currentWeek = await getCurrentWeekFromCalendar(supabase, getDynamicSchoolYear(), userProfile.district_id || undefined);
        const definedWeeks = await getDefinedWeeksCount(supabase);
        const activeWeeks = Math.max(1, Math.min(currentWeek || 1, definedWeeks || 1));
        const teachers = teachersRes.data || [];
        const loads = loadsRes.data || [];
        const submissions = (submissionsRes.data || []).filter((s: any) => isComplianceTrackedDocType(s.doc_type));
        const reviewBySubmission = new Map((reviewsRes.data || []).map((r: any) => [r.submission_id, r.reviewer_comment]));

        schoolRows = [];
        selectedSchoolId = null;
        selectedSchoolName = null;
        teacherRows = buildTeacherRows(teachers, loads, submissions, reviewBySubmission, activeWeeks);
        clusterTeachers = teachers;
        clusterSubmissions = submissions;
        clusterWeeks = activeWeeks;
        buildClusters(teachers, submissions, activeWeeks);
    }

    async function loadDistrictCompliance(userProfile: any) {
        const schoolsRes = await supabase
            .from("schools")
            .select("id, name, district_id")
            .eq("district_id", userProfile.district_id)
            .order("name");
        if (schoolsRes.error) throw schoolsRes.error;

        const schools = schoolsRes.data || [];
        const schoolIds = schools.map((school: any) => school.id);
        if (schoolIds.length === 0) {
            teacherRows = [];
            schoolRows = [];
            clusterSummaries = [];
            canShowClusters = false;
            return;
        }

        const [teachersRes, loadsRes, submissionsRes, reviewsRes, calendarRes] = await Promise.all([
            supabase
                .from("profiles")
                .select("id, full_name, role, school_id")
                .in("school_id", schoolIds)
                .in("role", ["Teacher", "Master Teacher"])
                .order("full_name"),
            supabase
                .from("teaching_loads")
                .select("id, user_id, subject, grade_level, profiles!inner(school_id)")
                .in("profiles.school_id", schoolIds),
            supabase
                .from("submissions")
                .select("id, user_id, file_name, doc_type, compliance_status, created_at, week_number, teaching_load_id, teaching_loads(subject, grade_level), profiles!inner(school_id)")
                .in("profiles.school_id", schoolIds)
                .order("created_at", { ascending: false }),
            supabase.from("dll_reviews").select("submission_id, reviewer_comment"),
            supabase
                .from("academic_calendar")
                .select("week_number, is_active, district_id, school_year")
                .eq("school_year", getDynamicSchoolYear())
                .order("week_number", { ascending: true }),
        ]);

        if (teachersRes.error) throw teachersRes.error;
        if (loadsRes.error) throw loadsRes.error;
        if (submissionsRes.error) throw submissionsRes.error;

        currentWeek = await getCurrentWeekFromCalendar(supabase, getDynamicSchoolYear(), userProfile.district_id || undefined);
        const districtWeeks = (calendarRes.data || []).filter((week: any) => week.district_id === userProfile.district_id && week.is_active);
        const activeWeeks = Math.max(1, Math.min(currentWeek || 1, districtWeeks.length || currentWeek || 1));
        const schoolNameById = new Map(schools.map((school: any) => [school.id, school.name]));
        const teachers = (teachersRes.data || []).map((teacher: any) => ({
            ...teacher,
            school_name: schoolNameById.get(teacher.school_id) || "Unassigned School",
        }));
        const loads = loadsRes.data || [];
        const submissions = (submissionsRes.data || []).filter((s: any) => isComplianceTrackedDocType(s.doc_type));
        const reviewBySubmission = new Map((reviewsRes.data || []).map((r: any) => [r.submission_id, r.reviewer_comment]));

        teacherRows = buildTeacherRows(teachers, loads, submissions, reviewBySubmission, activeWeeks);
        clusterTeachers = teachers;
        clusterSubmissions = submissions;
        clusterWeeks = activeWeeks;
        schoolRows = schools.map((school: any) => {
            const rows = teacherRows.filter((row) => row.schoolId === school.id);
            const stats = summarizeRows(rows);
            const expected = rows.reduce((sum, row) => sum + row.expected, 0);
            const actual = stats.compliant;
            return {
                id: school.id,
                name: school.name,
                teacherCount: rows.length,
                ...stats,
                rate: expected > 0 ? Math.round((actual / expected) * 100) : 0,
            };
        });
        if (selectedSchoolId) buildClustersForSchool(selectedSchoolId);
        else buildClusters(teachers, submissions, activeWeeks);
    }

    function buildTeacherRows(teachers: any[], loads: any[], submissions: any[], reviewBySubmission: Map<any, any>, activeWeeks: number): TeacherRow[] {
        return teachers.map((teacher: any) => {
            const teacherLoads = loads.filter((load: any) => load.user_id === teacher.id);
            const teacherSubs = submissions.filter((sub: any) => sub.user_id === teacher.id);
            const stats = calculateCompliance(teacherSubs, teacherLoads.length * activeWeeks);
            const checked = teacherSubs.filter((sub: any) => reviewBySubmission.get(sub.id)).length;
            const forChecking = teacherSubs.filter((sub: any) => !reviewBySubmission.get(sub.id)).length;

            return {
                id: teacher.id,
                name: teacher.full_name || "Unnamed teacher",
                loadLabel: summarizeLoads(teacherLoads),
                expected: stats.expected,
                compliant: stats.Compliant,
                missing: stats.NonCompliant,
                late: stats.Late,
                forChecking,
                checked,
                rate: stats.rate,
                schoolId: teacher.school_id || null,
                schoolName: teacher.school_name,
            };
        });
    }

    function buildClusters(teachers: any[], submissions: any[], activeWeeks: number) {
        const clusterInput = submissions.map((sub: any) => ({
            user_id: sub.user_id,
            compliance_status: sub.compliance_status,
            week_number: sub.week_number,
            created_at: sub.created_at,
        }));
        canShowClusters = canCluster(teachers.length, clusterInput.length);
        clusterSummaries = canShowClusters
            ? runKMeansClustering(extractFeatures(teachers, clusterInput, activeWeeks), 3).summaries
            : [];
    }

    function buildClustersForSchool(schoolId: string) {
        const teachers = clusterTeachers.filter((teacher: any) => teacher.school_id === schoolId);
        const teacherIds = new Set(teachers.map((teacher: any) => teacher.id));
        const submissions = clusterSubmissions.filter((sub: any) => teacherIds.has(sub.user_id));
        buildClusters(teachers, submissions, clusterWeeks);
    }

    function summarizeRows(rows: TeacherRow[]): Summary {
        return rows.reduce(
            (acc, row) => {
                acc.compliant += row.compliant;
                acc.missing += row.missing;
                acc.late += row.late;
                acc.forChecking += row.forChecking;
                acc.checked += row.checked;
                return acc;
            },
            { compliant: 0, missing: 0, late: 0, forChecking: 0, checked: 0 },
        );
    }

    function summarizeLoads(loads: any[]): string {
        if (loads.length === 0) return "No active load";
        const first = loads[0];
        const firstLabel = [first.subject, first.grade_level ? `Grade ${first.grade_level}` : ""]
            .filter(Boolean)
            .join(" / ");
        return loads.length === 1 ? firstLabel : `${firstLabel} +${loads.length - 1}`;
    }

    function toggleSort(field: keyof TeacherRow) {
        if (sortField === field) sortDir = sortDir === "asc" ? "desc" : "asc";
        else {
            sortField = field;
            sortDir = field === "name" ? "asc" : "desc";
        }
        currentPage = 1;
    }

    function openReview() {
        window.location.href = "/dashboard";
    }

    function openSchool(school: SchoolRow) {
        selectedSchoolId = school.id;
        selectedSchoolName = school.name;
        search = "";
        statusFilter = "all";
        weekFilter = "all";
        currentPage = 1;
        buildClustersForSchool(school.id);
    }

    function closeSchool() {
        selectedSchoolId = null;
        selectedSchoolName = null;
        search = "";
        statusFilter = "all";
        weekFilter = "all";
        currentPage = 1;
        buildClusters(clusterTeachers, clusterSubmissions, clusterWeeks);
    }
</script>

<svelte:head>
    <title>Compliance Monitoring: CEDIMS</title>
</svelte:head>

<PageHeader
    title={mode === "district" && selectedSchoolName ? selectedSchoolName : "Compliance Monitoring"}
    description={mode === "district" && !selectedSchoolId
        ? "See district-wide school compliance, missing submissions, late uploads, and review workload."
        : "See who is compliant, missing, late, or waiting for review."}
/>

{#if loading}
    <SkeletonLoader variant="card-grid" count={3} />
{:else if loadError}
    <div class="gov-card-static p-8 text-center">
        <p class="font-semibold text-text-primary">{loadError}</p>
        <button class="mt-4 rounded-lg bg-gov-blue px-4 py-2 text-sm font-bold text-white" onclick={loadCompliance}>
            Try Again
        </button>
    </div>
{:else}
    <div class="space-y-5">
        {#if mode === "district" && selectedSchoolId}
            <button class="cedims-back-button" onclick={closeSchool} aria-label="Back to schools" title="Back to Schools">
                <ArrowLeft size={16} />
            </button>
        {/if}

        <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {#each statCards as card}
                {@const Icon = card.icon}
                <div class="gov-card-static flex items-center gap-3 p-4">
                    <div class={`flex h-11 w-11 items-center justify-center rounded-lg ${card.bg} ${card.tone}`}>
                        <Icon size={20} />
                    </div>
                    <div>
                        <p class="text-xs font-bold uppercase tracking-normal text-text-muted">{card.label}</p>
                        <p class="text-2xl font-extrabold text-text-primary">{card.value}</p>
                    </div>
                </div>
            {/each}
        </section>

        <section class="gov-card-static overflow-hidden">
            <div class="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
                <div class="flex items-center gap-2">
                    <Sparkles size={18} class="text-gov-blue" />
                    <h2 class="text-sm font-bold uppercase tracking-normal text-text-primary">K-Means Compliance Groups</h2>
                </div>
                <p class="text-xs font-bold uppercase tracking-normal text-text-muted">
                    {mode === "district" && !selectedSchoolId ? "District-wide" : "School view"}
                </p>
            </div>
            {#if canShowClusters}
                <div class="grid gap-3 p-4 md:grid-cols-3">
                    {#each clusterSummaries as cluster}
                        <div class="rounded-lg border border-border-subtle bg-surface-muted p-3">
                            <div class="mb-2 flex items-center justify-between gap-2">
                                <p class="text-sm font-bold text-text-primary">{cluster.label}</p>
                                <span class="h-3 w-3 rounded-full" style={`background:${cluster.color}`}></span>
                            </div>
                            <p class="text-2xl font-extrabold text-text-primary">{cluster.count}</p>
                            <p class="mt-1 text-xs font-semibold text-text-muted">Avg completeness {cluster.avgCompleteness}% · fulfillment {cluster.avgPunctuality}%</p>
                        </div>
                    {/each}
                </div>
            {:else}
                <div class="p-4 text-sm font-semibold text-text-muted">
                    K-Means groups will appear after at least two teachers are available in this compliance view.
                </div>
            {/if}
        </section>

        {#if mode === "district" && !selectedSchoolId}
            <section class="gov-card-static overflow-hidden">
                <div class="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
                    <div class="flex items-center gap-2">
                        <Users size={18} class="text-gov-blue" />
                        <h2 class="text-sm font-bold uppercase tracking-normal text-text-primary">School Compliance</h2>
                    </div>
                    <p class="text-xs font-bold uppercase tracking-normal text-text-muted">{schoolRows.length} schools</p>
                </div>
                <div class="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                    {#each schoolRows as school}
                        <button class="rounded-lg border border-border-subtle bg-surface-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-gov-blue/40 hover:shadow-md" onclick={() => openSchool(school)}>
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0">
                                    <p class="truncate text-base font-extrabold text-text-primary">{school.name}</p>
                                    <p class="text-xs font-semibold text-text-muted">{school.teacherCount} teachers</p>
                                </div>
                                <span class="rounded-lg bg-gov-blue/10 px-3 py-1 text-sm font-bold text-gov-blue">{school.rate}%</span>
                            </div>
                            <div class="mt-4 grid grid-cols-5 gap-2 text-center">
                                <div><p class="text-lg font-bold text-gov-green">{school.compliant}</p><p class="text-[10px] font-bold uppercase text-text-muted">Comp.</p></div>
                                <div><p class="text-lg font-bold text-gov-red">{school.missing}</p><p class="text-[10px] font-bold uppercase text-text-muted">Miss</p></div>
                                <div><p class="text-lg font-bold text-gov-gold">{school.late}</p><p class="text-[10px] font-bold uppercase text-text-muted">Late</p></div>
                                <div><p class="text-lg font-bold text-gov-blue">{school.forChecking}</p><p class="text-[10px] font-bold uppercase text-text-muted">Check</p></div>
                                <div><p class="text-lg font-bold text-gov-green">{school.checked}</p><p class="text-[10px] font-bold uppercase text-text-muted">Done</p></div>
                            </div>
                            <p class="mt-4 rounded-lg bg-gov-blue px-3 py-2 text-center text-xs font-bold text-white">View School Compliance</p>
                        </button>
                    {:else}
                        <div class="col-span-full p-8 text-center text-sm text-text-muted">No schools available.</div>
                    {/each}
                </div>
            </section>
        {:else}
            <section class="gov-card-static overflow-hidden">
                <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
                    <div class="flex items-center gap-2">
                        <Users size={18} class="text-gov-blue" />
                        <h2 class="text-sm font-bold uppercase tracking-normal text-text-primary">Teacher List</h2>
                    </div>
                    <p class="text-xs font-bold uppercase tracking-normal text-text-muted">
                        Showing {filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length}
                    </p>
                </div>

                <div class="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-surface-muted p-3">
                    <div class="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-border-subtle bg-surface-white px-3 py-2">
                        <Search size={16} class="text-text-muted" />
                        <input
                            bind:value={search}
                            oninput={() => (currentPage = 1)}
                            class="min-w-0 flex-1 bg-transparent text-sm outline-none"
                            placeholder="Search teacher or load..."
                        />
                    </div>
                    <select bind:value={statusFilter} onchange={() => (currentPage = 1)} class="rounded-lg border border-border-subtle bg-surface-white px-3 py-2 text-sm font-semibold">
                        <option value="all">All Status</option>
                        <option value="compliant">Compliant</option>
                        <option value="missing">Missing</option>
                        <option value="late">Late</option>
                        <option value="forChecking">For Checking</option>
                        <option value="checked">Checked</option>
                    </select>
                    <select bind:value={weekFilter} class="rounded-lg border border-border-subtle bg-surface-white px-3 py-2 text-sm font-semibold">
                        <option value="all">All Weeks</option>
                        {#each Array.from({ length: currentWeek }, (_, i) => i + 1) as week}
                            <option value={String(week)}>Week {week}</option>
                        {/each}
                    </select>
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full min-w-[780px] text-left">
                        <thead class="bg-surface-white text-xs font-bold uppercase tracking-normal text-text-muted">
                            <tr>
                                {#each [
                                    ["name", "Teacher"],
                                    ["compliant", "Compliant"],
                                    ["missing", "Missing"],
                                    ["late", "Late"],
                                    ["forChecking", "For Checking"],
                                    ["checked", "Checked"],
                                    ["rate", "Rate"],
                                ] as header}
                                    <th class="px-4 py-3">
                                        <button class="inline-flex items-center gap-1" onclick={() => toggleSort(header[0] as keyof TeacherRow)}>
                                            {header[1]}
                                            <ArrowUpDown size={12} />
                                        </button>
                                    </th>
                                {/each}
                                <th class="px-4 py-3">Action</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-border-subtle">
                            {#each pageRows as row}
                                <tr class="bg-surface-white hover:bg-gov-blue/5">
                                    <td class="px-4 py-3">
                                        <p class="font-bold text-text-primary">{row.name}</p>
                                        <p class="text-xs text-text-muted">{row.loadLabel}</p>
                                    </td>
                                    <td class="px-4 py-3 font-bold text-gov-green">{row.compliant}</td>
                                    <td class="px-4 py-3 font-bold text-gov-red">{row.missing}</td>
                                    <td class="px-4 py-3 font-bold text-gov-gold">{row.late}</td>
                                    <td class="px-4 py-3 font-bold text-gov-blue">{row.forChecking}</td>
                                    <td class="px-4 py-3 font-bold text-gov-green">{row.checked}</td>
                                    <td class="px-4 py-3">
                                        <span class="rounded-lg bg-surface-muted px-2 py-1 text-xs font-bold text-text-primary">{row.rate}%</span>
                                    </td>
                                    <td class="px-4 py-3">
                                        <button class="rounded-lg bg-gov-blue px-3 py-2 text-xs font-bold text-white hover:bg-gov-blue-dark" onclick={openReview}>
                                            Review
                                        </button>
                                    </td>
                                </tr>
                            {:else}
                                <tr>
                                    <td colspan="8" class="px-4 py-8 text-center text-sm text-text-muted">No teachers match this view.</td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>

                <div class="cedims-pagination-shell border-t border-border-subtle bg-surface-muted px-4 py-3">
                    <span class="text-xs font-bold uppercase tracking-normal text-text-muted">
                        Showing {filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length}
                    </span>
                    <div class="cedims-pagination">
                    <button class="cedims-page-button" disabled={currentPage <= 1} onclick={() => (currentPage = Math.max(1, currentPage - 1))}>
                        Previous
                    </button>
                    <span class="cedims-page-indicator">{currentPage} / {totalPages}</span>
                    <button class="cedims-page-button is-next" disabled={currentPage >= totalPages} onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}>
                        Next
                    </button>
                    </div>
                </div>
            </section>
        {/if}
    </div>
{/if}
