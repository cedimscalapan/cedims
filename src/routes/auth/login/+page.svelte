<script lang="ts">
    import {
        signIn,
        getRoleDashboardPath,
        profile,
        authLoading,
    } from "$lib/utils/auth";
    import { addToast } from "$lib/stores/toast";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { env } from "$env/dynamic/public";
    import { LogIn, ShieldCheck, ArrowLeft, Eye, EyeOff } from "lucide-svelte";

    let email = $state("");
    let password = $state("");
    let loading = $state(false);
    let errorMsg = $state("");
    let showPassword = $state(false);
    let agreedToTerms = $state(false);
    // Which field the error belongs to, so it can be marked invalid and
    // focused rather than leaving the user to match a message at the bottom
    // of the form against a field at the top.
    let errorField = $state<"email" | "password" | "terms" | null>(null);
    let emailEl: HTMLInputElement | undefined = $state();
    let passwordEl: HTMLInputElement | undefined = $state();
    let termsEl: HTMLInputElement | undefined = $state();

    function fail(field: "email" | "password" | "terms" | null, message: string) {
        errorField = field;
        errorMsg = message;
        if (field === "email") emailEl?.focus();
        else if (field === "password") passwordEl?.focus();
        else if (field === "terms") termsEl?.focus();
    }

    // reCAPTCHA v2 checkbox. Rendered only when a site key is configured — an
    // unconfigured deployment must still be able to sign in rather than
    // locking every teacher out behind a widget that can never load.
    const siteKey = env.PUBLIC_RECAPTCHA_SITE_KEY;
    let captchaEl: HTMLDivElement | undefined = $state();
    let captchaWidgetId: number | null = null;
    let captchaReady = $state(false);

    $effect(() => {
        if (!$authLoading && $profile) {
            goto(getRoleDashboardPath($profile.role));
        }
    });

    onMount(() => {
        if (!siteKey) return;

        const render = () => {
            const grecaptcha = (window as any).grecaptcha;
            if (!grecaptcha?.render || !captchaEl || captchaWidgetId !== null) return;
            captchaWidgetId = grecaptcha.render(captchaEl, { sitekey: siteKey });
            captchaReady = true;
        };

        if ((window as any).grecaptcha?.render) {
            render();
            return;
        }

        // Google calls this global once api.js finishes loading.
        (window as any).onCedimsRecaptchaLoad = render;

        const script = document.createElement("script");
        script.src =
            "https://www.google.com/recaptcha/api.js?onload=onCedimsRecaptchaLoad&render=explicit";
        script.async = true;
        script.defer = true;
        script.onerror = () =>
            console.warn("[login] reCAPTCHA script failed to load — continuing without it");
        document.head.appendChild(script);
    });

    function resetCaptcha() {
        const grecaptcha = (window as any).grecaptcha;
        if (grecaptcha?.reset && captchaWidgetId !== null) grecaptcha.reset(captchaWidgetId);
    }

    async function handleSubmit(e: Event) {
        e.preventDefault();
        if (!email) {
            fail("email", "Please enter your email address.");
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            fail("email", "Please enter a valid email address.");
            return;
        }
        if (!password) {
            fail("password", "Please enter your password.");
            return;
        }
        if (password.length < 6) {
            fail("password", "Password must be at least 6 characters.");
            return;
        }
        if (!agreedToTerms) {
            fail("terms", "Please accept the Terms of Use and Privacy Notice to continue.");
            return;
        }

        loading = true;
        errorMsg = "";
        errorField = null;

        // The widget proves nothing by itself — the token is only meaningful
        // once the server checks it with Google using the secret key.
        if (siteKey && captchaReady) {
            const token = (window as any).grecaptcha?.getResponse(captchaWidgetId ?? undefined);
            if (!token) {
                fail(null, "Please complete the 'I'm not a robot' check.");
                loading = false;
                return;
            }

            try {
                const res = await fetch("/api/verify-recaptcha", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token }),
                });
                const result = await res.json();
                if (!result.success) {
                    fail(null, result.error || "Verification failed. Please try again.");
                    resetCaptcha();
                    loading = false;
                    return;
                }
            } catch {
                // Our own endpoint being unreachable shouldn't strand a teacher
                // at the login screen; the server already fails open when it
                // cannot reach Google for the same reason.
                console.warn("[login] Could not reach verification endpoint — continuing");
            }
        }

        const result = await signIn(email, password);

        if (result.error) {
            // Credentials are rejected as a pair on purpose — saying which half
            // was wrong tells an attacker which emails exist.
            fail("password", result.error);
            addToast("error", result.error);
            resetCaptcha();
        } else {
            addToast("success", "Welcome to CEDIMS.");
        }

        loading = false;
    }
</script>

<svelte:head>
    <title>Sign In: CEDIMS · Powered by Smart E-VISION</title>
</svelte:head>

