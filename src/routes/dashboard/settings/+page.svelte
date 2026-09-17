<script lang="ts">
    import { profile, user, signOut } from "$lib/utils/auth";
    import { addToast } from "$lib/stores/toast";
    import { goto } from "$app/navigation";
    import { supabase } from "$lib/utils/supabase";
    import { getQueueSize } from "$lib/utils/offline";
    import { onMount } from "svelte";
    import ProfileUploader from "$lib/components/ProfileUploader.svelte";
    import { User, Shield, Phone, Bell, Languages, ShieldCheck, LogOut, Key, Eye, EyeOff } from "lucide-svelte";

    let fullName = $state("");
    let avatarUrl = $state<string | null>(null);
    let saving = $state(false);
    let queueCount = $state(0);
    let voiceEnabled = $state(false);
    let pushEnabled = $state(false);
    let currentPassword = $state("");
    let newPassword = $state("");
    let confirmPassword = $state("");
    let changingPassword = $state(false);
    let showCurrent = $state(false);
    let showNew = $state(false);
    let showConfirm = $state(false);

    onMount(async () => {
        if ($profile) {
            fullName = $profile.full_name || "";
            avatarUrl = $profile.avatar_url || null;
        }
        getQueueSize().then((c) => (queueCount = c));

        const { isVoiceEnabled } = await import("$lib/utils/voiceGuide");
        voiceEnabled = isVoiceEnabled();

        if ("Notification" in window) {
            pushEnabled = Notification.permission === "granted";
        }
    });

    async function updateProfile() {
        if (!$profile) return;
        saving = true;
        const { error } = await supabase
            .from("profiles")
            .update({ 
                full_name: fullName,
                avatar_url: avatarUrl 
            })
            .eq("id", $profile.id);

        if (error) {
            addToast("error", error.message);
        } else {
            addToast("success", "Profile updated successfully");
            // Update local store if needed (though it should auto-sync if subscribed)
            profile.update(p => p ? { ...p, full_name: fullName, avatar_url: avatarUrl } : null);
        }
        saving = false;
    }

    async function handleToggleVoice() {
        const { toggleVoiceGuidance } = await import("$lib/utils/voiceGuide");
        voiceEnabled = toggleVoiceGuidance();
        addToast("success", `Voice guidance ${voiceEnabled ? "enabled" : "disabled"}`);
    }

    async function handleChangePassword() {
        if (!newPassword || newPassword.length < 6) {
            addToast("error", "New password must be at least 6 characters.");
            return;
        }
        if (newPassword !== confirmPassword) {
            addToast("error", "New passwords do not match.");
            return;
        }
        changingPassword = true;
        try {
            const { changePassword: changePw } = await import("$lib/utils/auth");
            const result = await changePw(currentPassword, newPassword);
            if (result.error) {
                addToast("error", result.error);
            } else {
                addToast("success", "Password changed successfully.");
                currentPassword = "";
                newPassword = "";
                confirmPassword = "";
            }
        } catch (err) {
            addToast("error", "An unexpected error occurred.");
        } finally {
            changingPassword = false;
        }
    }

    async function handleSignOut() {
        await signOut();
        addToast("info", "You have been signed out");
        goto("/");
    }
</script>

<svelte:head>
    <title>Profile Settings â€” CEDIMS</title>
</svelte:head>

