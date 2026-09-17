<script lang="ts">
    import { onMount } from "svelte";
    import { X, Download, Share2 } from "lucide-svelte";
    import { fly } from "svelte/transition";

    let deferredPrompt: any = $state(null);
    let showPrompt = $state(false);
    let isIOS = $state(false);
    let isInstalled = $state(false);
    let dismissed = $state(false);

    onMount(() => {
        // Check if already installed
        if (window.matchMedia("(display-mode: standalone)").matches) {
            isInstalled = true;
            return;
        }

        // Check if iOS (needs manual install instructions)
        const ua = navigator.userAgent;
        isIOS =
            /iPad|iPhone|iPod/.test(ua) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

        // Listen for the install prompt event (Chrome/Edge/Android)
        window.addEventListener("beforeinstallprompt", (e: Event) => {
            e.preventDefault();
            deferredPrompt = e;
            // Show our custom prompt after a short delay
            setTimeout(() => {
                if (!dismissed) showPrompt = true;
            }, 3000);
        });

        // Detect if app was just installed
        window.addEventListener("appinstalled", () => {
            isInstalled = true;
            showPrompt = false;
            deferredPrompt = null;
        });

        // Show iOS instructions after delay if not installed
        if (isIOS && !isInstalled) {
            setTimeout(() => {
                if (!dismissed) showPrompt = true;
            }, 5000);
        }
    });

    async function handleInstall() {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
            isInstalled = true;
        }
        deferredPrompt = null;
        showPrompt = false;
    }

    function dismiss() {
        showPrompt = false;
        dismissed = true;
    }
</script>

{#if showPrompt && !isInstalled && !dismissed}
    <div
        class="fixed bottom-28 left-4 right-4 lg:left-auto lg:right-6 lg:w-96 z-[var(--z-dropdown)]"
        in:fly={{ y: 20, duration: 300 }}
        out:fly={{ y: 20, duration: 300 }}
    >
        <!-- See UpdatePrompt.svelte for why this is a tint, not a
             border-left + shadow-xl stack. -->
        <div class="gov-card bg-gov-blue/5 p-5 sm:p-6">
            <div class="flex items-start gap-4">
                <div class="p-3 bg-gov-blue/20 rounded-lg flex-shrink-0">
                    <Download size={20} class="text-gov-blue" strokeWidth={2.5} />
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-bold text-text-primary text-sm sm:text-base">
                        Get CEDIMS App
                    </h3>
                    {#if isIOS}
                        <p class="text-xs sm:text-sm text-text-secondary mt-1 leading-relaxed">
                            Tap <strong>Share</strong> <Share2 size={14} class="inline" /> then <strong>"Add to Home Screen"</strong> for faster access.
                        </p>
                    {:else}
                        <p class="text-xs sm:text-sm text-text-secondary mt-1 leading-relaxed">
                            Install as an app for offline support and faster performance.
                        </p>
                    {/if}
                </div>
                <button
                    onclick={dismiss}
                    class="flex-shrink-0 text-text-muted hover:text-text-primary p-1 transition-colors"
                    aria-label="Dismiss"
                >
                    <X size={18} strokeWidth={2} />
                </button>
            </div>

            {#if !isIOS}
                <div class="flex gap-2 mt-4">
                    <button
                        onclick={handleInstall}
                        class="gov-btn-primary flex-1 justify-center text-sm"
                    >
                        <Download size={16} strokeWidth={2} />
                        Install App
                    </button>
                    <button
                        onclick={dismiss}
                        class="gov-btn-secondary flex-1 justify-center text-sm"
                    >
                        Not now
                    </button>
                </div>
            {/if}
        </div>
    </div>
{/if}
