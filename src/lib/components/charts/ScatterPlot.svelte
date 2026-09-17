<script lang="ts">
    /**
     * Scatter Plot Component
     * Used for k-means clustering visualization showing performance distribution
     * X-axis: Compliance Rate
     * Y-axis: Submission Frequency
     * Color: Risk Level
     */

    interface DataPoint {
        name: string;
        compliance_rate: number;
        submission_frequency: number;
        risk_level?: 'low' | 'medium' | 'high' | 'critical';
        compliant?: number;
        late?: number;
        missing?: number;
        total?: number;
    }

    interface Props {
        data: DataPoint[];
        title: string;
        width?: number;
        height?: number;
    }

    let {
        data = [],
        title = 'Performance Distribution',
        width = 600,
        height = 400
    } = $props<Props>();

    const padding = { top: 40, right: 40, bottom: 50, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const riskColors = {
        low: '#10b981',
        medium: '#f59e0b',
        high: '#ef4444',
        critical: '#991b1b'
    };

    // Calculate scales
    const maxRate = $derived(Math.max(...data.map(d => d.compliance_rate), 100));
    const maxFreq = $derived(Math.max(...data.map(d => d.submission_frequency), 10));

    const xScale = $derived((rate: number) => (rate / maxRate) * chartWidth);
    const yScale = $derived((freq: number) => chartHeight - (freq / maxFreq) * chartHeight);

    // Determine risk level if not provided
    const processedData = $derived(data.map(d => ({
        ...d,
        risk_level: d.risk_level || (d.compliance_rate < 50 ? 'critical' : d.compliance_rate < 70 ? 'high' : d.compliance_rate < 85 ? 'medium' : 'low')
    })));

    // Cluster data for summary
    const clusters = $derived.by(() => {
        const low = processedData.filter(d => d.risk_level === 'low').length;
        const medium = processedData.filter(d => d.risk_level === 'medium').length;
        const high = processedData.filter(d => d.risk_level === 'high').length;
        const critical = processedData.filter(d => d.risk_level === 'critical').length;

        return { low, medium, high, critical };
    });
</script>

<div class="gov-card-static p-6">
    <h3 class="text-lg font-bold text-text-primary mb-4">{title}</h3>

    {#if data.length === 0}
        <div class="text-center py-12">
            <p class="text-text-muted">No data available</p>
        </div>
    {:else}
        <div class="space-y-6">
            <!-- Chart -->
            <svg {width} {height} class="border border-border-subtle rounded-lg w-full">
                <!-- Grid lines (X) -->
                {#each Array(5) as _, i}
                    {@const x = padding.left + (i / 4) * chartWidth}
                    {@const rate = Math.round((i / 4) * maxRate)}
                    <line
                        x1={x}
                        y1={padding.top}
                        x2={x}
                        y2={height - padding.bottom}
                        stroke="#e5e7eb"
                        stroke-dasharray="4"
                        stroke-width="1"
                    />
                    <text
                        x={x}
                        y={height - 5}
                        text-anchor="middle"
                        font-size="11"
                        fill="#6b7280"
                    >
                        {rate}%
                    </text>
                {/each}

                <!-- Grid lines (Y) -->
                {#each Array(5) as _, i}
                    {@const y = padding.top + (i / 4) * chartHeight}
                    {@const freq = Math.round((i / 4) * maxFreq)}
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
                        font-size="11"
                        fill="#6b7280"
                    >
                        {freq}
                    </text>
                {/each}

                <!-- Axes -->
                <line
                    x1={padding.left}
                    y1={height - padding.bottom}
                    x2={width - padding.right}
                    y2={height - padding.bottom}
                    stroke="#d1d5db"
                    stroke-width="2"
                />
                <line
                    x1={padding.left}
                    y1={padding.top}
                    x2={padding.left}
                    y2={height - padding.bottom}
                    stroke="#d1d5db"
                    stroke-width="2"
                />

                <!-- Axis labels -->
                <text
                    x={width / 2}
                    y={height - 10}
                    text-anchor="middle"
                    font-size="12"
                    fill="#6b7280"
                    font-weight="bold"
                >
                    Compliance Rate (%)
                </text>

                <text
                    x="20"
                    y={height / 2}
                    text-anchor="middle"
                    font-size="12"
                    fill="#6b7280"
                    font-weight="bold"
                    transform={`rotate(-90 20 ${height / 2})`}
                >
                    Submission Frequency
                </text>

                <!-- Data points -->
                {#each processedData as point (point.name)}
                    {@const x = padding.left + xScale(point.compliance_rate)}
                    {@const y = padding.top + yScale(point.submission_frequency)}
                    {@const color = riskColors[point.risk_level || 'low']}

                    <!-- Tooltip on hover -->
                    <g class="group cursor-pointer">
                        <circle
                            cx={x}
                            cy={y}
                            r="6"
                            fill={color}
                            opacity="0.8"
                            stroke="white"
                            stroke-width="2"
                            class="transition-[r] duration-200 ease-out hover:r-8"
                        />

                        <!-- Invisible larger circle for easier hover -->
                        <circle cx={x} cy={y} r="10" fill="transparent" class="hover:fill-[{color}]/10" />

                        <!-- Label on hover -->
                        <text
                            x={x}
                            y={y - 15}
                            text-anchor="middle"
                            font-size="11"
                            fill="#1f2937"
                            font-weight="bold"
                            class="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            {point.compliance_rate}%
                        </text>
                    </g>
                {/each}

                <!-- Quadrant labels -->
                <text x={width - 50} y={padding.top + 20} font-size="10" fill="#9ca3af" text-anchor="end" font-weight="bold">
                    High Performers
                </text>
                <text x={padding.left + 20} y={padding.top + 20} font-size="10" fill="#9ca3af" font-weight="bold">
                    At Risk
                </text>
            </svg>

            <!-- Summary Stats -->
            <div class="grid grid-cols-4 gap-4">
                <div class="p-3 rounded-lg bg-gov-green/10 border border-gov-green/20">
                    <p class="text-xs font-semibold text-gov-green uppercase">Low Risk</p>
                    <p class="text-2xl font-bold text-gov-green">{clusters.low}</p>
                </div>
                <div class="p-3 rounded-lg bg-gov-gold/10 border border-gov-gold/20">
                    <p class="text-xs font-semibold text-gov-gold-dark uppercase">Medium</p>
                    <p class="text-2xl font-bold text-gov-gold-dark">{clusters.medium}</p>
                </div>
                <div class="p-3 rounded-lg bg-gov-red/10 border border-gov-red/20">
                    <p class="text-xs font-semibold text-gov-red uppercase">High Risk</p>
                    <p class="text-2xl font-bold text-gov-red">{clusters.high}</p>
                </div>
                <div class="p-3 rounded-lg bg-red-900/10 border border-red-900/20">
                    <p class="text-xs font-semibold text-red-900 uppercase">Critical</p>
                    <p class="text-2xl font-bold text-red-900">{clusters.critical}</p>
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