<div class="max-w-3xl mx-auto space-y-8 pb-12">
    <!-- Header -->
    <div class="mb-2">
        <h1 class="text-3xl font-bold text-text-primary tracking-tight">Account Identity</h1>
        <p class="text-text-secondary mt-1 font-medium">
            Manage your personal profile and system preferences.
        </p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Left Column: Identity Card -->
        <div class="lg:col-span-1">
            <div class="gov-card-static p-8 flex flex-col items-center text-center">
                <ProfileUploader 
                    bind:url={avatarUrl} 
                    id={$profile?.id || ''}
                    label="Profile Photo"
                    path="users"
                    size="xl"
                    onUpload={(newUrl) => {
                       avatarUrl = newUrl;
                       updateProfile();
                    }}
                />
                
                <div class="mt-6 w-full">
                    <h2 class="text-xl font-bold text-text-primary truncate">{fullName || 'User Name'}</h2>
                    <p class="text-xs font-bold text-gov-blue uppercase tracking-widest mt-1">{$profile?.role || 'User'}</p>
                </div>

                <div class="mt-8 w-full space-y-3 pt-6 border-t border-border-subtle text-left">
                    <div class="flex items-center gap-3 text-text-secondary">
                        <ShieldCheck size={14} class="text-gov-blue" />
                        <span class="text-[10px] font-bold uppercase tracking-wider">Access Secured</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Right Column: Details & Preferences -->
        <div class="lg:col-span-2 space-y-8">
            <!-- Basic Information -->
            <div class="gov-card-static p-6">
                <div class="flex items-center gap-2 mb-6 text-gov-blue">
                    <User size={18} />
                    <h2 class="text-sm font-bold uppercase tracking-widest">Personal Details</h2>
                </div>

                <div class="space-y-6">
                    <div>
                        <label for="fullName" class="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Display Name (User Name)</label>
                        <input
                            id="fullName"
                            type="text"
                            bind:value={fullName}
                            placeholder="Enter your full name"
                            class="w-full px-4 py-3 text-sm bg-surface-muted border-border-subtle rounded-xl focus:ring-2 focus:ring-gov-blue/20 focus:border-gov-blue outline-none transition-colors font-bold"
                        />
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <span class="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Official Email</span>
                            <div class="px-4 py-3 text-sm bg-surface-muted border-border-subtle rounded-xl text-text-muted italic flex items-center min-h-[48px]">
                                {$user?.email || 'Not verified'}
                            </div>
                        </div>
                        <div>
                            <span class="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Connection Status</span>
                            <div class="px-4 py-3 text-sm bg-surface-muted border-border-subtle rounded-xl text-text-muted flex items-center min-h-[48px]">
                                 <LogOut size={14} class="mr-2 rotate-180 opacity-40" />
                                 {queueCount > 0 ? `${queueCount} Pending Sync` : 'Synchronized'}
                            </div>
                        </div>
                    </div>

                    <div class="pt-4 flex justify-end">
                        <button
                            onclick={updateProfile}
                            disabled={saving}
                            class="px-8 py-3 bg-gov-blue text-white font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-gov-blue-dark active:scale-95 transition-[color,background-color,border-color,transform] duration-200 ease-out disabled:opacity-50 shadow-sm"
                        >
                            {saving ? 'Syncing...' : 'Update Identity'}
                        </button>
                    </div>
                </div>
            </div>

            <!-- System Preferences -->
            <div class="gov-card-static p-6">
                <div class="flex items-center gap-2 mb-6 text-gov-blue">
                    <Bell size={18} />
                    <h2 class="text-sm font-bold uppercase tracking-widest">System Experience</h2>
                </div>

                <div class="space-y-4">
                    <!-- Voice Guidance -->
                    <div class="flex items-center justify-between p-4 bg-surface-muted rounded-2xl border-border-subtle">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-surface-white flex items-center justify-center text-gov-blue shadow-sm">
                                <Languages size={18} />
                            </div>
                            <div>
                                <span class="block text-sm font-bold text-text-primary">Voice Assistance</span>
                                <p class="text-[10px] text-text-muted font-medium">Auditory feedback for accessibility.</p>
                            </div>
                        </div>
                        <button
                            onclick={handleToggleVoice}
                            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:ring-2 focus:ring-gov-blue focus:ring-offset-2 {voiceEnabled ? 'bg-gov-blue' : 'bg-surface-muted'}"
                        >
                            <span class="sr-only">Toggle voice guidance</span>
                            <span class="inline-block h-4 w-4 transform rounded-full bg-surface-white transition-transform {voiceEnabled ? 'translate-x-6' : 'translate-x-1'}"></span>
                        </button>
                    </div>

                    <!-- Push Notifications -->
                    <div class="flex items-center justify-between p-4 bg-surface-muted rounded-2xl border-border-subtle">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-surface-white flex items-center justify-center text-gov-green shadow-sm">
                                <Bell size={18} />
                            </div>
                            <div>
                                <span class="block text-sm font-bold text-text-primary">Live Alerts</span>
                                <p class="text-[10px] text-text-muted font-medium">Real-time deadline and review notifications.</p>
                            </div>
                        </div>
                        <button
                            onclick={async () => {
                                const { subscribeToPush, unsubscribeFromPush } = await import("$lib/utils/notifications");
                                if (pushEnabled) {
                                    const success = await unsubscribeFromPush();
                                    if (success) {
                                        pushEnabled = false;
                                        addToast("success", "Notifications disabled");
                                    }
                                } else {
                                    const granted = await subscribeToPush();
                                    if (granted) {
                                        pushEnabled = true;
                                        addToast("success", "Notifications enabled");
                                    }
                                }
                            }}
                            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:ring-2 focus:ring-gov-blue focus:ring-offset-2 {pushEnabled ? 'bg-gov-green' : 'bg-surface-muted'}"
                        >
                            <span class="sr-only">Toggle push notifications</span>
                            <span class="inline-block h-4 w-4 transform rounded-full bg-surface-white transition-transform {pushEnabled ? 'translate-x-6' : 'translate-x-1'}"></span>
                        </button>
                    </div>

                    <!-- Replay System Walkthrough -->
                    <div class="flex items-center justify-between p-4 bg-surface-muted rounded-2xl border-border-subtle">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-surface-white flex items-center justify-center text-gov-gold-dark shadow-sm">
                                <ShieldCheck size={18} />
                            </div>
                            <div>
                                <span class="block text-sm font-bold text-text-primary">System Walkthrough</span>
                                <p class="text-[10px] text-text-muted font-medium">Replay the interactive tour of your dashboard's tabs and controls.</p>
                            </div>
                        </div>
                        <button
                            onclick={async () => {
                                if (!$profile) return;
                                const { resetWalkthrough, walkthroughReplayRequested } = await import("$lib/stores/walkthrough");
                                resetWalkthrough($profile.id);
                                walkthroughReplayRequested.set(true);
                                addToast("success", "Walkthrough reopened");
                            }}
                            class="px-3 py-1.5 text-xs font-bold text-gov-blue bg-gov-blue/10 rounded-lg hover:bg-gov-blue/20 transition-colors"
                        >
                            Replay
                        </button>
                    </div>
                </div>
            </div>

            <!-- Change Password -->
            <div class="gov-card-static p-6">
                <div class="flex items-center gap-2 mb-6 text-gov-blue">
                    <Key size={18} />
                    <h2 class="text-sm font-bold uppercase tracking-widest">Change Password</h2>
                </div>

                <div class="space-y-4">
                    <div>
                        <label for="currentPassword" class="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Current Password</label>
                        <div class="relative">
                            <input id="currentPassword" type={showCurrent ? "text" : "password"} bind:value={currentPassword} placeholder="Enter current password" class="w-full px-4 py-3 text-sm bg-surface-muted border-border-subtle rounded-xl focus:ring-2 focus:ring-gov-blue/20 focus:border-gov-blue outline-none transition-colors font-bold pr-11" />
                            <button type="button" onclick={() => showCurrent = !showCurrent} class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors p-1" tabindex="-1" aria-label={showCurrent ? "Hide password" : "Show password"}>
                                {#if showCurrent}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label for="newPassword" class="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">New Password</label>
                        <div class="relative">
                            <input id="newPassword" type={showNew ? "text" : "password"} bind:value={newPassword} placeholder="At least 6 characters" class="w-full px-4 py-3 text-sm bg-surface-muted border-border-subtle rounded-xl focus:ring-2 focus:ring-gov-blue/20 focus:border-gov-blue outline-none transition-colors font-bold pr-11" minlength="6" />
                            <button type="button" onclick={() => showNew = !showNew} class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors p-1" tabindex="-1" aria-label={showNew ? "Hide password" : "Show password"}>
                                {#if showNew}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label for="confirmPassword" class="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Confirm New Password</label>
                        <div class="relative">
                            <input id="confirmPassword" type={showConfirm ? "text" : "password"} bind:value={confirmPassword} placeholder="Re-enter new password" class="w-full px-4 py-3 text-sm bg-surface-muted border-border-subtle rounded-xl focus:ring-2 focus:ring-gov-blue/20 focus:border-gov-blue outline-none transition-colors font-bold pr-11" />
                            <button type="button" onclick={() => showConfirm = !showConfirm} class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors p-1" tabindex="-1" aria-label={showConfirm ? "Hide password" : "Show password"}>
                                {#if showConfirm}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
                            </button>
                        </div>
                    </div>
                    <div class="pt-2 flex justify-end">
                        <button
                            onclick={handleChangePassword}
                            disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                            class="px-8 py-3 bg-gov-blue text-white font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-gov-blue-dark active:scale-95 transition-[color,background-color,border-color,transform] duration-200 ease-out disabled:opacity-50 shadow-sm flex items-center gap-2"
                        >
                            {#if changingPassword}
                                <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>
                                Updating...
                            {:else}
                                <Key size={14} />
                                Change Password
                            {/if}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Danger Zone -->
            <div class="pt-4">
                <button
                    onclick={handleSignOut}
                    class="w-full py-4 border-2 border-gov-red/20 text-gov-red font-bold rounded-2xl text-xs uppercase tracking-widest hover:bg-gov-red/5 transition-colors flex items-center justify-center gap-2 group"
                >
                    <LogOut size={16} class="group-hover:translate-x-1 transition-transform" />
                    Sign Out Securely
                </button>
            </div>
        </div>
    </div>
</div>
