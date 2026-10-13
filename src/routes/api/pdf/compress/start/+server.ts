import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabase } from '$lib/utils/supabase';

const ILOVE_API_BASE = 'https://api.ilovepdf.com/v1';

function getIlovePublicKey(): string {
    return (
        env.ILOVEPDF_PUBLIC_KEY ||
        env.ILOVE_PDF_PUBLIC_KEY ||
        env.ILOVE_PUBLIC_KEY ||
        ''
    ).trim();
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
    try {
        const body = await response.json();
        return body?.message || body?.error?.message || fallback;
    } catch {
        const text = await response.text().catch(() => '');
        return text || fallback;
    }
}

export async function POST({ request }) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) throw error(401, 'Unauthorized');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw error(401, 'Unauthorized');

    const publicKey = getIlovePublicKey();
    if (!publicKey) {
        throw error(500, 'PDF compression is not configured. Add ILOVEPDF_PUBLIC_KEY to the server environment.');
    }

    try {
        const authResponse = await fetch(`${ILOVE_API_BASE}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public_key: publicKey })
        });
        if (!authResponse.ok) {
            throw new Error(await readErrorMessage(authResponse, 'Could not connect to the PDF compression service.'));
        }
        const authBody = await authResponse.json();
        const iloveToken = authBody?.token;
        if (!iloveToken) throw new Error('The PDF compression service did not return an access token.');

        const startResponse = await fetch(`${ILOVE_API_BASE}/start/compress`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${iloveToken}` }
        });
        if (!startResponse.ok) {
            throw new Error(await readErrorMessage(startResponse, 'Could not start PDF compression.'));
        }

        const task = await startResponse.json();
        if (!task?.server || !task?.task) {
            throw new Error('The PDF compression service did not return a valid task.');
        }

        return json({
            token: iloveToken,
            task: task.task,
            server: task.server,
            baseUrl: `https://${task.server}/v1`
        });
    } catch (err: any) {
        console.error('[pdf-compress-start] iLovePDF task start failed:', err);
        throw error(502, err?.message || 'Could not start PDF compression.');
    }
}
