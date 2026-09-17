import { supabase } from './supabase';

export async function logAudit(
    actorId: string,
    action: string,
    entityType: string,
    entityId?: string,
    metadata?: Record<string, unknown>
) {
    try {
        await supabase.from('audit_logs').insert({
            actor_id: actorId,
            action,
            entity_type: entityType,
            entity_id: entityId || null,
            metadata: metadata ?? {},
        });
    } catch (err) {
        console.error('[audit] Failed to log action:', err);
    }
}