/**
 * QR-Digest Stamping — qrcode + pdf-lib
 * Generates a verification QR code and embeds it onto the first page of a PDF.
 * Creates a "Smart Document" that is verifiable even when printed.
 */

import { PDFDocument } from 'pdf-lib';
import { config } from './config';


export async function generateQrPng(fileHash: string, appUrl: string = ''): Promise<Uint8Array> {
    const QRCode = (await import('qrcode')).default;
    const baseUrl = appUrl || config.APP_URL;
    const verifyUrl = `${baseUrl}/verify/${fileHash}`;

    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        width: 100,
        margin: 1,
        color: {
            dark: '#000000', // Changed to Black
            light: '#FFFFFF'
        }
    });

    const qrBase64 = qrDataUrl.split(',')[1];
    return Uint8Array.from(atob(qrBase64), (c) => c.charCodeAt(0));
}

/**
 * @deprecated Use generateQrPng + Worker for better performance
 */
export async function stampQrCode(
    pdfBytes: Uint8Array,
    fileHash: string,
    appUrl: string = ''
): Promise<Uint8Array> {
    const qrBytes = await generateQrPng(fileHash, appUrl);

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const qrImage = await pdfDoc.embedPng(qrBytes);

    const pageCount = pdfDoc.getPageCount();
    const lastPage = pdfDoc.getPage(pageCount - 1); // Use the last page
    const { width, height } = lastPage.getSize();

    const qrSize = 72;
    const margin = 30;

    lastPage.drawImage(qrImage, {
        x: width - qrSize - margin,
        y: margin,
        width: qrSize,
        height: qrSize
    });

    // Removed the 'Verify' text as requested

    return pdfDoc.save();
}
