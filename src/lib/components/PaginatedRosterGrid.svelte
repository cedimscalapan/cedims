<script lang="ts">
    import { ChevronLeft, ChevronRight } from "lucide-svelte";
    import { fly } from "svelte/transition";

    // The teacher roster (monitoring/school) and school roster
    // (monitoring/district) cards are the same shape — name, a rate badge,
    // a Pass/Late/Miss breakdown, a "View Details" button that opens a
    // drill-down — so this one component covers both instead of
    // duplicating the markup, and adds pagination neither had before
    // (both were scroll-only, no way to page through a large roster).
    export interface RosterGridItem {
        key: string;
        name: string;
        subtitle?: string | null;
        rate: number;
        compliant: number;
        late: number;
        missing: number;
    }

    interface Props {
        items: RosterGridItem[];
        onSelect: (key: string) => void;
        rateClass: (rate: number) => string;
        rateBgClass: (rate: number) => string;
        buttonLabel?: string;
        pageSize?: number;
    }

    let {
        items,
        onSelect,
        rateClass,
        rateBgClass,
        buttonLabel = "View Details",
        pageSize = 9,
    }: Props = $props();

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

<div class="flex flex-col gap-6">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {#each pageItems as item (item.key)}
            <button
                type="button"
                class="bg-surface-white border border-border-subtle rounded-xl p-6 shadow-sm hover:shadow-md hover:border-gov-blue/20 transition-colors flex flex-col group cursor-pointer text-left w-full min-w-0"
                onclick={() => onSelect(item.key)}
                in:fly={{ y: 20, duration: 400 }}
            >
                <div class="flex justify-between items-start gap-3 mb-4">
                    <div class="min-w-0">
                        <h4
                            class="font-bold text-base text-text-primary group-hover:text-gov-blue transition-colors leading-tight break-words"
                        >
                            {item.name}
                        </h4>
                        {#if item.subtitle}
                            <p
                                class="text-[10px] text-text-muted font-bold uppercase tracking-tight mt-1 break-words"
                            >
                                {item.subtitle}
                            </p>
                        {/if}
                    </div>
                    <span
                        class="px-2.5 py-1 rounded-full text-[10px] font-bold {rateBgClass(
                            item.rate,
                        )} {rateClass(item.rate)} uppercase tracking-wide flex-shrink-0"
                    >
                        {item.rate}%
                    </span>
                </div>

                <div class="grid grid-cols-3 gap-2 mb-6">
                    <div class="bg-gov-green/5 p-2 rounded text-center">
                        <p class="text-[9px] font-bold text-gov-green uppercase leading-none mb-1">
                            Pass
                        </p>
                        <p class="text-xs font-bold text-text-primary">{item.compliant}</p>
                    </div>
                    <div class="bg-gov-gold/5 p-2 rounded text-center">
                        <p class="text-[9px] font-bold text-gov-gold-dark uppercase leading-none mb-1">
                            Late
                        </p>
                        <p class="text-xs font-bold text-text-primary">{item.late}</p>
                    </div>
                    <div class="bg-gov-red/5 p-2 rounded text-center">
                        <p class="text-[9px] font-bold text-gov-red uppercase leading-none mb-1">
                            Miss
                        </p>
                        <p class="text-xs font-bold text-text-primary">{item.missing}</p>
                    </div>
                </div>

                <div class="mt-auto pt-4 border-t border-gray-50">
                    <div
                        class="w-full py-2 bg-gov-blue/5 text-gov-blue group-hover:bg-gov-blue group-hover:text-white rounded-lg transition-colors font-bold text-[10px] uppercase tracking-widest border border-gov-blue/10 flex items-center justify-center"
                    >
                        {buttonLabel}
                    </div>
                </div>
            </button>
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
                Page {page} of {totalPages} · {items.length} total
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
