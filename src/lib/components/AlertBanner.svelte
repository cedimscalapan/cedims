<script lang="ts">
    import type { PatternAlert } from "$lib/utils/patternDetection";
    import { fly, slide } from "svelte/transition";
    import { AlertTriangle, AlertCircle, ChevronDown } from "lucide-svelte";

    interface Props {
        alerts?: PatternAlert[];
    }

    let { alerts = [] }: Props = $props();
    let expanded = $state(false);

    const highSeverityAlerts = $derived(
        alerts.filter((a) => a.severity === "high"),
    );
    const totalCount = $derived(alerts.length);
    const isHighSeverity = $derived(highSeverityAlerts.length > 0);

    // Severity is already conveyed by the icon (shape + color) and the
    // tinted background below — a colored border-left would be a third,
    // redundant signal for the same thing (craft-floor bans it outright).
    const cardClass = "gov-card overflow-hidden";
    // var() resolves against the live theme at render time, unlike a
    // hardcoded hex duplicate of the same token — correct today and stays
    // correct if a dark-mode-specific gov-red/gov-gold is ever added.
    const iconBg = $derived(isHighSeverity ? "color-mix(in srgb, var(--color-gov-red) 20%, transparent)" : "color-mix(in srgb, var(--color-gov-gold) 20%, transparent)");
    const iconColor = $derived(isHighSeverity ? "var(--color-gov-red)" : "var(--color-gov-gold)");
    const badgeBg = $derived(isHighSeverity ? "var(--color-gov-red)" : "var(--color-gov-gold)");
    const cardBg = $derived(isHighSeverity ? "color-mix(in srgb, var(--color-gov-red) 5%, transparent)" : "color-mix(in srgb, var(--color-gov-gold) 5%, transparent)");
</script>

{#if totalCount > 0}
    <div class="mb-6" in:fly={{ y: -10, duration: 300 }}>
        <div class={cardClass} style="background-color: {cardBg}">
            <button
                class="w-full flex items-center justify-between gap-4 px-4 sm:px-6 py-4 sm:py-5 cursor-pointer text-left hover:bg-black/2 transition-colors duration-200"
                onclick={() => (expanded = !expanded)}
                aria-expanded={expanded}
            >
                <div class="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                    <div class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" style="background-color: {iconBg}; color: {iconColor}">
                        {#if isHighSeverity}
                            <AlertTriangle size={20} strokeWidth={2.5} />
                        {:else}
                            <AlertCircle size={20} strokeWidth={2.5} />
                        {/if}
                    </div>

                    <div class="min-w-0 flex-1">
                        <h3 class="font-bold text-text-primary text-sm sm:text-base flex items-center gap-2 flex-wrap">
                            Compliance Alerts
                            <span class="inline-flex items-center justify-center px-2 py-1 rounded-lg text-xs font-bold text-white" style="background-color: {badgeBg}">
                                {totalCount}
                            </span>
                        </h3>
                        <p class="text-xs sm:text-sm text-text-secondary mt-1.5">
                            {#if isHighSeverity}
                                <strong>{highSeverityAlerts.length}</strong> teacher{highSeverityAlerts.length !== 1 ? "s requiring" : " requiring"} immediate intervention.
                            {:else}
                                <strong>{totalCount}</strong> submission consistency issue{totalCount !== 1 ? "s" : ""} identified.
                            {/if}
                        </p>
                    </div>
                </div>

                <div class="flex-shrink-0">
                    <div class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-black/5 transition-colors duration-200">
                        <span class="hidden sm:inline text-xs font-semibold text-text-muted">
                            {expanded ? "Hide" : "Show"}
                        </span>
                        <ChevronDown
                            size={18}
                            strokeWidth={2}
                            class="text-text-muted transition-transform duration-300"
                            style="transform: rotate({expanded ? "180deg" : "0deg"})"
                        />
                    </div>
                </div>
            </button>

            {#if expanded}
                <div class="border-t border-border-subtle bg-surface-muted/30" transition:slide={{ duration: 250 }}>
                    <div class="max-h-[400px] overflow-y-auto cedims-scroll p-3 sm:p-4 space-y-2.5">
                        {#each alerts as alert}
                            <div class="p-3 sm:p-4 rounded-lg bg-surface-white border border-border-subtle hover:border-gov-blue/40 transition-colors duration-200">
                                <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                    <div class="min-w-0 flex-1">
                                        <div class="flex items-center gap-2 mb-2 flex-wrap">
                                            <p class="font-semibold text-text-primary text-sm truncate">
                                                {alert.full_name}
                                            </p>
                                            <span class="text-xs px-2 py-1 rounded-md bg-gov-blue/10 text-gov-blue font-medium truncate max-w-[140px]">
                                                {alert.school_name}
                                            </span>
                                        </div>
                                        <p class="text-sm text-text-secondary leading-relaxed">
                                            {alert.details}
                                        </p>
                                    </div>

                                    <div class="flex items-center justify-between sm:flex-col sm:items-end gap-3 flex-shrink-0">
                                        <span class="text-xs font-bold uppercase px-3 py-1.5 rounded-lg text-white" style="background-color: {alert.severity === "high" ? "var(--color-gov-red)" : "var(--color-gov-gold)"}">
                                            {alert.severity}
                                        </span>
                                        <button class="text-xs font-bold text-gov-blue hover:text-gov-blue-dark transition-colors flex items-center gap-1 whitespace-nowrap">
                                            Review →
                                        </button>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>
    </div>
{/if}
