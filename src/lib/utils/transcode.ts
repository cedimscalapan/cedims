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
        // Per .env.example: PUBLIC_GOOGLE_SCRIPT_URL is the primary engine
        // when configured, with the server-side LibreOffice proxy as a
        // fallback for deployments without it. Serverless hosts (Vercel)
        // don't ship a LibreOffice binary, so trying the server proxy first
        // here meant every conversion round-tripped through a guaranteed
        // 500 before falling back to the engine that actually works.
        //
        // A logical failure (the script's own reported error) is tried at
        // most once — see withGasRetry for why retrying a network-level
        // failure is worth it but retrying a script-reported one isn't.
        // Falling back to the server proxy after that wastes a round trip
        // (it has no LibreOffice binary on Vercel) but costs little and
        // covers deployments that do have a working server-side engine.
        if (config.GOOGLE_SCRIPT_URL) {
            try {
                const pdfBytes = await withGasRetry(() => googleConvertToPdf(file));
                return { pdfBytes };
            } catch (err) {
                console.warn('[transcode] Google Apps Script conversion failed, trying server proxy:', err);
                const serverResult = await convertViaServerProxy(file);
                if (serverResult) {
                    return { pdfBytes: serverResult };
                }
                throw err;
            }
        }

        const serverResult = await convertViaServerProxy(file);
        if (serverResult) {
            return { pdfBytes: serverResult };
        }

        const pdfBytes = await googleConvertToPdf(file);
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
