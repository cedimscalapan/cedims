import { writable } from "svelte/store";
import { getQueueSize, pendingSyncCount } from "$lib/utils/offline";

// Centralizes online/offline + pending-sync-queue state so any page
// (not just the upload page) can show a consistent connectivity signal.
//
// pendingCount is NOT a separate poll — it re-exports offline.ts's
// `pendingSyncCount` store, which offline.ts updates immediately on every
// enqueue/sync/removal (via updatePendingCount()). That keeps this badge in
// sync the instant a background sync finishes, instead of waiting on a timer.
function createConnectivityStore() {
    const isOnline = writable<boolean>(
        typeof navigator !== "undefined" ? navigator.onLine : true,
    );

    let initialized = false;
    let probeRun = 0;
    async function checkConnection(): Promise<boolean> {
        const run = ++probeRun;
        if (!navigator.onLine) { isOnline.set(false); return false; }
        let available = false;
        try {
            const response = await fetch(`/api/health?probe=${Date.now()}`, {
                cache: 'no-store',
                signal: AbortSignal.timeout(4000),
            });
            available = response.status === 204;
        } catch { /* No working connection to CEDIMS. */ }
        if (run === probeRun) isOnline.set(available);
        return available;
    }

    async function refreshPendingCount() {
        try {
            const size = await getQueueSize();
            pendingSyncCount.set(size);
        } catch (err) {
            console.warn("[connectivity] Failed to read queue size:", err);
        }
    }

    function init() {
        if (initialized || typeof window === "undefined") return;
        initialized = true;

        void checkConnection();
        refreshPendingCount();
        const timer = window.setInterval(() => { void checkConnection(); }, 15000);

        window.addEventListener("online", () => {
            void checkConnection();
            // offline.ts's own 'online' listener (initOfflineSync) triggers the
            // actual background sync; pendingSyncCount updates itself as that
            // runs. This refresh just catches the initial count on reconnect.
            refreshPendingCount();
        });
        window.addEventListener("offline", () => {
            probeRun++;
            isOnline.set(false);
        });
        window.addEventListener('focus', () => { void checkConnection(); });
    }

    return {
        isOnline: { subscribe: isOnline.subscribe },
        pendingCount: { subscribe: pendingSyncCount.subscribe },
        init,
        refreshPendingCount,
        checkConnection,
    };
}

export const connectivity = createConnectivityStore();
