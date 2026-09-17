import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

// Create a resilient storage adapter that doesn't block on locks
class ReslientStorage implements Storage {
    private data = new Map<string, string>();

    getItem(key: string): string | null {
        try {
            // Try localStorage first for persistence
            if (typeof window !== 'undefined' && window.localStorage) {
                return window.localStorage.getItem(key);
            }
        } catch (e) {
            console.warn('[v0] localStorage access failed:', e);
        }
        // Fall back to in-memory storage
        return this.data.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.data.set(key, value);
        try {
            // Try to persist to localStorage without blocking
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem(key, value);
            }
        } catch (e) {
            console.warn('[v0] localStorage write failed:', e);
        }
    }

    removeItem(key: string): void {
        this.data.delete(key);
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.removeItem(key);
            }
        } catch (e) {
            console.warn('[v0] localStorage remove failed:', e);
        }
    }

    clear(): void {
        this.data.clear();
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.clear();
            }
        } catch (e) {
            console.warn('[v0] localStorage clear failed:', e);
        }
    }

    key(index: number): string | null {
        const keys = Array.from(this.data.keys());
        return keys[index] ?? null;
    }

    get length(): number {
        return this.data.size;
    }
}

const supabaseUrl = env.PUBLIC_SUPABASE_URL;
const supabaseKey = env.PUBLIC_SUPABASE_ANON_KEY;

if ((!supabaseUrl || !supabaseKey) && typeof window !== 'undefined') {
    console.error(
        '[CEDIMS] Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY environment variables. ' +
        'Set them in your .env file. The app will not function correctly without them.'
    );
}

// Use fallbacks only as last resort (local dev)
const resolvedUrl = supabaseUrl || 'http://localhost:54321';
const resolvedKey = supabaseKey || 'mock-key';

export const supabase = createClient(
    resolvedUrl,
    resolvedKey,
    {
        auth: {
            debug: false,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            flowType: 'pkce',
            storage: new ReslientStorage(),
            storageKey: 'sb-auth-token-v3',
            lock: (name: string, acquireTimeout: number, callback: () => Promise<any>) => {
                return callback();
            }
        },
        global: {
            headers: {
                'X-Client-Info': 'cedims'
            }
        }
    }
);

/** Typed data helper — extract rows from a Supabase response with proper typing */
export function getRows<T>(data: any): T[] {
    return (data as T[]) || [];
}

/** Typed single-row helper */
export function getRow<T>(data: any): T | null {
    return (data as T) || null;
}

