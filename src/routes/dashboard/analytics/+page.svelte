<script lang="ts">
    import { profile } from "$lib/utils/auth";
    import { supabase } from "$lib/utils/supabase";
    import LineChart from "$lib/components/charts/LineChart.svelte";
    import DonutChart from "$lib/components/charts/DonutChart.svelte";
    import ComplianceHeatmap from "$lib/components/ComplianceHeatmap.svelte";
    import StatCard from "$lib/components/StatCard.svelte";
    import SkeletonLoader from "$lib/components/SkeletonLoader.svelte";
    import { onMount, onDestroy } from "svelte";
    import {
        getSchoolHeadAnalytics,
        getDistrictSupervisorAnalytics,
        generateComplianceTrend,
        getPerformanceDistribution,
        forecastCompliance,
    } from "$lib/utils/analyticsQueries";
    import {
        calculateCompliance,
        getDefinedWeeksCount,
        getDynamicSchoolYear,
        getSubmissionWeek,
        isComplianceTrackedDocType,
    } from "$lib/utils/useDashboardData";
    import { WifiOff } from "lucide-svelte";
    import { connectivity } from "$lib/stores/connectivity";
    const { isOnline: onlineStatus } = connectivity;

    let loading = $state(true);
    let loadError = $state<string | null>(null);
    let analyticsData = $state<any>(null);
    let trends = $state<any>(null);
    let distributions = $state<any>(null);
    let heatmap = $state<{
        rows: string[];
        weeks: { week: number; label: string }[];
        cells: any[];
    }>({ rows: [], weeks: [], cells: [] });
    let lastUpdated = $state<Date | null>(null);
    let now = $state(Date.now());
    // Expected slots (active teaching loads × opened calendar weeks) for this
    // scope, so "Overall Compliance" here means the same thing as the
    // Dashboard's "Compliance Rate" and District Monitoring's "District
    // Rate" — of everything due, how much got done — instead of only
    // measuring on-time-ness among documents that already exist.
    let expectedTotal = $state(0);

    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    async function loadAnalytics() {
        loadError = null;
        try {
            if ($profile && ($profile.role === 'School Head' || $profile.role === 'District Supervisor')) {
                const role = $profile.role;
                const schoolId = $profile.school_id;
                const districtId = $profile.district_id;

                if (role === 'School Head') {
                    analyticsData = await getSchoolHeadAnalytics(schoolId, districtId);
                } else {
                    analyticsData = await getDistrictSupervisorAnalytics(districtId);
                }

                // Expected total for this scope: active teaching loads for
                // actual teachers, times the calendar weeks this district has
                // opened so far — the same "expected" formula the rest of
                // the app uses, scoped the same way.
                let loadsQuery = supabase
                    .from('teaching_loads')
                    .select('id, profiles!inner(school_id, district_id, role)')
                    .in('profiles.role', ['Teacher', 'Master Teacher']);
                loadsQuery = role === 'School Head'
                    ? loadsQuery.eq('profiles.school_id', schoolId)
                    : loadsQuery.eq('profiles.district_id', districtId);
                const { data: loadsData } = await loadsQuery;
                const totalLoads = (loadsData || []).length;
                const definedWeeks = await getDefinedWeeksCount(
                    supabase,
                    getDynamicSchoolYear(),
                    districtId ?? undefined,
                );
                expectedTotal = totalLoads * definedWeeks;

                if (analyticsData) {
                    // ISP/ISR aren't part of the weekly DLL cadence these
                    // trend/distribution metrics measure — excluded the same
                    // way calculateCompliance excludes them.
                    const submissions = (analyticsData.complianceTrend || []).filter(
                        (s: any) => isComplianceTrackedDocType(s.doc_type),
                    );
                    const teacherData = (
                        analyticsData.teacherPerformance || analyticsData.teacherDistribution || []
                    ).filter((s: any) => isComplianceTrackedDocType(s.doc_type));

                    trends = {
                        compliance: generateComplianceTrend(submissions, 'week'),
                        forecast: forecastCompliance(generateComplianceTrend(submissions, 'week'), 4)
                    };

                    distributions = {
                        byTeacher: getPerformanceDistribution(teacherData, 'teacher', analyticsData.roster || [], definedWeeks)
                    };

                    heatmap = buildComplianceHeatmap(teacherData, analyticsData.roster || []);
                }

                lastUpdated = new Date();
            }
        } catch (err) {
            console.error('[analytics] Failed to load:', err);
            loadError = "Failed to load analytics data. Please try again.";
        } finally {
            loading = false;
        }
    }

    // Per-teacher, per-week compliance grid — same shape the district/school
    // monitoring heatmaps use, built here from data already fetched for the
    // trend/distribution metrics above rather than a separate query. Weeks
    // come from whatever week numbers the submissions themselves carry (last
    // 8). Rows stay in roster order — this is a pattern-over-time view, not
    // a ranking, so it never sorts teachers by how well they're doing.
    function buildComplianceHeatmap(
        rawSubs: any[],
        roster: { id: string; name: string; loadCount: number }[],
    ) {
        if (roster.length === 0) return { rows: [], weeks: [], cells: [] };

        const weekNums = Array.from(new Set(rawSubs.map((s) => getSubmissionWeek(s))))
            .sort((a, b) => a - b)
            .slice(-8);
        const weeks = weekNums.map((w) => ({ week: w, label: `W${w}` }));

        const cells: any[] = [];
        for (const entity of roster) {
            const entitySubs = rawSubs.filter((s) => s.user_id === entity.id);
            for (const w of weeks) {
                const weekSubs = entitySubs.filter((s) => getSubmissionWeek(s) === w.week);
                if (weekSubs.length === 0 && entity.loadCount === 0) continue;
                const stats = calculateCompliance(weekSubs, entity.loadCount || weekSubs.length);
                cells.push({
                    row: entity.name,
                    week: w.week,
                    weekLabel: w.label,
                    rate: stats.rate,
                    count: weekSubs.length,
                    tooltip: `${entity.name}, ${w.label}: ${stats.rate}% compliant (${weekSubs.length} submitted)`,
                });
            }
        }

        return { rows: roster.map((r) => r.name), weeks, cells };
    }

    function formatRelativeTime(then: Date | null, nowMs: number): string {
        if (!then) return "—";
        const diffSec = Math.max(0, Math.round((nowMs - then.getTime()) / 1000));
        if (diffSec < 10) return "just now";
        if (diffSec < 60) return `${diffSec}s ago`;
        const diffMin = Math.round(diffSec / 60);
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.round(diffMin / 60);
        return `${diffHr}h ago`;
    }

    let tickInterval: ReturnType<typeof setInterval> | null = null;

    onMount(() => {
        loadAnalytics();

        // Keep every chart live: re-run the analysis whenever any submission
        // is created/updated/deleted, instead of only ever showing a stale
        // snapshot from the moment the page was opened.
        realtimeChannel = supabase
            .channel("analytics-submissions")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "submissions" },
                () => {
                    if (!loading) loadAnalytics();
                },
            )
            .subscribe();

        // Keeps the "Updated Xs ago" label current between realtime refreshes.
        tickInterval = setInterval(() => { now = Date.now(); }, 30000);
    });

    onDestroy(() => {
        if (realtimeChannel) supabase.removeChannel(realtimeChannel);
        if (tickInterval) clearInterval(tickInterval);
    });

    const overallStats = $derived.by(() => {
        if (!analyticsData?.complianceTrend) return { compliant: 0, late: 0, missing: 0, rate: 0, total: 0 };
        const stats = calculateCompliance(analyticsData.complianceTrend, expectedTotal);
        return {
            compliant: stats.Compliant,
            late: stats.Late,
            missing: stats.NonCompliant,
            rate: stats.rate,
            total: stats.totalUploaded,
        };
    });

    const updatedLabel = $derived(formatRelativeTime(lastUpdated, now));

    // Submission composition: what those totals are made of. A different
    // question from the KPI row's headline numbers (magnitude vs. makeup),
    // so pairing the two isn't the same fact shown twice.
    const submissionComposition = $derived([
        { label: "Compliant", value: overallStats.compliant, color: "#16a34a" },
        { label: "Late", value: overallStats.late, color: "#d97706" },
        { label: "Missing", value: overallStats.missing, color: "#dc2626" },
    ]);

    // Teachers grouped into fixed compliance bands (same 85%/70% cutoffs the
    // rest of the app already uses), never sorted or named — a proportion
    // view, not a leaderboard. "Needs Support" here is the same threshold
    // and the same count as the KPI card below, computed once.
    const performanceBands = $derived.by(() => {
        const list = distributions?.byTeacher || [];
        const onTrack = list.filter((t: any) => t.compliance_rate >= 85).length;
        const approaching = list.filter((t: any) => t.compliance_rate >= 70 && t.compliance_rate < 85).length;
        const needsSupport = list.filter((t: any) => t.compliance_rate < 70).length;
        const total = list.length || 1;
        return [
            { label: "On Track", count: onTrack, pct: Math.round((onTrack / total) * 100), color: "#16a34a" },
            { label: "Approaching", count: approaching, pct: Math.round((approaching / total) * 100), color: "#d97706" },
            { label: "Needs Support", count: needsSupport, pct: Math.round((needsSupport / total) * 100), color: "#dc2626" },
        ];
    });

    const needsSupportCount = $derived(performanceBands.find((b) => b.label === "Needs Support")?.count || 0);
