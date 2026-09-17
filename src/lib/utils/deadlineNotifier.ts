import { supabase } from './supabase';
import { sendLocalNotification } from './notifications';

/**
 * Checks for upcoming deadlines (within 3 days) and triggers local notifications.
 * Uses localStorage to ensure each deadline only triggers one proximity alert.
 */
export async function checkUpcomingDeadlines(userId: string, districtId: string) {
    if (!userId || !districtId) return;

    try {
        const { data: deadlines, error } = await supabase
            .from('academic_calendar')
            .select('id, week_number, deadline_date, description')
            .eq('district_id', districtId)
            .gte('deadline_date', new Date().toISOString())
            .lte('deadline_date', new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString())
            .order('deadline_date', { ascending: true });

        if (error || !deadlines || deadlines.length === 0) return;

        for (const deadline of deadlines) {
            const cacheKey = `notified_deadline_${deadline.id}`;
            const alreadyNotified = localStorage.getItem(cacheKey);

            if (!alreadyNotified) {
                const daysLeft = Math.ceil((new Date(deadline.deadline_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                const message = daysLeft <= 0
                    ? `Deadline is TODAY for Week ${deadline.week_number}!`
                    : `Deadline for Week ${deadline.week_number} is in ${daysLeft} day(s).`;

                await sendLocalNotification('Deadline Approaching', message);
                localStorage.setItem(cacheKey, new Date().toISOString());
                console.log(`[Deadline Notifier] Alerted for Week ${deadline.week_number}`);
            }
        }
    } catch (err) {
        console.warn('[Deadline Notifier] Check failed:', err);
    }
}
