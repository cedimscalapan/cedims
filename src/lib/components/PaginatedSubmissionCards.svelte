<script lang="ts">
    import StatusBadge from "./StatusBadge.svelte";
    import { getDocumentLabel } from "$lib/utils/documentLabels";

    // Deliberately narrow and caller-normalized (no teaching_loads join
    // shape, etc.) so this stays reusable across different Submission
    // interfaces (monitoring/school and monitoring/district each have a
    // slightly different one) — the caller maps its rows to this shape once.
    export interface SubmissionCardItem {
        key: string;
        fileName: string;
        docType?: string | null;
        weekNumber?: number | null;
        complianceStatus?: string | null;
        createdAt: string;
        subtitle?: string | null;
    }

    interface Props {
        items: SubmissionCardItem[];
        formatDate: (d: string) => string;
        pageSize?: number;
        emptyMessage?: string;
    }

    let { items, formatDate, pageSize = 6, emptyMessage = "No submissions found" }: Props = $props();

    let page = $state(1);

    // A newly-selected teacher/school hands this component a whole new
    // `items` array — always land back on page 1 rather than carrying over
    // whatever page the previous selection happened to be on.
    $effect(() => {
        items;
        page = 1;
    });

    const totalPages = $derived(Math.max(1, Math.ceil(items.length / pageSize)));
    const pageItems = $derived.by(() => {
        const start = (page - 1) * pageSize;
        return items.slice(start, start + pageSize);
    });

    function normalizeStatus(status: string | null | undefined): string {
        if (!status || status === "compliant" || status === "on-time") return "compliant";
        if (status === "non-compliant" || status === "non compliant") return "missing";
        return status;
    }
</script>

{#if items.length === 0}
    <p class="text-center text-text-muted py-6 text-sm">{emptyMessage}</p>
{:else}
    <div class="flex flex-col gap-4">
        <!-- A fixed-height scroll box remains as a defensive fallback for an
             unusually tall page (e.g. a narrow phone with long wrapped file
             names) — pagination below is the primary way through a large
             list, this just guarantees the modal itself never grows past a
             sane height. -->
        <div class="max-h-[52vh] overflow-y-auto pr-1 cedims-scroll">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {#each pageItems as item (item.key)}
                    <div
                        class="bg-surface-white border border-border-subtle rounded-xl p-4 flex flex-col gap-2.5 min-w-0"
                    >
                        <p
                            class="text-sm font-semibold text-text-primary leading-snug break-words"
                        >
                            {item.fileName}
                        </p>

                        {#if item.docType || item.weekNumber != null}
                            <div class="flex flex-wrap items-center gap-1.5">
                                {#if item.docType}
                                    <span
                                        class="px-2 py-0.5 bg-gov-blue/5 text-gov-blue text-xs font-bold rounded uppercase tracking-wider whitespace-nowrap"
                                    >
                                        {getDocumentLabel(item.docType)}
                                    </span>
                                {/if}
                                {#if item.weekNumber != null}
                                    <span
                                        class="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 text-xs font-bold rounded uppercase tracking-wider whitespace-nowrap"
                                    >
                                        Week {item.weekNumber}
                                    </span>
                                {/if}
                            </div>
                        {/if}

                        {#if item.subtitle}
                            <p class="text-xs text-text-muted break-words">{item.subtitle}</p>
                        {/if}

                        <div class="mt-auto pt-2.5 border-t border-border-subtle flex items-center justify-between gap-2 flex-wrap">
                            <StatusBadge status={normalizeStatus(item.complianceStatus)} size="sm" />
                            <span
                                class="text-xs font-bold text-text-muted uppercase tracking-tight whitespace-nowrap"
                            >
                                {formatDate(item.createdAt)}
                            </span>
                        </div>
                    </div>
                {/each}
            </div>
        </div>

        {#if totalPages > 1}
            <div class="cedims-pagination-shell mt-1 flex-shrink-0 rounded-xl border border-border-subtle bg-surface-white px-4 py-3 shadow-sm">
                <p class="text-sm text-text-muted">
                    Showing {(page - 1) * pageSize + 1}&ndash;{Math.min(page * pageSize, items.length)} of {items.length} submissions
                </p>
                <div class="cedims-pagination">
                <button
                    type="button"
                    onclick={() => (page = Math.max(1, page - 1))}
                    disabled={page === 1}
                    class="cedims-page-button"
                >
                    Previous
                </button>
                <span class="cedims-page-indicator">{page} / {totalPages}</span>
                <button
                    type="button"
                    onclick={() => (page = Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    class="cedims-page-button is-next"
                >
                    Next
                </button>
                </div>
            </div>
        {/if}
    </div>
{/if}
