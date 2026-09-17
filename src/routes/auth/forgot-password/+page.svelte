<script lang="ts">
    import { resetPasswordForEmail } from "$lib/utils/auth";
    import { addToast } from "$lib/stores/toast";
    import { Mail, CheckCircle2, ArrowLeft } from "lucide-svelte";

    let email = $state("");
    let loading = $state(false);
    let sent = $state(false);
    let errorMsg = $state("");

    async function handleSubmit(e: Event) {
        e.preventDefault();
        if (!email) {
            errorMsg = "Please enter your email address.";
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errorMsg = "Please enter a valid email address.";
            return;
        }

        loading = true;
        errorMsg = "";

        const result = await resetPasswordForEmail(email);

        if (result.error) {
            errorMsg = result.error;
            addToast("error", result.error);
        } else {
            sent = true;
            addToast("success", "Password reset link sent to your email.");
        }

        loading = false;
    }
</script>

<svelte:head>
    <title>Forgot Password — CEDIMS</title>
</svelte:head>

<div class="min-h-dvh bg-gradient-to-br from-gov-blue/5 via-surface-white to-surface-muted px-4 py-8 sm:px-6 sm:py-12 lg:px-8 flex items-center justify-center">
    <div class="w-full max-w-md">
        <div class="rounded-2xl border border-border-subtle bg-surface-white backdrop-blur-sm p-6 sm:p-8 shadow-xl">
            <!-- Header -->
            <div class="mb-7 sm:mb-8 text-center">
                <div class="mx-auto w-16 h-16 bg-surface-white border border-border-subtle rounded-2xl flex items-center justify-center shadow-lg mb-4">
                    <img src="/app_icon.png" alt="CEDIMS — DepEd Calapan East District" class="h-12 w-12 object-contain" />
                </div>

                {#if sent}
                    <div class="inline-flex items-center gap-2 rounded-lg bg-gov-green/20 border border-gov-green/40 px-4 py-2 mb-4">
                        <CheckCircle2 size={16} class="text-gov-green" strokeWidth={2.5} />
                        <span class="text-xs font-bold uppercase tracking-wider text-gov-green">Email Sent</span>
                    </div>
                    <h1 class="text-xl sm:text-2xl font-bold text-text-primary">Check your inbox</h1>
                    <p class="mt-2.5 text-sm text-text-secondary leading-relaxed">
                        We sent a password reset link to<br class="sm:hidden" />
                        <strong class="text-text-primary">{email}</strong>.<br class="hidden sm:block" />
                        <br class="hidden sm:block" />
                        Click the link in the email to reset your password. The link expires in 1 hour.
                    </p>
                {:else}
                    <h1 class="text-xl sm:text-2xl font-bold text-text-primary">Forgot password?</h1>
                    <p class="mt-2 text-sm text-text-secondary">
                        Enter your email address and we'll send you a password reset link.
                    </p>
                {/if}
            </div>

            <!-- Form -->
            {#if !sent}
                <form onsubmit={handleSubmit} class="space-y-5 sm:space-y-6">
                    <!-- Email Input -->
                    <div>
                        <label for="email" class="mb-2 block text-sm font-semibold text-text-primary">
                            Email Address
                        </label>
                        <input
                            id="email"
                            type="email"
                            bind:value={email}
                            placeholder="your.email@deped.gov.ph"
                            class="gov-input w-full"
                            autocomplete="email"
                            required
                        />
                    </div>

                    <!-- Error Message -->
                    {#if errorMsg}
                        <div class="rounded-lg border border-gov-red/30 bg-gov-red/10 p-3 sm:p-4 text-sm font-semibold text-gov-red">
                            {errorMsg}
                        </div>
                    {/if}

                    <!-- Submit Button -->
                    <button
                        type="submit"
                        disabled={loading}
                        class="gov-btn-primary w-full justify-center text-sm"
                    >
                        {#if loading}
                            <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>
                            <span>Sending link...</span>
                        {:else}
                            <Mail size={18} strokeWidth={2} />
                            <span>Send Reset Link</span>
                        {/if}
                    </button>
                </form>
            {/if}

            <!-- Footer -->
            <div class="mt-6 pt-6 border-t border-border-subtle text-center">
                <a href="/auth/login" class="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-gov-blue transition-colors">
                    <ArrowLeft size={16} strokeWidth={2} />
                    Back to sign in
                </a>
            </div>
        </div>
    </div>
</div>
