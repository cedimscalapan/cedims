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

        isOnline.set(navigator.onLine);
        refreshPendingCount();

        window.addEventListener("online", () => {
            isOnline.set(true);
            // offline.ts's own 'online' listener (initOfflineSync) triggers the
            // actual background sync; pendingSyncCount updates itself as that
            // runs. This refresh just catches the initial count on reconnect.
            refreshPendingCount();
        });
        window.addEventListener("offline", () => {
            isOnline.set(false);
        });
    }

    return {
        isOnline: { subscribe: isOnline.subscribe },
        pendingCount: { subscribe: pendingSyncCount.subscribe },
        init,
        refreshPendingCount,
    };
}

export const connectivity = createConnectivityStore();
