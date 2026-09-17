<script lang="ts">
    import { onMount } from "svelte";
    import { X, RefreshCw } from "lucide-svelte";
    import { fly } from "svelte/transition";

    let showUpdate = $state(false);
    let waitingWorker: ServiceWorker | null = $state(null);

    onMount(() => {
        if (!("serviceWorker" in navigator)) return;

        navigator.serviceWorker.ready.then((registration) => {
            // Check if a new SW is already waiting
            if (registration.waiting) {
                waitingWorker = registration.waiting;
                showUpdate = true;
            }

            // Listen for new SW installations
            registration.addEventListener("updatefound", () => {
                const newWorker = registration.installing;
                if (!newWorker) return;

                newWorker.addEventListener("statechange", () => {
                    if (
                        newWorker.state === "installed" &&
                        navigator.serviceWorker.controller
                    ) {
                        waitingWorker = newWorker;
                        showUpdate = true;
                    }
                });
            });
        });

        // Reload when the new SW takes over
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (!refreshing) {
                refreshing = true;
                window.location.reload();
            }
        });
    });

    function handleUpdate() {
        if (waitingWorker) {
            waitingWorker.postMessage({ type: "SKIP_WAITING" });
        }
        showUpdate = false;
    }

    function dismiss() {
        showUpdate = false;
    }
</script>

{#if showUpdate}
    <div
        class="fixed top-4 left-4 right-4 lg:left-auto lg:right-6 lg:w-96 z-[var(--z-overlay)]"
        in:fly={{ y: -20, duration: 300 }}
        out:fly={{ y: -20, duration: 300 }}
    >
        <!-- The colored icon chip already conveys category; a background
             tint replaces the banned border-left as the ambient cue.
             gov-card already declares elevation via border, so shadow-xl
             is dropped rather than stacked on top of it. -->
        <div class="gov-card bg-gov-green/5 p-5 sm:p-6">
            <div class="flex items-start gap-4">
                <div class="p-3 bg-gov-green/20 rounded-lg flex-shrink-0">
                    <RefreshCw size={20} class="text-gov-green" strokeWidth={2.5} />
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-bold text-text-primary text-sm sm:text-base">
                        Update Available
                    </h3>
                    <p class="text-xs sm:text-sm text-text-secondary mt-1">
                        A new version of CEDIMS is ready to install.
                    </p>
                </div>
                <button
                    onclick={dismiss}
                    class="flex-shrink-0 text-text-muted hover:text-text-primary p-1 transition-colors"
                    aria-label="Dismiss"
                >
                    <X size={18} strokeWidth={2} />
                </button>
            </div>
            <div class="flex gap-2 mt-4">
                <button
                    onclick={handleUpdate}
                    class="gov-btn-primary flex-1 justify-center text-sm"
                >
                    <RefreshCw size={16} strokeWidth={2} />
                    Refresh Now
                </button>
                <button
                    onclick={dismiss}
                    class="gov-btn-secondary flex-1 justify-center text-sm"
                >
                    Later
                </button>
            </div>
        </div>
    </div>
{/if}
