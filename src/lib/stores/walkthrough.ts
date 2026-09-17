import { writable } from "svelte/store";

// Set to true (e.g. from Settings > "Replay Walkthrough") to force the
// SystemWalkthrough to show again even though the dashboard layout — and
// thus its own $effect guard — stays mounted across client-side navigation.
export const walkthroughReplayRequested = writable(false);

// Tracks whether a user has already completed the first-time walkthrough.
// Persisted per-user in localStorage so it only auto-shows once.
function storageKey(userId: string) {
    return `cedims_walkthrough_seen_${userId}`;
}

export function hasSeenWalkthrough(userId: string): boolean {
    if (typeof localStorage === "undefined") return true;
    try {
        return localStorage.getItem(storageKey(userId)) === "true";
    } catch {
        return true;
    }
}

export function markWalkthroughSeen(userId: string) {
    if (typeof localStorage === "undefined") return;
    try {
        localStorage.setItem(storageKey(userId), "true");
    } catch {
        /* ignore quota/privacy errors */
    }
}

export function resetWalkthrough(userId: string) {
    if (typeof localStorage === "undefined") return;
    try {
        localStorage.removeItem(storageKey(userId));
    } catch {
        /* ignore */
    }
}
