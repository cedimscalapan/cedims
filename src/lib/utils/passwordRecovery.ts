/** Explicitly consume recovery callbacks; normal sign-in URL detection stays enabled elsewhere. */
const RESET_ERROR = 'This reset link is invalid or expired. Please request a new link.';

export async function establishRecoverySession(auth: any, href: string): Promise<void> {
    const url = new URL(href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    if (url.searchParams.has('error') || fragment.has('error') ||
        url.searchParams.has('error_code') || fragment.has('error_code')) throw new Error(RESET_ERROR);

    let response: any;
    if (url.searchParams.has('token_hash')) {
        if (url.searchParams.get('type') !== 'recovery') throw new Error(RESET_ERROR);
        response = await auth.verifyOtp({ token_hash: url.searchParams.get('token_hash'), type: 'recovery' });
    } else if (url.searchParams.has('code')) {
        response = await auth.exchangeCodeForSession(url.searchParams.get('code'));
    } else if (fragment.get('type') === 'recovery' && fragment.get('access_token') && fragment.get('refresh_token')) {
        response = await auth.setSession({ access_token: fragment.get('access_token'), refresh_token: fragment.get('refresh_token') });
    } else {
        throw new Error('Please open the password reset link from your email.');
    }
    if (response.error || !response.data?.session) throw new Error(RESET_ERROR);
    // Confirm the session against Auth, rather than trusting cached browser identity.
    const { data, error } = await auth.getUser();
    if (error || !data?.user) throw new Error(RESET_ERROR);
}

export async function recoveryRequest<T>(request: () => PromiseLike<T>, timeoutMs = 25000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            Promise.resolve().then(request),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('The request timed out. Check your connection and try again.')), timeoutMs);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}
