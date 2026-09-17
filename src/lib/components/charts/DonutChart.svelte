<script lang="ts">
    /**
     * Donut Chart Component
     * Used for showing document type breakdown or status distribution
     */

    interface SliceData {
        label: string;
        value: number;
        color: string;
    }

    interface Props {
        data: SliceData[];
        title: string;
        innerRadius?: number;
        outerRadius?: number;
        showPercent?: boolean;
    }

    let {
        data = [],
        title = 'Distribution',
        innerRadius = 50,
        outerRadius = 80,
        showPercent = true
    } = $props<Props>();

    const total = $derived(data.reduce((sum, d) => sum + d.value, 0));

    const slices = $derived.by(() => {
        let currentAngle = -Math.PI / 2;
        const sliceList = [];

        data.forEach(d => {
            const sliceAngle = (d.value / total) * Math.PI * 2;
            const startAngle = currentAngle;
            const endAngle = currentAngle + sliceAngle;

            const x1 = 100 + outerRadius * Math.cos(startAngle);
            const y1 = 100 + outerRadius * Math.sin(startAngle);
            const x2 = 100 + outerRadius * Math.cos(endAngle);
            const y2 = 100 + outerRadius * Math.sin(endAngle);
            const x3 = 100 + innerRadius * Math.cos(endAngle);
            const y3 = 100 + innerRadius * Math.sin(endAngle);
            const x4 = 100 + innerRadius * Math.cos(startAngle);
            const y4 = 100 + innerRadius * Math.sin(startAngle);

            const largeArc = sliceAngle > Math.PI ? 1 : 0;

            const path = `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`;

            const labelAngle = startAngle + sliceAngle / 2;
            const labelRadius = (innerRadius + outerRadius) / 2;
            const labelX = 100 + labelRadius * Math.cos(labelAngle);
            const labelY = 100 + labelRadius * Math.sin(labelAngle);

            sliceList.push({
                path,
                color: d.color,
                labelX,
                labelY,
                percent: Math.round((d.value / total) * 100),
                value: d.value,
                label: d.label
            });

            currentAngle = endAngle;
        });

        return sliceList;
    });
</script>

<div class="gov-card-static p-6">
    <h3 class="text-lg font-bold text-text-primary mb-6">{title}</h3>

    {#if data.length === 0}
        <div class="text-center py-8">
            <p class="text-text-muted">No data available</p>
        </div>
    {:else}
        <div class="flex flex-col lg:flex-row items-center justify-between gap-8">
            <!-- Chart -->
            <div class="flex-shrink-0">
                <svg width="240" height="240" viewBox="0 0 200 200" class="w-48 h-48">
                    {#each slices as slice (slice.label)}
                        <path
                            d={slice.path}
                            fill={slice.color}
                            stroke="white"
                            stroke-width="2"
                            class="transition-opacity hover:opacity-80 cursor-pointer"
                        />
                        {#if slice.percent >= 10}
                            <text
                                x={slice.labelX}
                                y={slice.labelY}
                                text-anchor="middle"
                                dominant-baseline="middle"
                                font-size="12"
                                font-weight="bold"
                                fill="white"
                                pointer-events="none"
                            >
                                {slice.percent}%
                            </text>
                        {/if}
                    {/each}
                </svg>
            </div>

            <!-- Legend -->
            <div class="flex-1 space-y-3">
                {#each slices as slice (slice.label)}
                    <div class="flex items-center gap-3">
                        <div
                            class="w-4 h-4 rounded-full flex-shrink-0"
                            style="background-color: {slice.color};"
                        ></div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-semibold text-text-primary">{slice.label}</p>
                            <p class="text-xs text-text-secondary">
                                {slice.value} ({slice.percent}%)
                            </p>
                        </div>
                    </div>
                {/each}

                <div class="pt-4 border-t border-border-subtle">
                    <p class="text-xs font-semibold text-text-secondary uppercase">Total</p>
                    <p class="text-xl font-bold text-text-primary">{total}</p>
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    :global(text) {
        font-family: inherit;
    }
</style>
