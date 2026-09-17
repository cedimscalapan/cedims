<script lang="ts">
    import { ChevronLeft, ChevronRight } from "lucide-svelte";

    // Shared by any "one row per teacher/school, missing+late+expected+rate"
    // list — Needs Attention (School Head) and School Standings (District
    // Supervisor) are the same shape, so this replaces both of their plain
    // divide-y lists.
    export interface RosterCardItem {
        key: string;
        name: string;
        missing: number;
        late: number;
        expected: number;
        rate: number;
    }

    interface Props {
        items: RosterCardItem[];
        rateClass: (rate: number) => string;
        pageSize?: number;
        emptyMessage?: string;
    }

    let { items, rateClass, pageSize = 8, emptyMessage = "No records yet" }: Props = $props();

    let page = $state(1);

    $effect(() => {
        items;
        page = 1;
    });

    const totalPages = $derived(Math.max(1, Math.ceil(items.length / pageSize)));
    const pageItems = $derived.by(() => {
        const start = (page - 1) * pageSize;
        return items.slice(start, start + pageSize);
    });
</script>

{#if items.length === 0}
    <div class="gov-card-static p-8 text-center rounded-2xl">
        <p class="text-text-muted font-bold text-xs uppercase tracking-widest">{emptyMessage}</p>
    </div>
{:else}
    <div class="flex flex-col gap-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {#each pageItems as item (item.key)}
                <div
                    class="gov-card-static rounded-xl p-4 flex flex-col gap-2 min-w-0"
                >
                    <div class="flex items-start justify-between gap-3">
                        <p class="text-sm font-semibold text-text-primary break-words min-w-0 leading-snug">
                            {item.name}
                        </p>
                        <span class="text-sm font-bold shrink-0 {rateClass(item.rate)}">
                            {item.rate}%
                        </span>
                    </div>
                    <p class="text-[11px] text-text-muted break-words">
                        {item.missing} missing · {item.late} late · {item.expected} expected
                    </p>
                </div>
            {/each}
        </div>

        {#if totalPages > 1}
            <div class="flex items-center justify-between pt-1 border-t border-border-subtle">
                <button
                    type="button"
                    onclick={() => (page = Math.max(1, page - 1))}
                    disabled={page === 1}
                    class="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-gov-blue disabled:text-text-muted disabled:opacity-40 hover:bg-gov-blue/5 disabled:hover:bg-transparent transition-colors"
                >
                    <ChevronLeft size={14} /> Previous
                </button>
                <span class="text-xs font-bold text-text-muted uppercase tracking-widest">
                    Page {page} of {totalPages}
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
