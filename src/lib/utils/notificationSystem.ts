import { supabase } from './supabase';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

/**
 * Global utility to push notifications to the database.
 * These will trigger real-time updates for the targeted user.
 */
export async function createNotification(
    userId: string,
    title: string,
    message: string,
    type: NotificationType = 'info',
    link?: string
) {
    try {
        const { data: { user } } = await supabase.auth.getUser();

        const { error } = await supabase
            .from('notifications')
            .insert({
                user_id: userId,
                title,
                message,
                type,
                link,
                read: false,
                created_at: new Date().toISOString()
            });

        if (error) {
            if (error.code === '42501') {
                console.warn('[Notification System] RLS Policy Blocked: Target ID', userId, 'vs Session ID', user?.id);
                console.warn('[Notification System] Please check your Supabase RLS policies for the "notifications" table.');
            } else {
                console.error('[Notification System] Failed to push notification:', error.message);
            }
            return false;
        }
        return true;
    } catch (err) {
        console.error('[Notification System] Error creating notification:', err);
        return false;
    }
}

