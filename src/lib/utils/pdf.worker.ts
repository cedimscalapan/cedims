/**
 * Web Worker for heavy PDF operations and hashing
 * Offloads pdf-lib and Web Crypto API from the main UI thread.
 */

import { PDFDocument } from 'pdf-lib';

// Use any to avoid TS environment conflicts with DedicatedWorkerGlobalScope
const ctx = self as any;

async function stampQrCode(pdfBytes: Uint8Array, qrBytes: Uint8Array, fileHash: string): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const qrImage = await pdfDoc.embedPng(qrBytes);

    const pageCount = pdfDoc.getPageCount();
    const lastPage = pdfDoc.getPage(pageCount - 1);
    const { width, height } = lastPage.getSize();

    const qrSize = 72; // ~1 inch
    const margin = 30;

    lastPage.drawImage(qrImage, {
        x: width - qrSize - margin,
        y: margin,
        width: qrSize,
        height: qrSize
    });

    return await pdfDoc.save();
}

self.onmessage = async (e: MessageEvent) => {
    const { type, payload, id } = e.data;

    try {
        if (type === 'STAMP_QR') {
            const { compressedBytes, qrBytes, fileHash } = payload;

            const stampedBytes = await stampQrCode(compressedBytes, qrBytes, fileHash);

            ctx.postMessage({
                id,
                success: true,
                payload: {
                    stampedBytes
                }
            }, [stampedBytes.buffer]); // zero-copy transfer
        }
    } catch (error) {
        console.error('[pdf.worker] Error:', error);
        ctx.postMessage({
            id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown worker error'
        });
    }
};
