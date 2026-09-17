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
    import { LogIn, ShieldCheck, ArrowLeft, Eye, EyeOff, CheckCircle2 } from "lucide-svelte";

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
    <title>Sign In — CEDIMS · Powered by Smart E-VISION</title>
</svelte:head>

<div class="min-h-dvh bg-surface-muted lg:grid lg:grid-cols-[1fr_1.1fr] xl:grid-cols-[1fr_1fr]">
    <!-- Brand panel — fills the viewport on desktop so the form never floats
         in empty space; collapses to a compact header strip on small screens. -->
    <aside class="relative hidden overflow-hidden bg-gov-blue px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-14">
        <div
            class="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-2xl"
            aria-hidden="true"
        ></div>
        <div
            class="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-black/10 blur-2xl"
            aria-hidden="true"
        ></div>

        <a href="/" class="relative flex items-center gap-3">
            <img src="/app_icon.png" alt="" class="h-10 w-10 rounded-lg bg-white/95 p-1" />
            <span>
                <span class="block text-sm font-semibold leading-tight">CEDIMS</span>
                <span class="block text-[10px] font-semibold uppercase leading-tight tracking-[0.22em] text-slate-200">
                    Instructional Monitoring
                </span>
            </span>
        </a>

        <div class="relative max-w-md">
            <p class="text-3xl font-bold leading-[1.2] tracking-tight xl:text-4xl">
                Monitor instruction,<br />support learning.
            </p>
            <p class="mt-4 text-base leading-8 text-slate-100">
                Submit Daily Lesson Logs, record checking remarks, and follow district
                compliance — all against one set of records.
            </p>

            <ul class="mt-8 space-y-3.5">
                {#each [
                    "Daily Lesson Log submission and checking",
                    "Remarks and revisions kept in full history",
                    "QR-verifiable documents, offline-ready uploads",
                ] as item}
                    <li class="flex items-start gap-3 text-sm text-slate-100">
                        <CheckCircle2 size={18} strokeWidth={2} class="mt-0.5 shrink-0 text-white" />
                        <span>{item}</span>
                    </li>
                {/each}
            </ul>
        </div>

        <div class="relative flex items-center gap-4 rounded-2xl bg-white/10 p-4">
            <img
                src="/sdg-4-quality-education.svg"
                alt="United Nations Sustainable Development Goal 4: Quality Education"
                width="64"
                height="64"
                class="h-16 w-16 shrink-0 rounded-lg"
            />
            <p class="text-xs leading-6 text-slate-100">
                Built to support <span class="font-semibold text-white">UN Sustainable Development Goal 4</span>
                — inclusive and equitable quality education.
            </p>
        </div>
    </aside>

    <!-- Form panel -->
    <main class="flex min-h-dvh flex-col px-4 py-8 sm:px-6 sm:py-10 lg:min-h-0 lg:justify-center lg:px-10 lg:py-12">
        <!-- Mobile brand row — the aside is hidden at this width -->
        <a href="/" class="mb-8 flex items-center gap-2.5 lg:hidden">
            <img src="/app_icon.png" alt="" class="h-9 w-9 rounded-lg" />
            <span>
                <span class="block text-sm font-semibold leading-tight text-text-primary">CEDIMS</span>
                <span class="block text-[10px] font-semibold uppercase leading-tight tracking-[0.22em] text-gov-blue">
                    Instructional Monitoring
                </span>
            </span>
        </a>

        <div class="mx-auto w-full max-w-md">
            <div class="rounded-2xl border border-border-subtle bg-surface-white p-6 shadow-sm sm:p-8">
                <div class="mb-7">
                    <h1 class="text-2xl font-bold tracking-tight text-text-primary">Sign in to CEDIMS</h1>
                    <p class="mt-1.5 text-sm text-text-secondary">
                        Use the DepEd account issued to you by the District Office.
                    </p>
                </div>

                <form onsubmit={handleSubmit} class="space-y-5" novalidate aria-busy={loading}>
                    <div>
                        <label for="email" class="mb-2 block text-sm font-semibold text-text-primary">
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
                        <div class="mb-2 flex items-center justify-between gap-3">
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
                                class="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-muted transition-colors hover:text-gov-blue"
                                aria-pressed={showPassword}
                                aria-controls="password"
                                aria-label={showPassword ? "Hide password" : "Show password"}
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
                    <div class="flex items-start gap-2.5 rounded-xl bg-surface-muted p-3.5">
                        <input
                            id="agree"
                            type="checkbox"
                            bind:this={termsEl}
                            bind:checked={agreedToTerms}
                            class="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong text-gov-blue focus:ring-2 focus:ring-gov-blue/40"
                            aria-invalid={errorField === "terms"}
                            aria-describedby={errorField === "terms" ? "login-error" : undefined}
                        />
                        <label for="agree" class="text-xs leading-5 text-text-secondary">
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
                                class="rounded-xl border border-gov-red/30 bg-gov-red/10 p-3 text-sm font-semibold text-gov-red"
                            >
                                {errorMsg}
                            </p>
                        {/if}
                    </div>

                    <button type="submit" disabled={loading} class="gov-btn-primary w-full justify-center py-3 text-sm">
                        {#if loading}
                            <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>
                            <span>Signing in…</span>
                        {:else}
                            <LogIn size={18} strokeWidth={2} />
                            <span>Sign in</span>
                        {/if}
                    </button>
                </form>

                <div class="mt-6 border-t border-border-subtle pt-5 text-center">
                    <a
                        href="/"
                        class="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-gov-blue"
                    >
                        <ArrowLeft size={16} strokeWidth={2} />
                        Back to home
                    </a>
                </div>
            </div>

            <p class="mt-6 flex items-center justify-center gap-2 text-xs text-text-muted">
                <ShieldCheck size={14} strokeWidth={2} class="shrink-0 text-gov-blue" />
                Accounts are issued by the Calapan East District Office.
            </p>
        </div>
    </main>
</div>
