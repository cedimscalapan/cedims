import { json, error } from '@sveltejs/kit';
import { deleteObject } from '$lib/utils/b2.server';
import { supabase } from '$lib/utils/supabase';

export async function POST({ request }) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) throw error(401, 'Unauthorized');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
        throw error(401, 'Unauthorized');
    }

    const { key } = await request.json();
    if (!key || typeof key !== 'string') throw error(400, 'Missing key');

    const { data: requesterProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    const isAdmin = String(requesterProfile?.role || '').trim().toLowerCase() === 'admin';
    const ownPrefix = `submissions/${user.id}/`;
    if (!isAdmin && !key.startsWith(ownPrefix)) {
        throw error(403, 'You can only delete your own uploaded files.');
    }

    try {
        await deleteObject(key);
        return json({ success: true });
    } catch (err: any) {
        const detail = err?.message || err?.name || 'Unknown storage delete error';
        console.error('[delete-storage] Delete error:', detail, err);
        throw error(500, `Failed to delete file from storage: ${detail}`);
    }
}
