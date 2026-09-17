import { config } from './config';

/**
 * Google Apps Script Conversion Utility
 * Converts DOCX/DOC files to PDF using a custom Google Apps Script deployment.
 * Provides a high free limit (2,000/day) compared to CloudConvert.
 */
export async function googleConvertToPdf(file: File): Promise<Uint8Array> {
    if (!config.GOOGLE_SCRIPT_URL) {
        throw new Error('Google Script URL is missing. Please deploy google_apps_script.js and add PUBLIC_GOOGLE_SCRIPT_URL to your .env file.');
    }

    console.log(`[google-convert] Converting ${file.name} to PDF via Google Apps Script...`);

    // 1. Convert File to Base64
    const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]); // Strip data:application/...;base64,
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    // 2. Call the GAS Web App
    const response = await fetch(config.GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain' // Using text/plain to avoid CORS preflight (GAS handles it better)
        },
        body: JSON.stringify({
            fileName: file.name,
            base64Data: base64Data
        })
    });

    if (!response.ok) {
        throw new Error(`Google Script conversion failed: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
        throw new Error(`Google Script error: ${result.error || 'Unknown error'}`);
    }

    // 3. Decode response back to Uint8Array (Optimized for Mobile)
    const binaryString = atob(result.pdfBase64);
    const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));

    console.log(`[google-convert] Conversion successful: ${(bytes.byteLength / 1024).toFixed(0)}KB`);
    return bytes;
}
