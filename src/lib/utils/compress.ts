/**
 * Client-Side Compression
 * Automatically compresses files larger than 1MB to optimize storage.
 * Uses browser-image-compression for images and pdf-lib for PDFs.
 */

const MAX_SIZE_BYTES = 1024 * 1024; // 1MB ideal target
const COMPRESSION_QUALITY = 0.6; // 60% quality for compression
const ABSOLUTE_MAX_SIZE = 10 * 1024 * 1024; // 10MB absolute limit (before compression attempt)

export async function compressFile(
    pdfBytes: Uint8Array,
    _maxSizeKb: number = 1024
): Promise<Uint8Array> {
    // If already under limit, return as-is
    if (pdfBytes.byteLength <= MAX_SIZE_BYTES) {
        console.log(
            `[compress] File is ${(pdfBytes.byteLength / 1024).toFixed(0)}KB, ` +
            `within ${MAX_SIZE_BYTES / 1024}KB target.`
        );
        return pdfBytes;
    }

    console.log(
        `[compress] PDF is ${(pdfBytes.byteLength / 1024).toFixed(0)}KB, ` +
        `exceeds ${MAX_SIZE_BYTES / 1024}KB target. Attempting compression...`
    );

    try {
        const compressed = await compressPdfContent(pdfBytes);
        console.log(
            `[compress] Compression result: ${(compressed.byteLength / 1024).toFixed(0)}KB ` +
            `(${((1 - compressed.byteLength / pdfBytes.byteLength) * 100).toFixed(1)}% reduction)`
        );
        return compressed;
    } catch (err) {
        console.error('[compress] Compression failed, returning original:', err);
        return pdfBytes;
    }
}

async function compressPdfContent(pdfBytes: Uint8Array): Promise<Uint8Array> {
    const initialSize = pdfBytes.byteLength;
    const initialSizeMB = (initialSize / (1024 * 1024)).toFixed(2);

    console.log(`[compress] Starting optimization on ${initialSizeMB}MB PDF...`);

    try {
        const { PDFDocument } = await import('pdf-lib');
        const pdfDoc = await PDFDocument.load(pdfBytes);

        // --- REMOVED AUTO-SCALING (WBS Bug Fix) ---
        // We no longer scale pages to A4 to prevent "shrinking" content.
        // We only apply object-level compression.

        // Perform a single pass of standard compression
        const compressedBytes = await pdfDoc.save({
            useObjectStreams: true,
            compress: true,
            objectsPerTick: 50
        } as any);

        const finalSize = compressedBytes.byteLength;
        const finalSizeMB = (finalSize / (1024 * 1024)).toFixed(2);
        const reduction = ((1 - finalSize / initialSize) * 100).toFixed(1);

        console.log(
            `[compress] [OK] Process complete: ${initialSizeMB}MB → ${finalSizeMB}MB (${reduction}% reduction)`
        );

        return compressedBytes;
    } catch (err) {
        console.error('[compress] Optimization failed:', err);
        throw err;
    }
}

export async function compressImage(file: File, maxSizeKb: number = 1024): Promise<File> {
    if (file.size <= maxSizeKb * 1024) {
        console.log(
            `[compress] Image is ${(file.size / 1024).toFixed(0)}KB, ` +
            `within ${maxSizeKb}KB target.`
        );
        return file;
    }

    console.log(
        `[compress] Image is ${(file.size / 1024).toFixed(0)}KB, ` +
        `exceeds ${maxSizeKb}KB target. Compressing...`
    );

    const imageCompression = (await import('browser-image-compression')).default;

    return await imageCompression(file, {
        maxSizeMB: maxSizeKb / 1024,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: file.type as string
    });
}
