<script lang="ts">
    /**
     * Horizontal Bar Chart Component
     * Used for comparing values across categories (schools, teachers, etc.)
     */

    interface BarData {
        label: string;
        value: number;
        color?: string;
        secondaryValue?: number;
    }

    interface Props {
        data: BarData[];
        title: string;
        maxValue?: number;
        showValue?: boolean;
        height?: number;
        barHeight?: number;
    }

    let {
        data = [],
        title = 'Comparison',
        maxValue,
        showValue = true,
        height = 400,
        barHeight = 30
    } = $props<Props>();

    const defaultColors = [
        '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
        '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1'
    ];

    const max = $derived(maxValue || Math.max(...data.map(d => d.value), 100));

    const processedData = $derived(data.map((d, i) => ({
        ...d,
        color: d.color || defaultColors[i % defaultColors.length],
        percentage: (d.value / max) * 100
    })));
</script>

<div class="gov-card-static p-6">
    <h3 class="text-lg font-bold text-text-primary mb-6">{title}</h3>

    {#if data.length === 0}
        <div class="text-center py-8">
            <p class="text-text-muted">No data available</p>
        </div>
    {:else}
        <div class="space-y-3" style="height: {height}px; overflow-y-auto;">
            {#each processedData as item (item.label)}
                <div>
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-semibold text-text-secondary truncate">{item.label}</span>
                        {#if showValue}
                            <span class="text-xs font-bold text-text-primary ml-2 flex-shrink-0">
                                {item.value}{item.secondaryValue ? ` / ${item.secondaryValue}` : ''}
                            </span>
                        {/if}
                    </div>
                    <div class="w-full bg-surface-muted rounded-lg h-6 overflow-hidden">
                        <div
                            class="h-full flex items-center justify-end pr-2 transition-colors duration-300"
                            style="width: {item.percentage}%; background-color: {item.color};"
                        >
                            {#if item.percentage > 20 && showValue}
                                <span class="text-xs font-bold text-white">{Math.round(item.value)}%</span>
                            {/if}
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    :global(div::-webkit-scrollbar) {
        width: 6px;
    }

    :global(div::-webkit-scrollbar-track) {
        background: transparent;
    }

    :global(div::-webkit-scrollbar-thumb) {
        background: #d1d5db;
        border-radius: 3px;
    }

    :global(div::-webkit-scrollbar-thumb:hover) {
        background: #9ca3af;
    }
</style>
