import { json, error } from '@sveltejs/kit';
import { getPresignedUploadUrl, getPresignedDownloadUrl } from '$lib/utils/b2.server';
import { supabase } from '$lib/utils/supabase';
import { env } from '$env/dynamic/private';

export async function POST({ request }) {
    // 1. Authenticate with Supabase
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) throw error(401, 'Unauthorized');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
        console.error('[presign] Auth error:', authError);
        throw error(401, 'Unauthorized');
    }

    // 2. Get request body
    const { key, contentType, intent = 'upload' } = await request.json();
    if (!key) throw error(400, 'Missing key');

    // 3. Generate pre-signed URL
    try {
        let url;
        if (intent === 'download') {
            url = await getPresignedDownloadUrl(key);
        } else {
            if (!contentType) throw error(400, 'Missing contentType for upload');
            
            // Use SvelteKit's server environment source so local Vite and
            // production adapters validate the same credentials.
            const missing = ['B2_ENDPOINT', 'B2_BUCKET_NAME', 'B2_APPLICATION_KEY_ID', 'B2_APPLICATION_KEY']
                .filter((name) => !env[name as keyof typeof env]);
            if (missing.length > 0) {
                console.error('[presign] Missing B2 environment variables:', missing.join(', '));
                throw error(500, `Cloud storage is not configured: missing ${missing.join(', ')}`);
            }

            url = await getPresignedUploadUrl(key, contentType);
        }
        
        console.log(`[presign] Generated URL for ${key}: ${url.split('?')[0]}...`);
        return json({ url });
    } catch (err: any) {
        const detail = err?.body?.message || err?.message || err?.name || 'Unknown storage signing error';
        console.error('[presign] Generation error:', detail, err);
        if (err?.status && err?.body) throw err;
        throw error(500, `Failed to generate pre-signed URL: ${detail}`);
    }
}
