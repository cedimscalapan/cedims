import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

/**
 * Server-side reCAPTCHA verification.
 *
 * The widget on the login page proves nothing on its own — anyone can call
 * Supabase auth directly without ever rendering it. The token it produces is
 * only meaningful once Google confirms it here, with the secret key, which
 * must never reach the browser.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
    const secret = env.RECAPTCHA_SECRET_KEY;

    // Not configured: report it plainly rather than pretending to verify.
    // The login page treats this as "captcha disabled" and still signs the
    // user in, because locking every teacher out of a live system is worse
    // than running without the captcha until the keys are added.
    if (!secret) {
        console.warn('[recaptcha] RECAPTCHA_SECRET_KEY is not set — verification skipped');
        return json({ success: true, skipped: true });
    }

    let token: string | undefined;
    try {
        ({ token } = await request.json());
    } catch {
        return json({ success: false, error: 'Malformed request.' }, { status: 400 });
    }

    if (!token) {
        return json({ success: false, error: 'Please complete the verification.' }, { status: 400 });
    }

    try {
        const body = new URLSearchParams({
            secret,
            response: token,
            remoteip: getClientAddress(),
        });

        const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });

        const result = await res.json();

        if (!result.success) {
            // Google's codes name our own misconfiguration as often as a bad
            // token, so they go to the log; the caller gets something a person
            // can act on.
            console.warn('[recaptcha] Verification rejected:', result['error-codes']);
            return json(
                { success: false, error: 'Verification failed. Please try again.' },
                { status: 400 },
            );
        }

        return json({ success: true });
    } catch (err) {
        // Google unreachable is our problem, not the teacher's. Failing the
        // login here would make an outage at Google an outage for the whole
        // district, so this reports the failure and lets the sign-in proceed.
        console.error('[recaptcha] Could not reach Google siteverify:', err);
        return json({ success: true, skipped: true });
    }
};