</script>

<svelte:head>
    <title>Analytics: CEDIMS</title>
</svelte:head>

{#if $profile?.role === 'Teacher' || $profile?.role === 'Master Teacher'}
    <div class="text-center py-12">
        <h2 class="text-2xl font-bold text-text-primary">Analytics Not Available</h2>
        <p class="text-text-secondary mt-2">Available for School Heads and District Supervisors</p>
    </div>
{:else}
    <div class="space-y-8">
        <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
                <h1 class="text-3xl font-bold text-text-primary">Analytics & Insights</h1>
                <p class="text-text-secondary mt-2">Compliance patterns over time — not a leaderboard</p>
            </div>

            {#if !loading && !loadError}
                <div
                    class="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-white px-3 py-2 text-xs font-semibold text-text-secondary"
                    role="status"
                >
                    <span
                        class="h-2 w-2 rounded-full flex-shrink-0 {$onlineStatus ? 'bg-gov-green' : 'bg-text-muted'}"
                        aria-hidden="true"
                    ></span>
                    <span class="text-text-primary">{$onlineStatus ? 'Live' : 'Offline snapshot'}</span>
                    <span class="text-text-muted font-normal">· Updated {updatedLabel}</span>
                </div>
            {/if}
        </div>

        {#if !loading && !$onlineStatus}
            <div
                class="flex items-center gap-2 rounded-lg border border-gov-gold/30 bg-gov-gold/10 px-4 py-3 text-sm font-medium text-gov-gold-dark"
                role="status"
            >
                <WifiOff size={16} strokeWidth={2} class="flex-shrink-0" aria-hidden="true" />
                You're offline. This analysis may be incomplete or out of date.
            </div>
        {/if}

        {#if loading}
            <SkeletonLoader variant="card-grid" count={4} />
        {:else if loadError}
            <div
                class="flex flex-col items-center gap-3 rounded-lg border border-gov-red/30 bg-gov-red/10 px-6 py-10 text-center"
                role="alert"
            >
                <p class="text-sm font-medium text-gov-red">{loadError}</p>
                <button
                    onclick={() => { loading = true; loadAnalytics(); }}
                    class="px-4 py-2 bg-gov-blue text-white text-sm font-bold rounded-xl hover:bg-gov-blue-dark transition-colors"
                >
                    Try Again
                </button>
            </div>
        {:else}
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard label="Overall Compliance" value="{overallStats.rate}%" icon="TrendingUp" color="from-gov-green to-gov-green-dark" />
                <StatCard label="Total Submissions" value={overallStats.total} icon="FileText" color="from-gov-blue to-gov-blue-dark" />
                <StatCard label="Needs Support" value={needsSupportCount} icon="AlertTriangle" color="from-gov-red to-red-700" />
                <StatCard label="Teachers" value={distributions?.byTeacher?.length || 0} icon="Users" color="from-gov-blue to-gov-blue-dark" />
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-1">
                    <LineChart data={trends?.forecast || []} title="Compliance Trend & Forecast" series={['rate']} />
                </div>

                <DonutChart data={submissionComposition} title="Submission Composition" />

                <div class="gov-card-static p-6">
                    <h3 class="text-lg font-bold text-text-primary mb-6">Teachers by Compliance Band</h3>
                    <div class="space-y-4">
                        {#each performanceBands as band}
                            <div>
                                <div class="flex items-center justify-between mb-1.5 text-sm">
                                    <span class="font-semibold text-text-primary">{band.label}</span>
                                    <span class="text-text-secondary">{band.count} · {band.pct}%</span>
                                </div>
                                <div class="w-full h-2 rounded-full bg-surface-muted overflow-hidden">
                                    <div
                                        class="h-full rounded-full transition-[width] duration-300"
                                        style="width: {band.pct}%; background-color: {band.color};"
                                    ></div>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>

            {#if heatmap.rows.length > 0}
                <div class="gov-card-static p-6">
                    <div class="mb-4">
                        <h3 class="text-lg font-bold text-text-primary">Weekly Compliance Heatmap</h3>
                        <p class="text-xs text-text-muted mt-1">
                            Submission pattern across the last {heatmap.weeks.length} weeks
                        </p>
                    </div>
                    <div class="overflow-auto max-h-[70vh] touch-pan-x cedims-scroll">
                        <ComplianceHeatmap rows={heatmap.rows} weeks={heatmap.weeks} cells={heatmap.cells} />
                    </div>
                </div>
            {/if}
        {/if}
    </div>
{/if}
