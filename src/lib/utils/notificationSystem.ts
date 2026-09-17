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
        console.log('[Notification System] Attempting insert:', {
            targetUserId: userId,
            sessionUserId: user?.id,
            match: userId === user?.id
        });

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

/**
 * Specialized utility for Compliance Alerts (District/School level)
 */
export async function alertComplianceRisk(
    districtId: string | undefined,
    schoolName: string,
    riskLevel: 'high' | 'medium',
    details: string
) {
    // 1. Find the target supervisor or school head
    const role = districtId ? 'District Supervisor' : 'School Head';

    let query = supabase.from('profiles').select('id').eq('role', role);
    if (districtId) query = query.eq('district_id', districtId);

    const { data: targets } = await query;

    if (targets && targets.length > 0) {
        // 2. Notify all relevant supervisors
        await Promise.all(targets.map(target =>
            createNotification(
                target.id,
                `Institutional Risk: ${schoolName}`,
                details,
                riskLevel === 'high' ? 'error' : 'warning',
                '/dashboard/monitoring/district'
            )
        ));
    }
}
