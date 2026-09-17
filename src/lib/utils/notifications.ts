import { supabase } from './supabase';

/**
 * Handle Web Push Notification subscriptions.
 * Uses native Push API + Notification API.
 *
 * Graceful failure: if the VAPID key is missing/invalid or the push service
 * rejects the subscription, we fall back to local (in-app) notifications so
 * the feature still works instead of silently failing.
 */
export async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push notifications not supported in this browser');
        return false;
    }

    try {
        const registration = await navigator.serviceWorker.ready;

        // 1. Request User Permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('Notification permission denied');
            return false;
        }

        // 2. Resolve VAPID public key (admin-configurable; falls back to local-only)
        const VAPID_PUBLIC_KEY = await getVapidPublicKey();

        // 3. Subscribe to Push Manager (best effort)
        let pushAvailable = false;
        try {
            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
                const options: PushSubscriptionOptionsInit = {
                    userVisibleOnly: true,
                };
                // Only pass a real VAPID key; a placeholder breaks the push service.
                if (VAPID_PUBLIC_KEY && VAPID_PUBLIC_KEY.length > 40) {
                    options.applicationServerKey =
                        urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
                }
                subscription = await registration.pushManager.subscribe(options);
            }

            if (subscription) {
                // 4. Store subscription in Supabase Profile
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    await supabase.from('profiles').update({
                        push_subscription: subscription
                    }).eq('id', user.id);
                }
                pushAvailable = true;
            }
        } catch (pushErr) {
            // VAPID invalid / push service unavailable — degrade gracefully
            console.warn(
                '[notifications] Push subscription failed; using local notifications only:',
                pushErr,
            );
        }

        // 5. Confirm with a local notification (works even without server push)
        await sendLocalNotification(
            'CEDIMS',
            pushAvailable
                ? 'Push notifications enabled! You will now receive compliance alerts.'
                : 'Notifications enabled (in-app alerts). Server push is not configured yet.',
        );

        return true;
    } catch (err) {
        console.error('Push registration failed:', err);
        return false;
    }
}

/**
 * Read the admin-configured VAPID public key from system_settings.
 * Returns null when unset (triggers the local-notifications-only fallback).
 */
async function getVapidPublicKey(): Promise<string | null> {
    try {
        const { data } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'vapid_public_key')
            .maybeSingle();
        if (data?.value && typeof data.value === 'string') {
            return data.value.trim() || null;
        }
    } catch (e) {
        console.warn('[notifications] Could not read VAPID key from settings:', e);
    }
    return null;
}

/**
 * Unsubscribe from Push Notifications.
 */
export async function unsubscribeFromPush() {
    if (!('serviceWorker' in navigator)) return false;

    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
            await subscription.unsubscribe();
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase.from('profiles').update({
                push_subscription: null
            }).eq('id', user.id);
        }

        return true;
    } catch (err) {
        console.error('Unsubscribe failed:', err);
        return false;
    }
}

/**
 * Send a test push notification.
 */
export async function sendTestNotification() {
    return sendLocalNotification(
        'Test Alert',
        'This is a real-time test of the CEDIMS notification system.'
    );
}

/**
 * Trigger a local system notification.
 * Uses Service Worker for maximum reliability on mobile/PWA.
 */
export async function sendLocalNotification(title: string, body: string) {
    if (!('Notification' in window)) return;

    // Request permission if not already granted
    if (Notification.permission === 'default') {
        await Notification.requestPermission();
    }

    if (Notification.permission !== 'granted') return;

    try {
        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.ready;
            await registration.showNotification(title, {
                body,
                icon: '/app_icon.png',
                badge: '/app_icon.png',
                vibrate: [100, 50, 100],
                data: {
                    url: window.location.origin + '/dashboard'
                }
            } as any);
        } else {
            new Notification(title, { body, icon: '/app_icon.png' });
        }
    } catch (err) {
        console.warn('[Notifications] Fallback to simple notification:', err);
        new Notification(title, { body, icon: '/app_icon.png' });
    }
}

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
