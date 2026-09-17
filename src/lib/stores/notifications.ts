import { writable, derived } from 'svelte/store';
import { supabase } from '$lib/utils/supabase';
import { addToast } from './toast';

export interface Notification {
    id: string;
    user_id: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    read: boolean;
    created_at: string;
    link?: string;
}

function createNotificationStore() {
    const { subscribe, set, update } = writable<Notification[]>([]);
    let userId: string | null = null;
    let channel: any = null;

    // Cache key for notifications
    const getCacheKey = (uid: string) => `notifications_${uid}`;

    return {
        subscribe,
        init: async (id: string) => {
            if (!id) return;
            userId = id;

            // 1. Load from cache INSTANTLY for offline-ready UI
            const { getCachedMetadata } = await import('$lib/utils/offline');
            const cached = await getCachedMetadata(getCacheKey(userId));
            if (cached?.data) {
                set(cached.data);
                console.log('[notifications] Loaded from offline cache');
            }

            // 2. Fetch fresh initial notifications from Supabase
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(20);

            if (!error && data) {
                if (data.length === 0) {
                    set([]); // Clear loading state even if empty

                    // Only attempt welcome notification if online and not already sent this session
                    const welcomeSent = localStorage.getItem(`welcome_sent_${userId}`);
                    if (navigator.onLine && !welcomeSent) {
                        const { createNotification } = await import('$lib/utils/notificationSystem');
                        const success = await createNotification(
                            userId,
                            'Welcome to CEDIMS',
                            'Your instructional supervision dashboard is ready. All your archivals and alerts will appear here.',
                            'info'
                        );
                        if (success) {
                            localStorage.setItem(`welcome_sent_${userId}`, 'true');
                        }
                    }
                } else {
                    set(data);
                    // Also update cache for next time
                    const { cacheMetadata } = await import('$lib/utils/offline');
                    await cacheMetadata(getCacheKey(userId), data);
                }
            } else if (error) {
                console.warn('[notifications] Fetch error:', error.message);
                // Fallback: If network is down, we already loaded from cache above.
                // If cache also empty, set to empty array to stop loading spinners.
                update(current => current.length ? current : []);
            }

            // 3. Setup Real-time listener
            if (channel) supabase.removeChannel(channel);

            channel = supabase
                .channel(`user-notifications-${userId}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*', // Sync all events
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${userId}`
                    },
                    async (payload) => {
                        if (payload.eventType === 'INSERT') {
                            const newNotif = payload.new as Notification;
                            update(n => [newNotif, ...n]);
                            addToast(newNotif.type, `${newNotif.title}: ${newNotif.message}`);

                            // Trigger native push notification
                            import('$lib/utils/notifications').then(m => {
                                m.sendLocalNotification(newNotif.title, newNotif.message);
                            });

                            if ('vibrate' in navigator) navigator.vibrate(50);
                        } else if (payload.eventType === 'UPDATE') {
                            update(n => n.map(item => item.id === payload.new.id ? payload.new as Notification : item));
                        } else if (payload.eventType === 'DELETE') {
                            update(n => n.filter(item => item.id !== payload.old.id));
                        }

                        // Always keep cache in sync with local state
                        const { cacheMetadata } = await import('$lib/utils/offline');
                        update(current => {
                            cacheMetadata(getCacheKey(userId!), current);
                            return current;
                        });
                    }
                )
                .subscribe();
        },
        markAsRead: async (notificationId: string) => {
            // OPTIMISTIC UPDATE: Update UI immediately even if offline
            update(n => n.map(item => item.id === notificationId ? { ...item, read: true } : item));

            const { error } = await supabase
                .from('notifications')
                .update({ read: true })
                .eq('id', notificationId);

            if (error) {
                console.warn('[notifications] Failed to sync read status online. It will stay read locally.');
            } else {
                // Sync cache
                const { getCachedMetadata, cacheMetadata } = await import('$lib/utils/offline');
                const current = await getCachedMetadata(getCacheKey(userId!));
                if (current?.data) {
                    const updated = current.data.map((i: any) => i.id === notificationId ? { ...i, read: true } : i);
                    await cacheMetadata(getCacheKey(userId!), updated);
                }
            }
        },
        markAllAsRead: async () => {
            if (!userId) return;

            // Optimistic update
            update(n => n.map(item => ({ ...item, read: true })));

            const { error } = await supabase
                .from('notifications')
                .update({ read: true })
                .eq('user_id', userId)
                .eq('read', false);

            if (!error) {
                const { getCachedMetadata, cacheMetadata } = await import('$lib/utils/offline');
                const current = await getCachedMetadata(getCacheKey(userId!));
                if (current?.data) {
                    const updated = current.data.map((i: any) => ({ ...i, read: true }));
                    await cacheMetadata(getCacheKey(userId!), updated);
                }
            }
        },
        clear: () => {
            if (channel) supabase.removeChannel(channel);
            set([]);
        }
    };
}

export const notifications = createNotificationStore();

export const unreadCount = derived(notifications, ($notifications) => {
    const unread = $notifications.filter(n => !n.read).length;
    import('$lib/utils/badge').then(m => m.updateAppBadge(unread));
    return unread;
});
