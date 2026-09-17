<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import { fly, fade } from "svelte/transition";
    import type {
        ClusterResult,
        ClusterSummary,
    } from "$lib/utils/clusterAnalytics";

    interface Props {
        results: ClusterResult[];
        summaries: ClusterSummary[];
    }

    let { results, summaries }: Props = $props();

    let scatterCanvas = $state<HTMLCanvasElement>();
    let radarCanvas = $state<HTMLCanvasElement>();
    let ChartClass: any = null;
    let scatterChart: any = null;
    let radarChart: any = null;
    let activeTab = $state<"scatter" | "radar">("scatter");
    let selectedClusterId = $state<number | null>(null);
    let showDrillDown = $state(false);

    const selectedCluster = $derived(
        selectedClusterId !== null
            ? summaries.find((s) => s.clusterId === selectedClusterId)
            : null,
    );
    const membersInCluster = $derived(
        selectedClusterId !== null
            ? results.filter((r) => r.clusterId === selectedClusterId)
            : [],
    );

    onMount(async () => {
        const { Chart, registerables } = await import("chart.js");
        Chart.register(...registerables);
        ChartClass = Chart;
        await tick();
        renderCharts();
    });

    onDestroy(() => {
        if (scatterChart) scatterChart.destroy();
        if (radarChart) radarChart.destroy();
    });

    $effect(() => {
        if (ChartClass && results.length > 0) {
            tick().then(() => renderCharts());
        }
    });

    function renderCharts() {
        if (!ChartClass) return;
        renderScatter();
        renderRadar();
    }

    function renderScatter() {
        if (!scatterCanvas || !ChartClass) return;
        if (scatterChart) scatterChart.destroy();

        const snappedResults = $state.snapshot(results);

        // Group data by cluster
        const clusterGroups = new Map<
            number,
            {
                data: { x: number; y: number; label: string }[];
                color: string;
                label: string;
            }
        >();
        for (const r of snappedResults) {
            if (!clusterGroups.has(r.clusterId)) {
                clusterGroups.set(r.clusterId, {
                    data: [],
                    color: r.clusterColor,
                    label: r.clusterLabel,
                });
            }
            clusterGroups.get(r.clusterId)!.data.push({
                x: r.teacher.punctuality,
                y: r.teacher.consistency,
                label: r.teacher.teacherName,
            });
        }

        const datasets = Array.from(clusterGroups.entries()).map(
            ([, group]) => ({
                label: group.label,
                data: group.data,
                backgroundColor: group.color + "99",
                borderColor: group.color,
                borderWidth: 2,
                pointRadius: 7,
                pointHoverRadius: 10,
                pointStyle: "circle" as const,
            }),
        );

        scatterChart = new ChartClass(scatterCanvas, {
            type: "scatter",
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 800, easing: "easeOutQuart" as const },
                plugins: {
                    legend: {
                        display: true,
                        position: "top" as const,
                        labels: {
                            usePointStyle: true,
                            padding: 16,
                            font: { weight: "bold" as const, size: 11 },
                        },
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx: any) => {
                                const point = ctx.raw;
                                return `${point.label}: Punctuality ${point.x}%, Consistency ${point.y}%`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: "Punctuality Score (%)",
                            font: { weight: "bold" as const, size: 11 },
                        },
                        min: 0,
                        max: 100,
                        grid: { color: "rgba(0,0,0,0.04)" },
                    },
                    y: {
                        title: {
                            display: true,
                            text: "Consistency Score (%)",
                            font: { weight: "bold" as const, size: 11 },
                        },
                        min: 0,
                        max: 100,
                        grid: { color: "rgba(0,0,0,0.04)" },
                    },
                },
            },
        });
    }

    function renderRadar() {
        if (!radarCanvas || !ChartClass) return;
        if (radarChart) radarChart.destroy();

        const snappedSummaries = $state.snapshot(summaries);

        const datasets = snappedSummaries.map((s) => ({
            label: `${s.label} (${s.count})`,
            data: [
                s.avgPunctuality,
                s.avgConsistency,
                s.avgCompleteness,
                s.avgVolume,
            ],
            backgroundColor: s.color + "20",
            borderColor: s.color,
            borderWidth: 2.5,
            pointBackgroundColor: s.color,
            pointRadius: 4,
            pointHoverRadius: 6,
        }));

        radarChart = new ChartClass(radarCanvas, {
            type: "radar",
            data: {
                labels: [
                    "Punctuality",
                    "Consistency",
                    "Completeness",
                    "Volume",
                ],
                datasets,
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 800, easing: "easeOutQuart" as const },
                plugins: {
                    legend: {
                        display: true,
                        position: "top" as const,
                        labels: {
                            usePointStyle: true,
                            padding: 16,
                            font: { weight: "bold" as const, size: 11 },
                        },
                    },
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            stepSize: 25,
                            font: { size: 10 },
                            backdropColor: "transparent",
                        },
                        grid: { color: "rgba(0,0,0,0.06)" },
                        pointLabels: {
                            font: { weight: "bold" as const, size: 12 },
                        },
                    },
                },
            },
        });
    }
