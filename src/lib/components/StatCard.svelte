<script lang="ts">
    import * as Lucide from "lucide-svelte";
    import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from "lucide-svelte";

    interface Props {
        value: string | number;
        label: string;
        trend?: { value: number; direction: "up" | "down" };
        color?: string;
        icon?: keyof typeof Lucide;
    }

    let {
        value,
        label,
        trend,
        color = "from-gov-blue to-gov-blue-dark",
        icon,
    }: Props = $props();

    const IconComponent = $derived(icon ? (Lucide[icon] as any) : null);

    function getColorClasses(c: string) {
        if (c.includes("green")) return { bg: "bg-gov-green/10", text: "text-gov-green" };
        if (c.includes("gold")) return { bg: "bg-gov-gold/10", text: "text-gov-gold-dark" };
        if (c.includes("red")) return { bg: "bg-gov-red/10", text: "text-gov-red" };
        return { bg: "bg-gov-blue/10", text: "text-gov-blue" };
    }

    const colorClasses = $derived(getColorClasses(color));
</script>

<!-- The colored icon chip + trend badge already carry the category color;
     a border-left accent was a third, redundant signal (craft-floor bans
     it). hover:shadow-lg is dropped too — .gov-card already declares
     elevation via border only, so pairing it with a shadow here re-created
     the ghost-card pattern the shared class was just fixed to avoid. -->
<div class="gov-card p-6 transition-colors duration-300">
    <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2.5 mb-3">
                {#if IconComponent}
                    <div class="p-2.5 rounded-lg {colorClasses.bg} {colorClasses.text}">
                        <IconComponent size={18} strokeWidth={2} />
                    </div>
                {/if}
                <p class="text-xs sm:text-sm font-bold uppercase tracking-wider text-text-muted">
                    {label}
                </p>
            </div>

            <div class="space-y-2">
                <p class="text-3xl sm:text-4xl font-black text-text-primary tracking-tight">
                    {value}
                </p>

                {#if trend}
                    <div class="flex items-center gap-2 pt-1">
                        <div
                            class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold {trend.direction === 'up'
                                ? 'bg-gov-green/15 text-gov-green'
                                : 'bg-gov-red/15 text-gov-red'}"
                        >
                            {#if trend.direction === "up"}
                                <ArrowUpRight size={14} strokeWidth={2.5} />
                            {:else}
                                <ArrowDownRight size={14} strokeWidth={2.5} />
                            {/if}
                            <span>{Math.abs(trend.value)}%</span>
                        </div>
                        <span class="text-xs font-medium text-text-muted">vs last week</span>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>
