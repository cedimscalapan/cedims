import { googleConvertToPdf } from './googleConvert';
import { supabase } from './supabase';

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
