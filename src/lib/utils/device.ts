/**
 * Device class detection.
 *
 * Phones and tablets take the local-first upload path (see pipeline.ts): all
 * processing happens on-device, the document is queued, success is reported,
 * and the transfer to the server happens in the background. Because that path
 * is the norm on mobile rather than an exception, its background-sync plumbing
 * is not surfaced there — a teacher who has been told their document is
 * archived shouldn't then be shown a stream of sync notices implying otherwise.
 */
export function isMobileDevice(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /iPhone|iPad|iPod|Android|Mobile|Silk|Kindle|BlackBerry|Opera Mini|IEMobile/i.test(navigator.userAgent);
}
