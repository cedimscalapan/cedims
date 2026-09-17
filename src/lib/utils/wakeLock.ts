/**
 * Screen Wake Lock for long-running uploads.
 *
 * The upload pipeline can run for minutes on a phone (transcode, OCR, hash,
 * QR stamp, then the transfer itself). If the screen dims or locks partway
 * through, mobile browsers aggressively throttle timers and suspend in-flight
 * network requests — which surfaces to the user as an unexplained "timed out"
 * error on a request that never actually got a chance to run. Holding a wake
 * lock for the duration keeps the page alive so the pipeline can finish.
 *
 * Entirely best-effort: unsupported browsers, denied permission, or a lock
 * dropped by the OS must never break an upload, so every path swallows.
 */

let sentinel: any = null;
let reacquireHandler: (() => void) | null = null;

// The browser drops the lock on its own when the page is hidden, but the
// sentinel object stays in hand — so it has to be cleared here, or the
// re-acquire check below would see a stale non-null value and skip.
function trackRelease(lock: any) {
    try {
        lock.addEventListener('release', () => {
            if (sentinel === lock) sentinel = null;
        });
    } catch {
        /* older implementations without the event — re-acquire still works */
    }
}

export async function acquireWakeLock(): Promise<void> {
    const nav = navigator as any;
    if (!nav?.wakeLock?.request) return;

    try {
        sentinel = await nav.wakeLock.request('screen');
        trackRelease(sentinel);
    } catch {
        return; // denied or unavailable — carry on without it
    }

    // The lock is automatically released whenever the page is hidden, so it
    // has to be taken again when the user comes back, or a mid-upload app
    // switch would silently leave the rest of the pipeline unprotected.
    reacquireHandler = async () => {
        if (document.visibilityState !== 'visible' || sentinel) return;
        try {
            sentinel = await nav.wakeLock.request('screen');
            trackRelease(sentinel);
        } catch {
            /* best-effort */
        }
    };
    document.addEventListener('visibilitychange', reacquireHandler);
}

export async function releaseWakeLock(): Promise<void> {
    if (reacquireHandler) {
        document.removeEventListener('visibilitychange', reacquireHandler);
        reacquireHandler = null;
    }
    if (!sentinel) return;
    try {
        await sentinel.release();
    } catch {
        /* already gone */
    }
    sentinel = null;
}
