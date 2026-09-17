// ═══════════════════════════════════════════════════════════════
// SvelteKit Server Hook — hooks.server.ts
// CEDIMS — Calapan East District Instructional Monitoring System
// ═══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import type { Handle } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';

export const handle: Handle = async ({ event, resolve }) => {
    // Extract Bearer token from Authorization header
    const authHeader = event.request.headers.get('authorization') ?? '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    // Create a per-request Supabase client (lightweight — Supabase uses HTTP REST)
    const supabaseServer = createClient(env.PUBLIC_SUPABASE_URL ?? '', env.PUBLIC_SUPABASE_ANON_KEY ?? '', {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
        },
    });

    event.locals.supabase = supabaseServer;
    event.locals.user = null;
    event.locals.authToken = null;

    // Validate token via getUser() — this is the correct server-side pattern.
    // getSession() always returns null on a fresh server client (no localStorage/cookie).
    if (accessToken) {
        try {
            const { data, error } = await supabaseServer.auth.getUser(accessToken);
            if (!error && data?.user) {
                event.locals.user = data.user;
                event.locals.authToken = accessToken;
            }
        } catch (e) {
            // Network issues should not crash the request;
            // endpoint handlers will re-verify tokens if needed.
        }
    }

    return resolve(event);
};