</script>

<div class="space-y-6" in:fade={{ duration: 400 }}>
    <!-- Header with tab toggle -->
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
            <div
                class="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 text-indigo-600"
            >
                <svg
                    class="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                >
                    <circle cx="12" cy="12" r="3" />
                    <circle cx="6" cy="6" r="2" />
                    <circle cx="18" cy="8" r="2" />
                    <circle cx="8" cy="18" r="2" />
                    <circle cx="17" cy="17" r="2" />
                </svg>
            </div>
            <div>
                <h3
                    class="text-sm font-semibold text-text-primary uppercase tracking-wide"
                >
                    Behavioral Clusters
                </h3>
                <p class="text-[10px] text-text-muted font-medium">
                    K-Means unsupervised grouping
                </p>
            </div>
        </div>
        <div
            class="flex p-1 bg-surface-muted border border-border-subtle rounded-xl"
        >
            <button
                onclick={() => (activeTab = "scatter")}
                class="px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wide transition-colors {activeTab ===
                'scatter'
                    ? 'bg-surface-white text-gov-blue shadow-sm'
                    : 'text-text-muted hover:text-text-primary'}"
            >
                Scatter
            </button>
            <button
                onclick={() => (activeTab = "radar")}
                class="px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wide transition-colors {activeTab ===
                'radar'
                    ? 'bg-surface-white text-gov-blue shadow-sm'
                    : 'text-text-muted hover:text-text-primary'}"
            >
                Radar
            </button>
        </div>
    </div>

    <!-- Cluster Summary Pills -->
    <div class="flex flex-wrap gap-2">
        {#each summaries as summary (summary.clusterId)}
            <div
                class="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold"
                style="border-color: {summary.color}30; background: {summary.color}08; color: {summary.color}"
                in:fly={{ x: -10, duration: 300 }}
            >
                <span
                    class="w-2 h-2 rounded-full"
                    style="background: {summary.color}"
                ></span>
                {summary.label}
                <span class="opacity-60">({summary.count})</span>
            </div>
        {/each}
    </div>

    <!-- Charts -->
    <div class="relative h-72 transition-opacity duration-300">
        <div
            class="absolute inset-0 {activeTab === 'scatter'
                ? 'opacity-100 pointer-events-auto'
                : 'opacity-0 pointer-events-none'} transition-opacity duration-300"
        >
            <canvas bind:this={scatterCanvas}></canvas>
        </div>
        <div
            class="absolute inset-0 {activeTab === 'radar'
                ? 'opacity-100 pointer-events-auto'
                : 'opacity-0 pointer-events-none'} transition-opacity duration-300"
        >
            <canvas bind:this={radarCanvas}></canvas>
        </div>
    </div>

    <!-- Cluster Detail Table -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {#each summaries as summary (summary.clusterId)}
            <button
                class="p-4 rounded-md border transition-colors hover:shadow-md text-left cursor-pointer group/card"
                style="border-color: {summary.color}20; background: {summary.color}05"
                onclick={() => {
                    selectedClusterId = summary.clusterId;
                    showDrillDown = true;
                }}
                in:fly={{
                    y: 15,
                    duration: 400,
                    delay: summary.clusterId * 100,
                }}
            >
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                        <div
                            class="w-3 h-3 rounded-full shadow-sm"
                            style="background: {summary.color}"
                        ></div>
                        <span
                            class="text-[10px] font-semibold uppercase tracking-wide text-text-primary"
                            >{summary.label}</span
                        >
                    </div>
                    <span
                        class="text-text-muted opacity-0 group-hover/card:opacity-100 transition-opacity text-[10px]"
                    >
                        Review â†’
                    </span>
                </div>
                <p
                    class="text-2xl font-semibold tracking-normal"
                    style="color: {summary.color}"
                >
                    {summary.count}
                </p>
                <p
                    class="text-[9px] text-text-muted font-bold uppercase tracking-wider mt-1"
                >
                    Teachers
                </p>
                <div class="mt-3 space-y-1">
                    <div class="flex justify-between text-[9px]">
                        <span class="text-text-muted font-bold"
                            >Punctuality</span
                        >
                        <span class="font-semibold text-text-primary"
                            >{summary.avgPunctuality}%</span
                        >
                    </div>
                    <div class="flex justify-between text-[9px]">
                        <span class="text-text-muted font-bold"
                            >Consistency</span
                        >
                        <span class="font-semibold text-text-primary"
                            >{summary.avgConsistency}%</span
                        >
                    </div>
                    <div class="flex justify-between text-[9px]">
                        <span class="text-text-muted font-bold"
                            >Completeness</span
                        >
                        <span class="font-semibold text-text-primary"
                            >{summary.avgCompleteness}%</span
                        >
                    </div>
                </div>
            </button>
        {/each}
    </div>
</div>

<!-- Teacher Drill-down Modal -->
{#if showDrillDown && selectedCluster}
    <div
        class="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        transition:fade
    >
        <div
            class="bg-surface-white rounded-3xl shadow-sm w-full max-w-2xl overflow-hidden"
            in:fly={{ y: 40, duration: 500 }}
        >
            <div
                class="p-6 border-b border-border-subtle flex items-center justify-between"
                style="background: {selectedCluster.color}05"
            >
                <div class="flex items-center gap-3">
                    <div
                        class="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg"
                        style="background: {selectedCluster.color}"
                    >
                        <svg
                            class="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                            />
                        </svg>
                    </div>
                    <div>
                        <h3
                            class="text-lg font-semibold text-text-primary tracking-tight"
                        >
                            {selectedCluster.label} Group
                        </h3>
                        <p class="text-xs text-text-muted font-medium">
                            {membersInCluster.length} teachers segmentated by behavior
                        </p>
                    </div>
                </div>
                <button
                    onclick={() => (showDrillDown = false)}
                    class="p-2 hover:bg-black/5 rounded-full transition-colors"
                    aria-label="Close drill down view"
                >
                    <svg
                        class="w-6 h-6 text-text-muted"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            </div>

            <div class="max-h-[60vh] overflow-y-auto p-4">
                <div class="space-y-3">
                    {#each membersInCluster as member}
                        <div
                            class="p-4 rounded-md bg-surface-muted border border-border-subtle flex items-center justify-between group hover:bg-surface-white hover:shadow-md transition-colors"
                        >
                            <div>
                                <p class="text-sm font-bold text-text-primary">
                                    {member.teacher.teacherName}
                                </p>
                                <p
                                    class="text-[10px] text-text-muted font-medium uppercase tracking-wider"
                                >
                                    {member.teacher.schoolName}
                                </p>
                            </div>
                            <div class="flex items-center gap-6">
                                <div class="text-right">
                                    <p
                                        class="text-xs font-semibold text-text-primary"
                                    >
                                        {member.teacher.punctuality}%
                                    </p>
                                    <p
                                        class="text-[9px] text-text-muted font-bold uppercase tracking-normal"
                                    >
                                        Punctuality
                                    </p>
                                </div>
                                <div class="text-right">
                                    <p
                                        class="text-xs font-semibold text-text-primary"
                                    >
                                        {member.teacher.completeness}%
                                    </p>
                                    <p
                                        class="text-[9px] text-text-muted font-bold uppercase tracking-normal"
                                    >
                                        Completeness
                                    </p>
                                </div>
                                <button
                                    class="p-2 bg-gov-blue/10 text-gov-blue rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <svg
                                        class="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M9 5l7 7-7 7"
                                        />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>

            <div
                class="p-6 bg-surface-muted border-t border-border-subtle flex justify-end"
            >
                <button
                    onclick={() => (showDrillDown = false)}
                    class="px-6 py-2.5 bg-surface-white border border-border-strong rounded-xl text-xs font-bold text-text-primary hover:border-gov-blue transition-colors"
                >
                    Close Analysis
                </button>
            </div>
        </div>
    </div>
{/if}
