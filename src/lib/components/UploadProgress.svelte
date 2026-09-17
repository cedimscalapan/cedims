<script lang="ts">
    import type { PipelinePhase } from "$lib/types/pipeline";
    import { AlertTriangle, RotateCw } from "lucide-svelte";

    interface Props {
        currentPhase: PipelinePhase;
        progress?: number;
        message?: string;
        onRetry?: () => void;
    }

    let { currentPhase, progress = 0, message = "", onRetry }: Props = $props();
</script>

<div class="gov-card-static p-6">
    {#if currentPhase === "error"}
        <div class="flex items-start gap-3 rounded-lg border border-gov-red/30 bg-gov-red/10 p-4">
            <AlertTriangle size={20} class="text-gov-red shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-gov-red">Upload didn't go through</p>
                <p class="text-sm text-text-secondary mt-1" role="alert">
                    {message || "Something went wrong. Please try again."}
                </p>
                {#if onRetry}
                    <button
                        onclick={onRetry}
                        class="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gov-red/15 hover:bg-gov-red/25 text-gov-red text-xs font-bold px-3 py-2 transition-colors"
                    >
                        <RotateCw size={14} />
                        Try Again
                    </button>
                {/if}
            </div>
        </div>
    {:else}
        {#if currentPhase !== "done"}
            <div
                class="w-full h-2 bg-surface-muted rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Upload progress"
            >
                <div
                    class="h-full bg-gradient-to-r from-gov-blue to-gov-blue-light rounded-full transition-[width] duration-500 ease-out"
                    style="width: {progress}%"
                ></div>
            </div>
        {/if}

        {#if message}
            <p class="text-sm text-text-secondary mt-3 text-center font-medium" role="status" aria-live="polite">
                {message}
            </p>
        {/if}
    {/if}
</div>
