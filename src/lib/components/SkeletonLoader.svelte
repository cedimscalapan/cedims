<script lang="ts">
    interface Props {
        variant?: "card-grid" | "list" | "table-row" | "text";
        count?: number;
    }

    let { variant = "card-grid", count = 8 }: Props = $props();
    const items = $derived(Array.from({ length: count }));
</script>

{#if variant === "card-grid"}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" aria-hidden="true">
        {#each items as _}
            <div class="gov-card p-0 overflow-hidden h-[220px] animate-pulse">
                <div class="p-5 flex flex-col items-center">
                    <div class="w-14 h-14 rounded-md bg-surface-muted mb-4"></div>
                    <div class="h-3.5 w-3/4 rounded bg-surface-muted mb-2"></div>
                    <div class="h-3 w-1/2 rounded bg-surface-muted"></div>
                </div>
                <div class="px-4 py-3 bg-surface-muted/60 border-t border-border-subtle flex justify-between">
                    <div class="h-2.5 w-16 rounded bg-surface-muted"></div>
                    <div class="h-2.5 w-10 rounded bg-surface-muted"></div>
                </div>
            </div>
        {/each}
    </div>
{:else if variant === "list"}
    <div class="space-y-3" aria-hidden="true">
        {#each items as _}
            <div class="flex items-center gap-3 p-4 rounded-xl bg-surface-white border border-border-subtle animate-pulse">
                <div class="w-10 h-10 rounded-lg bg-surface-muted flex-shrink-0"></div>
                <div class="flex-1 space-y-2">
                    <div class="h-3 w-2/3 rounded bg-surface-muted"></div>
                    <div class="h-2.5 w-1/3 rounded bg-surface-muted"></div>
                </div>
            </div>
        {/each}
    </div>
{:else if variant === "table-row"}
    <div class="space-y-2" aria-hidden="true">
        {#each items as _}
            <div class="h-10 rounded-lg bg-surface-muted animate-pulse"></div>
        {/each}
    </div>
{:else}
    <div class="space-y-2" aria-hidden="true">
        {#each items as _}
            <div class="h-3 rounded bg-surface-muted animate-pulse" style="width: {60 + Math.random() * 35}%"></div>
        {/each}
    </div>
{/if}
