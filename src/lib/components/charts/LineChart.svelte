<script lang="ts">
    /**
     * Trend Line Chart Component
     * Displays compliance trends over time with multiple series
     */

    interface DataPoint {
        period: string;
        compliant?: number;
        late?: number;
        missing?: number;
        rate?: number;
        isForecasted?: boolean;
    }

    interface Props {
        data: DataPoint[];
        title: string;
        height?: number;
        showLegend?: boolean;
        series?: ('compliant' | 'late' | 'missing' | 'rate')[];
    }

    let {
        data = [],
        title = 'Trend',
        height = 300,
        showLegend = true,
        series = ['rate']
    } = $props<Props>();

    const padding = { top: 40, right: 40, bottom: 40, left: 60 };
    const width = 800;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const colors = {
        compliant: '#10b981',
        late: '#f59e0b',
        missing: '#ef4444',
        rate: '#3b82f6'
    };

    // Calculate scales
    const yMax = $derived.by(() => {
        let max = 0;
        data.forEach(d => {
            series.forEach(s => {
                const val = d[s as keyof DataPoint] as number;
                if (val) max = Math.max(max, val);
            });
        });
        return Math.max(max, 100);
    });

    const xScale = (i: number) => (i / (Math.max(data.length - 1, 1))) * chartWidth;

    const yScale = (value: number) => chartHeight - (value / yMax) * chartHeight;

    const yLabels = $derived.by(() => {
        const labels = [];
        for (let i = 0; i <= 4; i++) {
            labels.push(Math.round((i / 4) * yMax));
        }
        return labels;
    });

    // Generate path for each series
    const paths = $derived.by(() => {
        const result: Record<string, string> = {};

        series.forEach(s => {
            let pathData = '';
            data.forEach((d, i) => {
                const val = d[s as keyof DataPoint] as number;
                if (val === undefined) return;

                const x = padding.left + xScale(i);
                const y = padding.top + yScale(val);

                if (i === 0) {
                    pathData += `M ${x} ${y}`;
                } else {
                    pathData += ` L ${x} ${y}`;
                }
            });
            result[s] = pathData;
        });

        return result;
    });

</script>

<div class="gov-card-static p-6">
    <h3 class="text-lg font-bold text-text-primary mb-4">{title}</h3>

    {#if data.length === 0}
        <div class="text-center py-12">
            <p class="text-text-muted">No data available</p>
        </div>
    {:else}
        <svg {width} {height} class="w-full border border-border-subtle rounded-lg">
            <!-- Grid lines -->
            {#each yLabels as label, i}
                {@const y = padding.top + (i / (yLabels.length - 1 || 1)) * chartHeight}
                <line
                    x1={padding.left}
                    y1={y}
                    x2={width - padding.right}
                    y2={y}
                    stroke="#e5e7eb"
                    stroke-dasharray="4"
                    stroke-width="1"
                />
                <text
                    x={padding.left - 10}
                    y={y + 4}
                    text-anchor="end"
                    font-size="12"
                    fill="#6b7280"
                >
                    {label}
                </text>
            {/each}

            <!-- X-axis line -->
            <line
                x1={padding.left}
                y1={height - padding.bottom}
                x2={width - padding.right}
                y2={height - padding.bottom}
                stroke="#d1d5db"
                stroke-width="2"
            />

            <!-- Y-axis line -->
            <line
                x1={padding.left}
                y1={padding.top}
                x2={padding.left}
                y2={height - padding.bottom}
                stroke="#d1d5db"
                stroke-width="2"
            />

            <!-- Paths for each series -->
            {#each series as s}
                {#if paths[s]}
                    <path
                        d={paths[s]}
                        fill="none"
                        stroke={colors[s as keyof typeof colors]}
                        stroke-width="3"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                {/if}
            {/each}

            <!-- Data points -->
            {#each data as d, i}
                {@const x = padding.left + xScale(i)}
                {#each series as s}
                    {@const val = d[s as keyof DataPoint] as number}
                    {#if val !== undefined}
                        {@const y = padding.top + yScale(val)}
                        <circle
                            cx={x}
                            cy={y}
                            r="4"
                            fill={colors[s as keyof typeof colors]}
                            opacity={d.isForecasted ? 0.5 : 1}
                            stroke="white"
                            stroke-width="2"
                        />
                    {/if}
                {/each}
            {/each}

            <!-- X-axis labels -->
            {#each data as d, i}
                {@const x = padding.left + xScale(i)}
                {#if i % Math.max(1, Math.floor(data.length / 6)) === 0}
                    <text
                        x={x}
                        y={height - 10}
                        text-anchor="middle"
                        font-size="12"
                        fill="#6b7280"
                    >
                        {d.period}
                    </text>
                {/if}
            {/each}
        </svg>

        {#if showLegend}
            <div class="flex flex-wrap gap-4 mt-4">
                {#each series as s}
                    <div class="flex items-center gap-2">
                        <div
                            class="w-3 h-3 rounded-full"
                            style="background-color: {colors[s as keyof typeof colors]}"
                        ></div>
                        <span class="text-xs font-semibold text-text-secondary capitalize">
                            {s}
                        </span>
                    </div>
                {/each}
            </div>
        {/if}
    {/if}
</div>

<style>
    :global(text) {
        font-family: inherit;
    }
</style>
