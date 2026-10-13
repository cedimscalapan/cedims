import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabase } from '$lib/utils/supabase';

const ILOVE_API_BASE = 'https://api.ilovepdf.com/v1';
const COMPRESS_THRESHOLD_BYTES = 4 * 1024 * 1024;

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

function taskServerBase(server: string): string {
    return `https://${server}/v1`;
}

async function iloveFetch(baseUrl: string, path: string, token: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(init.headers || {})
        }
    });
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

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof Blob)) throw error(400, 'Missing PDF file.');
    if (file.type !== 'application/pdf') throw error(415, 'Only PDF files can be compressed.');
    if (file.size <= COMPRESS_THRESHOLD_BYTES) return new Response(file, {
        headers: {
            'Content-Type': 'application/pdf',
            'X-Compression-Skipped': 'true'
        }
    });

    const fileName = file instanceof File ? file.name : 'document.pdf';

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

        const startResponse = await iloveFetch(ILOVE_API_BASE, '/start/compress', iloveToken, { method: 'GET' });
        if (!startResponse.ok) {
            throw new Error(await readErrorMessage(startResponse, 'Could not start PDF compression.'));
        }
        const task = await startResponse.json();
        const server = task?.server;
        const taskId = task?.task;
        if (!server || !taskId) throw new Error('The PDF compression service did not return a valid task.');

        const uploadData = new FormData();
        uploadData.append('task', taskId);
        uploadData.append('file', file, fileName);

        const taskBase = taskServerBase(server);
        const uploadResponse = await iloveFetch(taskBase, '/upload', iloveToken, {
            method: 'POST',
            body: uploadData
        });
        if (!uploadResponse.ok) {
            throw new Error(await readErrorMessage(uploadResponse, 'Could not upload PDF for compression.'));
        }
        const uploadBody = await uploadResponse.json();
        const serverFilename = uploadBody?.server_filename;
        if (!serverFilename) throw new Error('The PDF compression service did not accept the file.');

        const processResponse = await iloveFetch(taskBase, '/process', iloveToken, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task: taskId,
                tool: 'compress',
                files: [{ server_filename: serverFilename, filename: fileName }],
                compression_level: 'recommended'
            })
        });
        if (!processResponse.ok) {
            throw new Error(await readErrorMessage(processResponse, 'Could not compress PDF.'));
        }

        const downloadResponse = await iloveFetch(taskBase, `/download/${taskId}`, iloveToken, { method: 'GET' });
        if (!downloadResponse.ok) {
            throw new Error(await readErrorMessage(downloadResponse, 'Could not download compressed PDF.'));
        }

        const compressed = await downloadResponse.arrayBuffer();
        return new Response(compressed, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${fileName.replace(/"/g, '')}"`,
                'X-Original-Size': String(file.size),
                'X-Compressed-Size': String(compressed.byteLength)
            }
        });
    } catch (err: any) {
        console.error('[pdf-compress] iLovePDF compression failed:', err);
        throw error(502, err?.message || 'PDF compression failed. Please try again.');
    }
}