<div class="login-page min-h-dvh bg-surface-muted">
    <!-- Form panel -->
    <main class="mx-auto flex w-full max-w-[410px] flex-col px-4 py-3 sm:py-4">
        <!-- Compact brand row shared by desktop and mobile. -->
        <a href="/" class="mb-3 flex items-center gap-2.5">
            <img src="/app_icon.png" alt="" class="h-8 w-8 rounded-lg" />
            <span>
                <span class="block text-sm font-semibold leading-tight text-text-primary">CEDIMS</span>
                <span class="block text-xs font-semibold uppercase leading-tight tracking-[0.22em] text-gov-blue">
                    Instructional Monitoring
                </span>
            </span>
        </a>

        <div class="mx-auto w-full max-w-md">
            <div class="login-card rounded-2xl border border-border-subtle bg-surface-white p-4 sm:p-5">
                <div class="mb-3">
                    <h1 class="text-xl font-bold tracking-tight text-text-primary">Sign in to CEDIMS</h1>
                    <p class="mt-1 text-xs text-text-secondary">
                        Use the DepEd account issued to you by the District Office.
                    </p>
                </div>

                <form onsubmit={handleSubmit} class="space-y-2.5" novalidate aria-busy={loading}>
                    <div>
                        <label for="email" class="mb-1.5 block text-sm font-semibold text-text-primary">
                            Email address
                        </label>
                        <input
                            id="email"
                            type="email"
                            bind:this={emailEl}
                            bind:value={email}
                            placeholder="your.email@deped.gov.ph"
                            class="gov-input w-full"
                            autocomplete="email"
                            inputmode="email"
                            autocapitalize="none"
                            spellcheck="false"
                            aria-invalid={errorField === "email"}
                            aria-describedby={errorField === "email" ? "login-error" : undefined}
                            required
                        />
                    </div>

                    <div>
                        <div class="mb-1.5 flex items-center justify-between gap-3">
                            <label for="password" class="block text-sm font-semibold text-text-primary">Password</label>
                            <a
                                href="/auth/forgot-password"
                                class="text-xs font-semibold text-gov-blue transition-colors hover:text-gov-blue-dark hover:underline"
                            >
                                Forgot password?
                            </a>
                        </div>
                        <div class="relative">
                            <input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                bind:this={passwordEl}
                                bind:value={password}
                                placeholder="••••••••"
                                class="gov-input w-full pr-11"
                                autocomplete="current-password"
                                aria-invalid={errorField === "password"}
                                aria-describedby={errorField === "password" ? "login-error" : undefined}
                                required
                                minlength="6"
                            />
                            <button
                                type="button"
                                onclick={() => (showPassword = !showPassword)}
                                class="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-2.5 text-text-muted transition-colors hover:text-gov-blue"
                                aria-pressed={showPassword}
                                aria-controls="password"
                                aria-label={showPassword ? "Hide entered password" : "Show entered password"}
                            >
                                {#if showPassword}
                                    <EyeOff size={18} strokeWidth={1.5} />
                                {:else}
                                    <Eye size={18} strokeWidth={1.5} />
                                {/if}
                            </button>
                        </div>
                    </div>

                    <!-- reCAPTCHA — only present when a site key is configured -->
                    {#if siteKey}
                        <div class="flex justify-center">
                            <div bind:this={captchaEl}></div>
                        </div>
                    {/if}

                    <!-- Terms & Privacy agreement -->
                    <div class="flex items-start gap-2.5 rounded-xl bg-surface-muted p-2.5">
                        <input
                            id="agree"
                            type="checkbox"
                            bind:this={termsEl}
                            bind:checked={agreedToTerms}
                            class="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong text-gov-blue focus:ring-2 focus:ring-gov-blue/40"
                            aria-invalid={errorField === "terms"}
                            aria-describedby={errorField === "terms" ? "login-error" : undefined}
                        />
                        <label for="agree" class="text-[0.7rem] leading-4 text-text-secondary">
                            I have read and agree to the
                            <a
                                href="/terms"
                                target="_blank"
                                rel="noopener"
                                class="font-semibold text-gov-blue hover:underline">Terms of Use</a
                            >
                            and
                            <a
                                href="/privacy"
                                target="_blank"
                                rel="noopener"
                                class="font-semibold text-gov-blue hover:underline">Privacy Notice</a
                            >, and I consent to the processing of my personal information under the
                            Data Privacy Act of 2012 (RA 10173).
                        </label>
                    </div>

                    <!-- Error Message -->
                    <div aria-live="assertive">
                        {#if errorMsg}
                            <p
                                id="login-error"
                                role="alert"
                                class="rounded-xl border border-gov-red/30 bg-gov-red/10 p-2 text-xs font-semibold text-gov-red-dark"
                            >
                                {errorMsg}
                            </p>
                        {/if}
                    </div>

                    <button type="submit" disabled={loading} class="gov-btn-primary w-full justify-center py-2.5 text-sm">
                        {#if loading}
                            <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>
                            <span>Signing in…</span>
                        {:else}
                            <LogIn size={18} strokeWidth={2} />
                            <span>Sign in</span>
                        {/if}
                    </button>
                </form>

                <div class="mt-3 border-t border-border-subtle pt-3 text-center">
                    <a
                        href="/"
                        class="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-gov-blue"
                    >
                        <ArrowLeft size={16} strokeWidth={2} />
                        Back to home
                    </a>
                </div>
            </div>

            <p class="mt-3 flex items-center justify-center gap-2 text-xs text-text-muted">
                <ShieldCheck size={14} strokeWidth={2} class="shrink-0 text-gov-blue" />
                Accounts are issued by the Calapan East District Office.
            </p>
        </div>
    </main>
</div>

<style>
    .login-page { font-family: var(--font-family-sans, "Segoe UI", sans-serif); }
    .login-card { border-top: 3px solid var(--color-gov-blue); }
    :global(.login-page .gov-input) {
        min-height: 44px;
        padding-block: .55rem;
    }
</style>
