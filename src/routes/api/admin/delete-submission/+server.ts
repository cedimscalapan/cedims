import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { supabase } from '$lib/utils/supabase';
import { deleteObject } from '$lib/utils/b2.server';

export async function POST({ request }) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) throw error(401, 'Unauthorized');
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw error(401, 'Unauthorized');

    const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) throw error(500, 'Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY');
    const adminDb = createClient(publicEnv.PUBLIC_SUPABASE_URL || '', serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: adminProfile } = await adminDb.from('profiles').select('role').eq('id', user.id).single();
    const profileRole = String(adminProfile?.role || '').trim().toLowerCase();
    const appRole = String(user.app_metadata?.role || '').trim().toLowerCase();
    const isAdmin = profileRole === 'admin' || profileRole === 'administrator' || appRole === 'admin' || appRole === 'administrator';
    if (!isAdmin) throw error(403, 'Only Admin users can delete another user’s archive file.');

    const { submissionId } = await request.json();
    if (!submissionId || typeof submissionId !== 'string') throw error(400, 'Missing submissionId');
    const { data: submission, error: lookupError } = await adminDb
        .from('submissions')
        .select('id, file_path, file_name')
        .eq('id', submissionId)
        .single();
    if (lookupError || !submission) throw error(404, 'Archive file not found.');

    if (submission.file_path) {
        try { await deleteObject(submission.file_path); } catch (storageError) {
            console.error('[admin-delete-submission] Storage delete failed:', storageError);
            throw error(500, 'The archive record was protected because the storage file could not be deleted.');
        }
    }
    const { error: deleteError } = await adminDb.from('submissions').delete().eq('id', submissionId);
    if (deleteError) throw error(500, `Could not delete archive record: ${deleteError.message}`);
    return json({ success: true, fileName: submission.file_name });
}
