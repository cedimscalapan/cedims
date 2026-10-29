import { writable } from 'svelte/store';

// Only one floating panel can be open at a time.
export const supportTool = writable<'zoom' | 'chat' | null>(null);
