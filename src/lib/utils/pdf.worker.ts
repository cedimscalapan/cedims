/**
 * Web Worker for heavy PDF operations and hashing
 * Offloads pdf-lib and Web Crypto API from the main UI thread.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Use any to avoid TS environment conflicts with DedicatedWorkerGlobalScope
const ctx = self as any;

async function hashPdf(buffer: ArrayBuffer | Uint8Array): Promise<string> {
    const input = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const hashBuffer = await self.crypto.subtle.digest('SHA-256', input.buffer as ArrayBuffer);
    const hashArray = new Uint8Array(hashBuffer);

    let hashHex = '';
    for (let i = 0; i < hashArray.length; i++) {
        hashHex += hashArray[i].toString(16).padStart(2, '0');
    }
    return hashHex;
}

async function compressPdf(pdfBytes: Uint8Array): Promise<Uint8Array> {
    const MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100MB (effective 'no limit')

    if (pdfBytes.byteLength <= MAX_SIZE_BYTES) {
        return pdfBytes;
    }

    const pdfDoc = await PDFDocument.load(pdfBytes);

    const compressedBytes = await pdfDoc.save({
        useObjectStreams: true,
        compress: true,
        objectsPerTick: 50
    } as any);

    return compressedBytes;
}

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
        if (type === 'COMPRESS_AND_HASH') {
            const { pdfBytes } = payload;

            const compressedBytes = await compressPdf(pdfBytes);

            // Hash the original bytes, not the compressed output, so compression metadata changes don't create unique hashes for renamed duplicates
            const fileHash = await hashPdf(pdfBytes);

            ctx.postMessage({
                id,
                success: true,
                payload: {
                    compressedBytes,
                    fileHash
                }
            }, [compressedBytes.buffer]); // zero-copy transfer
        } else if (type === 'STAMP_QR') {
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
