<script lang="ts">
    import { pendingSyncCount } from "$lib/utils/offline";
    import { onMount } from "svelte";
    import { fade, fly } from "svelte/transition";

    let isOnline = $state(true);

    onMount(() => {
        isOnline = navigator.onLine;
        window.addEventListener("online", () => (isOnline = true));
        window.addEventListener("offline", () => (isOnline = false));
    });
</script>

{#if $pendingSyncCount > 0 || !isOnline}
    <div
        class="mt-auto pt-6 border-t border-gray-100 px-2"
        in:fly={{ y: 20, duration: 400 }}
        out:fade
    >
        <div class="gov-card-static p-4 space-y-3" role="status" aria-live="polite">
            <div class="flex items-center justify-between">
                <span
                    class="text-[14px] font-medium text-text-primary flex items-center gap-2"
                >
                    {isOnline ? "Online" : "Offline"}
                </span>
                {#if $pendingSyncCount > 0}
                    <span
                        class="px-2 py-0.5 bg-gov-blue/10 text-gov-blue text-[12px] font-bold rounded-full"
                    >
                        {$pendingSyncCount} pending
                    </span>
                {/if}
            </div>

            {#if !isOnline}
                <p class="text-[12px] text-text-muted leading-tight">
                    You're offline. Uploads are saved here and start by
                    themselves when the internet returns.
                </p>
            {:else if $pendingSyncCount > 0}
                <p class="text-[12px] text-text-muted leading-tight">
                    Uploading by itself. You can keep working.
                </p>
            {/if}
        </div>
    </div>
{/if}
