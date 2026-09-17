import { writable } from 'svelte/store';

/**
 * Global state for the QR Scanner visibility.
 * Can be triggered from MobileTabBar or Dashboard.
 */
export const showQRScanner = writable<boolean>(false);
