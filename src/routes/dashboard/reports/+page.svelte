<script lang="ts">
    import { profile } from "$lib/utils/auth";
    import { supabase } from "$lib/utils/supabase";
    import StatCard from "$lib/components/StatCard.svelte";
    import StatusBadge from "$lib/components/StatusBadge.svelte";
    import EmptyState from "$lib/components/EmptyState.svelte";
    import { addToast } from "$lib/stores/toast";
    import { getCurrentSchoolYear } from "$lib/utils/schoolYear";
    import { onMount, onDestroy } from "svelte";
    import { fade } from "svelte/transition";
    import { goto } from "$app/navigation";
    import {
        FileBarChart,
        Printer,
        Download,
        ChevronLeft,
        ChevronRight,
    } from "lucide-svelte";

    interface ReportRow {
        teacher_name: string;
        school_name: string | null;
        district_name: string | null;
        doc_type: string;
        week_number: number | null;
        school_year: string;
        compliance_status: string;
        submitted_at: string;
    }

    const isDistrict = $derived($profile?.role === "District Supervisor");

    let loading = $state(true);
    let rows = $state<ReportRow[]>([]);
    let scopeName = $state("");
    let selectedYear = $state(getCurrentSchoolYear());
    let page = $state(1);
    const pageSize = 20;

    // Reports are scoped to School Head / District Supervisor only — same
    // authorization pattern as the Admin panel.
    $effect(() => {
        if (
            $profile &&
            $profile.role !== "School Head" &&
            $profile.role !== "District Supervisor"
        ) {
            addToast("error", "You don't have access to Reports.");
            goto("/dashboard");
        }
    });

    // Current school year plus the previous two — as far back as a
    // supervisor would realistically need to look. Every entry is a valid
    // p_school_year value whether or not it has submissions yet, so this
    // needs no network round trip of its own.
    const availableYears = $derived.by(() => {
        const [startYear] = getCurrentSchoolYear().split("-").map(Number);
        return [0, 1, 2].map((back) => {
            const y = startYear - back;
            return `${y}-${y + 1}`;
        });
    });

    async function loadScopeName() {
        if (!$profile) return;
        try {
            if (isDistrict) {
                if (!$profile.district_id) {
                    scopeName = "All Districts";
                    return;
                }
                const { data } = await supabase
                    .from("districts")
                    .select("name")
                    .eq("id", $profile.district_id)
                    .single();
                scopeName = data?.name || "District";
            } else if ($profile.school_id) {
                const { data } = await supabase
                    .from("schools")
                    .select("name")
                    .eq("id", $profile.school_id)
                    .single();
                scopeName = data?.name || "School";
            }
        } catch (err) {
            console.warn("[reports] Could not load scope name:", err);
        }
    }

    async function loadReport() {
        loading = true;
        page = 1;
        try {
            const { data, error } = await supabase.rpc(
                "get_compliance_report_rows",
                { p_school_year: selectedYear },
            );
            if (error) throw error;
            rows = (data || []) as ReportRow[];
        } catch (err: any) {
            console.error("[reports] Failed to load compliance report:", err);
            addToast("error", "Could not load the report. Please try again.");
            rows = [];
        } finally {
            loading = false;
        }
    }

    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    onMount(() => {
        loadScopeName();
        loadReport();

        // Same live-update pattern as School/District Monitoring: the
        // report reloads on any submissions change instead of only
        // reflecting whatever existed at the moment the page was opened.
        realtimeChannel = supabase
            .channel("compliance-report-changes")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "submissions" },
                () => {
                    if (!loading) loadReport();
                },
            )
            .subscribe();
    });

    onDestroy(() => {
        if (realtimeChannel) {
            supabase.removeChannel(realtimeChannel);
        }
    });

    const summary = $derived.by(() => {
        const total = rows.length;
        const compliant = rows.filter(
            (r) => r.compliance_status === "compliant" || r.compliance_status === "on-time",
        ).length;
        const late = rows.filter((r) => r.compliance_status === "late").length;
        const supplementary = rows.filter(
            (r) => r.compliance_status === "supplementary",
        ).length;
        const rate = total > 0 ? Math.round(((compliant + late) / total) * 100) : 0;
        return { total, compliant, late, supplementary, rate };
    });

    const totalPages = $derived(Math.max(1, Math.ceil(rows.length / pageSize)));
    const pageRows = $derived.by(() => {
        const start = (page - 1) * pageSize;
        return rows.slice(start, start + pageSize);
    });

    function formatDateTime(d: string): string {
        return new Date(d).toLocaleString("en-PH", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    // Client-side only — no Apps Script, no server round trip. The report
    // is already fully loaded in `rows`, so both export paths just format
    // what's already in memory.
    function exportCsv() {
        const headers = [
            "Teacher",
            "School",
            "District",
            "Doc Type",
            "Week",
            "School Year",
            "Status",
            "Submitted",
        ];
        const csvRows = rows.map((r) => [
            r.teacher_name,
            r.school_name ?? "",
            r.district_name ?? "",
            r.doc_type,
            r.week_number ?? "",
            r.school_year,
            r.compliance_status,
            r.submitted_at,
        ]);
        const escape = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
        const csv = [headers, ...csvRows]
            .map((row) => row.map(escape).join(","))
            .join("\r\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `compliance-report-${scopeName.replace(/\s+/g, "_") || "report"}-${selectedYear}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
</script>

<svelte:head>
    <title>Compliance Reports — CEDIMS</title>
</svelte:head>

<div class="space-y-8">
    <!-- Letterhead-style report header -->
    <div
        class="gov-card-static p-6 sm:p-8 border-t-4 border-t-gov-blue"
        in:fade={{ duration: 300 }}
    >
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
            <div class="min-w-0">
                <p
                    class="text-[11px] font-bold text-gov-blue uppercase tracking-[0.2em] mb-1"
                >
                    {isDistrict ? "District Compliance Report" : "School Compliance Report"}
                </p>
                <h1
                    class="text-2xl sm:text-3xl font-black text-text-primary leading-tight break-words"
                >
                    {scopeName || "—"}
                </h1>
                <p class="text-xs text-text-muted mt-2">
                    School Year {selectedYear} · Generated {formatDateTime(
                        new Date().toISOString(),
                    )}
                </p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
                <label class="sr-only" for="report-year">School year</label>
                <select
                    id="report-year"
                    bind:value={selectedYear}
                    onchange={loadReport}
                    class="px-3 py-2.5 rounded-xl border border-border-subtle bg-surface-white text-sm font-semibold text-text-primary"
                >
                    {#each availableYears as y (y)}
                        <option value={y}>{y}</option>
                    {/each}
                </select>
                <button
                    type="button"
                    onclick={exportCsv}
                    disabled={rows.length === 0}
                    class="p-2.5 rounded-xl border border-border-subtle text-text-muted hover:text-gov-blue hover:border-gov-blue/30 disabled:opacity-40 disabled:hover:text-text-muted disabled:hover:border-border-subtle transition-colors"
                    title="Export CSV"
                    aria-label="Export CSV"
                >
                    <Download size={16} />
                </button>
                <button
                    type="button"
                    onclick={() => window.print()}
                    disabled={rows.length === 0}
                    class="p-2.5 rounded-xl border border-border-subtle text-text-muted hover:text-gov-blue hover:border-gov-blue/30 disabled:opacity-40 disabled:hover:text-text-muted disabled:hover:border-border-subtle transition-colors"
                    title="Print"
                    aria-label="Print"
                >
                    <Printer size={16} />
                </button>
            </div>
        </div>
    </div>

    {#if loading}
        <div class="gov-card-static p-16 text-center">
            <p class="text-xs font-bold text-text-muted uppercase tracking-widest">
                Loading report…
            </p>
        </div>
    {:else if rows.length === 0}
        <EmptyState
            icon={FileBarChart}
            title="No submissions yet"
            description="Nothing has been archived for {selectedYear} in this scope."
        />
    {:else}
        <!-- Summary -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Submissions" value={summary.total} icon="FileText" />
            <StatCard
                label="Compliant"
                value={summary.compliant}
                icon="CheckCircle2"
                color="from-gov-green to-gov-green"
            />
            <StatCard
                label="Late"
                value={summary.late}
                icon="Clock"
                color="from-gov-gold to-gov-gold"
            />
            <StatCard label="On-Time Rate" value={`${summary.rate}%`} icon="TrendingUp" />
        </div>

        <!-- Data table -->
        <div class="gov-card-static overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="bg-surface-muted/60 border-b border-border-subtle">
                            <th
                                class="text-left px-4 py-3 text-[11px] font-bold text-text-muted uppercase tracking-wider"
                                >Teacher</th
                            >
                            <th
                                class="text-left px-4 py-3 text-[11px] font-bold text-text-muted uppercase tracking-wider"
                                >School</th
                            >
                            {#if isDistrict}
                                <th
                                    class="text-left px-4 py-3 text-[11px] font-bold text-text-muted uppercase tracking-wider"
                                    >District</th
                                >
                            {/if}
                            <th
                                class="text-left px-4 py-3 text-[11px] font-bold text-text-muted uppercase tracking-wider"
                                >Doc Type</th
                            >
                            <th
                                class="text-left px-4 py-3 text-[11px] font-bold text-text-muted uppercase tracking-wider"
                                >Week</th
                            >
                            <th
                                class="text-left px-4 py-3 text-[11px] font-bold text-text-muted uppercase tracking-wider"
                                >Status</th
                            >
                            <th
                                class="text-left px-4 py-3 text-[11px] font-bold text-text-muted uppercase tracking-wider"
                                >Submitted</th
                            >
                        </tr>
                    </thead>
                    <tbody>
                        {#each pageRows as row, i (row.teacher_name + row.submitted_at + i)}
                            <tr
                                class="border-b border-border-subtle last:border-0 {i % 2 === 1
                                    ? 'bg-surface-muted/20'
                                    : ''}"
                            >
                                <td
                                    class="px-4 py-3 font-semibold text-text-primary break-words max-w-[220px] align-top"
                                >
                                    {row.teacher_name}
                                </td>
                                <td
                                    class="px-4 py-3 text-text-secondary break-words max-w-[200px] align-top"
                                >
                                    {row.school_name || "—"}
                                </td>
                                {#if isDistrict}
                                    <td
                                        class="px-4 py-3 text-text-secondary break-words max-w-[160px] align-top"
                                    >
                                        {row.district_name || "—"}
                                    </td>
                                {/if}
                                <td class="px-4 py-3 text-text-secondary whitespace-nowrap align-top">
                                    {row.doc_type}
                                </td>
                                <td class="px-4 py-3 text-text-secondary whitespace-nowrap align-top">
                                    {row.week_number ?? "—"}
                                </td>
                                <td class="px-4 py-3 align-top">
                                    <StatusBadge status={row.compliance_status} size="sm" />
                                </td>
                                <td
                                    class="px-4 py-3 text-text-muted whitespace-nowrap text-xs align-top"
                                >
                                    {formatDateTime(row.submitted_at)}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            {#if totalPages > 1}
                <div
                    class="flex items-center justify-between px-4 py-3 border-t border-border-subtle flex-wrap gap-2"
                >
                    <button
                        type="button"
                        onclick={() => (page = Math.max(1, page - 1))}
                        disabled={page === 1}
                        class="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-gov-blue disabled:text-text-muted disabled:opacity-40 hover:bg-gov-blue/5 disabled:hover:bg-transparent transition-colors"
                    >
                        <ChevronLeft size={14} /> Previous
                    </button>
                    <span class="text-xs font-bold text-text-muted uppercase tracking-widest">
                        Page {page} of {totalPages} · {rows.length} rows
                    </span>
                    <button
                        type="button"
                        onclick={() => (page = Math.min(totalPages, page + 1))}
                        disabled={page === totalPages}
                        class="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-gov-blue disabled:text-text-muted disabled:opacity-40 hover:bg-gov-blue/5 disabled:hover:bg-transparent transition-colors"
                    >
                        Next <ChevronRight size={14} />
                    </button>
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    @media print {
        :global(header),
        :global(nav) {
            display: none !important;
        }
    }
</style>
