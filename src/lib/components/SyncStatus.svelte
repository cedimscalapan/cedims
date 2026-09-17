<script lang="ts">
    import { pendingSyncCount, processQueue } from "$lib/utils/offline";
    import { onMount } from "svelte";
    import { fade, fly } from "svelte/transition";

    let isOnline = $state(true);
    let isSyncing = $state(false);

    onMount(() => {
        isOnline = navigator.onLine;
        window.addEventListener("online", () => (isOnline = true));
        window.addEventListener("offline", () => (isOnline = false));
    });

    async function handleSync() {
        if (isSyncing || !isOnline) return;
        isSyncing = true;
        try {
            await processQueue(true);
        } finally {
            isSyncing = false;
        }
    }
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
                    You're offline. Uploads will be saved and synced
                    automatically when back online.
                </p>
            {:else if $pendingSyncCount > 0}
                <button
                    onclick={handleSync}
                    disabled={isSyncing}
                    class="w-full py-2.5 bg-gov-blue text-white rounded-xl text-[14px] font-bold hover:bg-gov-blue-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {#if isSyncing}
                        Syncing...
                    {:else}
                        Sync Now
                    {/if}
                </button>
            {/if}
        </div>
    </div>
{/if}
