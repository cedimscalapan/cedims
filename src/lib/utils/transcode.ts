import { googleConvertToPdf } from './googleConvert';
import { supabase } from './supabase';
import { config } from './config';

export interface TranscodeResult {
    pdfBytes: Uint8Array;
    text?: string;
}

async function getAuthToken(): Promise<string | null> {
    try {
        const { data } = await supabase.auth.getSession();
        return data?.session?.access_token ?? null;
    } catch { }
    return null;
}

// Google Apps Script's own infrastructure occasionally serves a bare
// CORS/redirect failure (a `TypeError` from fetch() itself, no response
// body to inspect) with no relation to this file or the client — observed
// in production immediately after an identical call had just succeeded for
// a different file seconds earlier. A short retry absorbs that class of
// failure. It's deliberately narrow: a logical failure the script itself
// reports (a thrown `Error`, e.g. a bug in the deployed script, or a file
// it rejects) will fail identically on retry, so only the network-level
// `TypeError` is retried — anything else fails fast to the fallback below.
async function withGasRetry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 1500): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (!(err instanceof TypeError) || i === attempts - 1) throw err;
            await new Promise((r) => setTimeout(r, delayMs));
        }
    }
    throw lastErr;
}

async function convertViaServerProxy(file: File): Promise<Uint8Array | null> {
    const token = await getAuthToken();
    if (!token) return null;

    try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/convert', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        if (!res.ok) return null;

        if (res.headers.get('X-CEDIMS-Conversion-Fallback') === 'text-extraction' && import.meta.env.DEV) {
            console.info('[transcode] Using text extraction PDF fallback; refresh the deployed Google Apps Script for full document layout.');
        }

        const buffer = await res.arrayBuffer();
        return new Uint8Array(buffer);
    } catch {
        return null;
    }
}

export async function transcodeToPdf(file: File): Promise<TranscodeResult> {
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'pdf') {
        const buffer = await file.arrayBuffer();
        return { pdfBytes: new Uint8Array(buffer) };
    }

    if (ext === 'docx' || ext === 'doc') {
        // Route browser uploads through the SvelteKit API first. Production
        // Google Apps Script web apps do not reliably emit CORS headers for
        // direct browser fetches, while server-side fetches are not subject
        // to browser CORS and can still use the same Apps Script URL.
        const serverResult = await convertViaServerProxy(file);
        if (serverResult) {
            return { pdfBytes: serverResult };
        }

        if (!config.GOOGLE_SCRIPT_URL) {
            throw new Error('Document conversion failed. Please sign in again or configure PUBLIC_GOOGLE_SCRIPT_URL for the server converter.');
        }

        const pdfBytes = await withGasRetry(() => googleConvertToPdf(file));
        return { pdfBytes };
    }

    if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
        const { PDFDocument } = await import('pdf-lib');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const pdfDoc = await PDFDocument.create();
        const image = ext === 'png'
            ? await pdfDoc.embedPng(bytes)
            : await pdfDoc.embedJpg(bytes);
        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
        const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
        return { pdfBytes };
    }

    throw new Error(`Unsupported file type: .${ext}. Only .pdf, .docx, .doc, .jpg, .jpeg, and .png files are accepted.`);
}
