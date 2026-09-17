
import { keys } from 'idb-keyval';

export async function updateAppBadge(notifCount?: number) {
    if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return;

    try {
        const unread = notifCount ?? 0;

        const QUEUE_PREFIX = 'sync_queue_';
        const allKeys = await keys();
        const syncCount = allKeys.filter((k: any) => String(k).startsWith(QUEUE_PREFIX)).length;

        const total = unread + syncCount;

        if (total > 0) {
            (navigator as any).setAppBadge(total).catch(() => { });
        } else {
            (navigator as any).clearAppBadge().catch(() => { });
        }
    } catch (err) {
        console.debug('[badge] Sync failed:', err);
    }
}
