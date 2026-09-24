<script lang="ts">
    import AppHeader from "$lib/components/AppHeader.svelte";
    import InstallPrompt from "$lib/components/InstallPrompt.svelte";
    import UpdatePrompt from "$lib/components/UpdatePrompt.svelte";
    import SystemWalkthrough from "$lib/components/SystemWalkthrough.svelte";
    import { notifications } from "$lib/stores/notifications";
    import { authLoading, profile, user, isChangingPassword } from "$lib/utils/auth";
    import {
        preloadVerificationHashes,
        prefetchOfflineMetadata,
    } from "$lib/utils/offline";
    import { settings } from "$lib/stores/settings";
    import { theme } from "$lib/stores/theme";
    import { connectivity } from "$lib/stores/connectivity";
    import { goto } from "$app/navigation";
    import { afterNavigate, beforeNavigate } from "$app/navigation";
    import { onMount } from "svelte";

    let { children } = $props();

    // Auth guard — skip during password change to avoid redirect when supabase temporarily signs out
    $effect(() => {
        if (!$authLoading && !$user && !$isChangingPassword) {
            goto("/auth/login");
        }
    });

    // WBS 20.3 & 20.4 — Proactive caching for full offline functionality
    let prefetchDone = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    function requestVisibleRouteRefresh(reason: "focus" | "visible" | "navigate") {
        if (typeof window === "undefined") return;
        if (!navigator.onLine && reason !== "navigate") return;
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
            window.dispatchEvent(
                new CustomEvent("cedims:refresh-visible-route", {
                    detail: { reason, requestedAt: Date.now() },
                }),
            );
        }, 180);
    }

    onMount(() => {
        theme.init(); // Apply saved theme
        settings.init(); // Initialize real-time settings
        connectivity.init(); // Track online/offline + pending sync queue globally

        const onFocus = () => requestVisibleRouteRefresh("focus");
        const onVisibility = () => {
            if (document.visibilityState === "visible") {
                requestVisibleRouteRefresh("visible");
            }
        };

        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            if (refreshTimer) clearTimeout(refreshTimer);
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    });

    beforeNavigate(() => {
        if (refreshTimer) clearTimeout(refreshTimer);
    });

    afterNavigate(() => {
        requestVisibleRouteRefresh("navigate");
    });

    // Reactive prefetch: triggers as soon as profile is available
    $effect(() => {
        if ($user && $profile && !prefetchDone) {
            prefetchDone = true;
            Promise.all([
                preloadVerificationHashes($profile.id),
                prefetchOfflineMetadata(
                    $profile.id,
                    $profile.district_id || undefined,
                ),
                notifications.init($user.id),
                import("$lib/utils/deadlineNotifier").then((m) =>
                    m.checkUpcomingDeadlines(
                        $profile!.id,
                        $profile!.district_id || "",
                    ),
                ),
            ]).catch((err) => {
                console.warn("[dashboard] Prefetch error:", err);
            });
        }
    });
</script>

<svelte:head>
    <title>CEDIMS: Dashboard · Powered by Smart E-VISION</title>
</svelte:head>

<!-- WBS 21.2 — Accessibility: Skip to Content Link -->
<a
    href="#main-content"
    class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[var(--z-skip-link)] focus:px-4 focus:py-2 focus:bg-gov-blue focus:text-white focus:font-semibold focus:rounded-md focus:shadow-sm"
>
    Skip to Content
</a>

{#if $user}
    <div class="min-h-dvh bg-surface flex flex-col dashboard-shell">
        <AppHeader />

        <main
            id="main-content"
            class="flex-1 min-w-0 flex flex-col bg-surface"
            aria-label="Dashboard content"
        >
            <div class="workspace-content w-full max-w-[96rem] mx-auto px-5 sm:px-8 lg:px-10 py-7 flex-1">
                {@render children()}
            </div>
        </main>

        <!-- PWA prompts -->
        <InstallPrompt />
        <UpdatePrompt />

        <!-- Full system interactive walkthrough -->
        <SystemWalkthrough />
    </div>
{/if}

