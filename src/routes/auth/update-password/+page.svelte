<script lang="ts">
    import { updatePassword } from "$lib/utils/auth";
    import { addToast } from "$lib/stores/toast";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { supabase } from "$lib/utils/supabase";
    import { Lock, ShieldCheck, Eye, EyeOff, ArrowLeft } from "lucide-svelte";

    let newPassword = $state("");
    let confirmPassword = $state("");
    let loading = $state(false);
    let errorMsg = $state("");
    let showPassword = $state(false);
    let showConfirm = $state(false);
    let sessionReady = $state(false);

    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            sessionReady = true;
        } else {
            const params = new URLSearchParams(window.location.hash.replace("#", "?"));
            if (params.get("access_token") || params.get("type") === "recovery") {
                const { data, error } = await supabase.auth.getSession();
                if (data?.session) {
                    sessionReady = true;
                } else if (error) {
                    errorMsg = "Invalid or expired reset link. Please request a new one.";
                }
            } else {
                errorMsg = "No reset session found. Please request a new password reset link.";
            }
        }
    });

    async function handleSubmit(e: Event) {
        e.preventDefault();
        if (newPassword.length < 6) {
            errorMsg = "Password must be at least 6 characters.";
            return;
        }
        if (newPassword !== confirmPassword) {
            errorMsg = "Passwords do not match.";
            return;
        }

        loading = true;
        errorMsg = "";

        const result = await updatePassword(newPassword);

        if (result.error) {
            errorMsg = result.error;
            addToast("error", result.error);
        } else {
            addToast("success", "Password updated successfully. Please sign in with your new password.");
            goto("/auth/login");
        }

        loading = false;
    }
</script>

<svelte:head>
    <title>Reset Password — CEDIMS</title>
</svelte:head>

<div class="min-h-dvh bg-gradient-to-br from-surface-muted via-surface-white to-gov-blue/5 px-4 py-8 sm:px-6 sm:py-10 lg:px-8 flex items-center justify-center">
    <div class="w-full max-w-md">
        <div class="rounded-2xl sm:rounded-3xl border border-border-subtle bg-surface-white/80 backdrop-blur-sm p-6 sm:p-8 shadow-lg">
            <div class="mb-5 sm:mb-6 text-center">
                <img src="/app_icon.png" alt="CEDIMS" class="mx-auto h-12 w-12 sm:h-14 sm:w-14 rounded-xl shadow-sm mb-3 sm:mb-4" />
                <div class="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 mb-3">
                    <ShieldCheck size={14} class="text-gov-blue" />
                    <span class="text-[10px] font-semibold uppercase tracking-wider text-gov-blue">Reset Password</span>
                </div>
                <h1 class="text-lg sm:text-xl font-semibold text-text-primary">Choose a new password</h1>
                <p class="mt-1 text-xs sm:text-sm text-text-secondary">Must be at least 6 characters.</p>
            </div>

            {#if errorMsg && !sessionReady}
                <div class="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
                    <p class="text-xs sm:text-sm font-medium text-red-600">{errorMsg}</p>
                    <a href="/auth/forgot-password" class="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-gov-blue hover:text-gov-blue-dark transition-colors">
                        Request new reset link
                    </a>
                </div>
            {:else if !sessionReady}
                <div class="flex items-center justify-center py-8">
                    <span class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gov-blue/40 border-t-gov-blue"></span>
                    <span class="ml-3 text-sm text-text-secondary font-medium">Verifying reset link...</span>
                </div>
            {:else}
                <form onsubmit={handleSubmit} class="space-y-4 sm:space-y-5">
                    <div>
                        <label for="newPassword" class="mb-1 sm:mb-1.5 block text-xs sm:text-sm font-semibold text-text-secondary">New Password</label>
                        <div class="relative">
                            <input id="newPassword" type={showPassword ? "text" : "password"} bind:value={newPassword} placeholder="At least 6 characters" class="w-full rounded-xl border border-border-subtle px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm outline-none focus:border-gov-blue focus:ring-2 focus:ring-gov-blue/10 transition-colors pr-10 sm:pr-11" autocomplete="new-password" required minlength="6" />
                            <button type="button" onclick={() => showPassword = !showPassword} class="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors p-1" tabindex="-1" aria-label={showPassword ? "Hide password" : "Show password"}>
                                {#if showPassword}<EyeOff size={16} class="sm:size-[18]" />{:else}<Eye size={16} class="sm:size-[18]" />{/if}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label for="confirmPassword" class="mb-1 sm:mb-1.5 block text-xs sm:text-sm font-semibold text-text-secondary">Confirm New Password</label>
                        <div class="relative">
                            <input id="confirmPassword" type={showConfirm ? "text" : "password"} bind:value={confirmPassword} placeholder="Re-enter new password" class="w-full rounded-xl border border-border-subtle px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm outline-none focus:border-gov-blue focus:ring-2 focus:ring-gov-blue/10 transition-colors pr-10 sm:pr-11" autocomplete="new-password" required />
                            <button type="button" onclick={() => showConfirm = !showConfirm} class="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors p-1" tabindex="-1" aria-label={showConfirm ? "Hide password" : "Show password"}>
                                {#if showConfirm}<EyeOff size={16} class="sm:size-[18]" />{:else}<Eye size={16} class="sm:size-[18]" />{/if}
                            </button>
                        </div>
                    </div>

                    {#if errorMsg}
                        <div class="rounded-xl border border-red-200 bg-red-50 p-2.5 sm:p-3 text-xs sm:text-sm font-medium text-red-600">{errorMsg}</div>
                    {/if}

                    <button type="submit" disabled={loading || !newPassword || !confirmPassword} class="w-full rounded-xl bg-gov-blue px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-gov-blue-dark disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                        {#if loading}
                            <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>
                            Updating password...
                        {:else}
                            <Lock size={16} />
                            Reset Password
                        {/if}
                    </button>
                </form>
            {/if}

            <div class="mt-6 pt-4 border-t border-slate-100 text-center">
                <a href="/auth/login" class="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-gov-blue transition-colors">
                    <ArrowLeft size={14} />
                    Back to sign in
                </a>
            </div>
        </div>
    </div>
</div>
