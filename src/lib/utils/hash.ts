/**
 * SHA-256 Hashing — Web Crypto API
 * Runs entirely in the browser, zero server cost.
 */

export async function computeHash(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    return hashFromBuffer(buffer);
}

export async function hashFromBuffer(buffer: ArrayBuffer | Uint8Array): Promise<string> {
    // 1. Ensure we have a valid BufferSource (Uint8Array is a safe wrapper)
    const input = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

    // 2. Check for Crypto API availability
    if (!crypto?.subtle) {
        throw new Error('Security Error: Cryptographic hashing requires a secure context (HTTPS).');
    }

    try {
        const hashBuffer = await crypto.subtle.digest('SHA-256', input as any);
        const hashArray = new Uint8Array(hashBuffer);

        // 3. Optimized hex conversion (avoiding large intermediate arrays)
        let hashHex = '';
        for (let i = 0; i < hashArray.length; i++) {
            hashHex += hashArray[i].toString(16).padStart(2, '0');
        }
        return hashHex;
    } catch (err) {
        console.error('[hash] Digest calculation failed:', err);
        throw new Error('Hashing failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
}
