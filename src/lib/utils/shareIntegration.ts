/**
 * Native Share & File Handling Utility (Web Share API)
 * Innovative Feature: Phase 4.5 implementation.
 * Enables seamless integration with mobile OS sharing features (Viber, Messenger, etc.) 
 * without third-party SDKs.
 */

/**
 * Share verification results or documents via the native OS share sheet.
 */
export async function shareContent({ title, text, url, files }: { title: string, text?: string, url?: string, files?: File[] }) {
    if (typeof navigator === 'undefined' || !navigator.share) {
        console.warn('Web Share API not supported in this browser');

        // Fallback: Copy to clipboard if it's just a URL/Text
        if (url || text) {
            try {
                await navigator.clipboard.writeText(url || text || '');
                return { success: true, method: 'clipboard' };
            } catch (e) {
                return { success: false, error: 'Clipboard access denied' };
            }
        }
        return { success: false, error: 'Sharing not supported' };
    }

    try {
        const shareData: ShareData = { title, text, url };

        // Check if files can be shared
        if (files && files.length > 0 && navigator.canShare && navigator.canShare({ files })) {
            shareData.files = files;
        }

        await navigator.share(shareData);
        return { success: true, method: 'native' };
    } catch (err) {
        // User cancelled or other error
        if ((err as Error).name !== 'AbortError') {
            console.error('Share failed:', err);
        }
        return { success: false, error: (err as Error).message };
    }
}

/**
 * Share a document verification link specifically.
 */
export async function shareVerification(hash: string, fileName: string) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/verify/${hash}`;

    return shareContent({
        title: 'CEDIMS: Verified Document',
        text: `Official Record: ${fileName}\nIntegrity Hash: ${hash}\n\nVerify this document at:`,
        url
    });
}
