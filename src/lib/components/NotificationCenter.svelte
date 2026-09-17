<script lang="ts">
    import { notifications, unreadCount } from "$lib/stores/notifications";
    import { fly, fade } from "svelte/transition";
    import { Bell, BellOff, Check, ArrowRight, Trash } from "lucide-svelte";
    import { onMount } from "svelte";
    import { focusTrap } from "$lib/actions/focusTrap";

    let isOpen = $state(false);

    async function handleMarkRead(id: string) {
        await notifications.markAsRead(id);
    }

    async function handleMarkAllRead() {
        await notifications.markAllAsRead();
    }

    // Close when clicking outside
    function handleClickOutside(e: MouseEvent) {
        if (
            isOpen &&
            !(e.target as HTMLElement).closest(".notification-container")
        ) {
            isOpen = false;
        }
    }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="relative notification-container">
    <button
        class="relative w-10 h-10 flex items-center justify-center rounded-md bg-surface-white border border-border-subtle hover:bg-surface-muted transition-colors duration-200"
        onclick={() => (isOpen = !isOpen)}
        aria-label="Open Notifications"
    >
        <Bell
            size={20}
            class={$unreadCount > 0 ? "text-gov-blue" : "text-text-muted"}
        />
        {#if $unreadCount > 0}
            <span
                class="absolute -top-1 -right-1 w-5 h-5 bg-gov-red text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white animate-bounce-subtle shadow-sm"
            >
                {$unreadCount > 9 ? "9+" : $unreadCount}
            </span>
        {/if}
    </button>

    {#if isOpen}
        <div
            class="fixed inset-x-4 top-20 sm:absolute sm:inset-auto sm:top-12 sm:right-0 sm:w-80 bg-surface-white border border-border-subtle rounded-xl shadow-2xl z-50 overflow-hidden max-h-[calc(100vh-8rem)] flex flex-col"
            in:fly={{ y: 10, duration: 200 }}
            out:fade={{ duration: 150 }}
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            tabindex="-1"
            use:focusTrap
            onkeydown={(e) => { if (e.key === "Escape") isOpen = false; }}
        >
            <div
                class="px-5 py-4 border-b border-border-subtle flex items-center justify-between bg-surface-muted flex-shrink-0"
            >
                <div class="flex flex-col">
                    <h3
                        class="text-xs font-bold text-text-primary uppercase tracking-wider"
                    >
                        Recent Alerts
                    </h3>
                </div>
                {#if $unreadCount > 0}
                    <button
                        onclick={handleMarkAllRead}
                        class="text-[10px] font-bold text-gov-blue hover:underline uppercase tracking-tight"
                    >
                        Mark all as read
                    </button>
                {/if}
            </div>

            <div class="overflow-y-auto scrollbar-thin flex-1">
                {#if $notifications.length === 0}
                    <div class="p-10 text-center">
                        <div
                            class="w-12 h-12 bg-surface-muted rounded-full flex items-center justify-center mx-auto mb-4"
                        >
                            <BellOff size={24} class="text-text-muted/40" />
                        </div>
                        <p class="text-xs font-medium text-text-muted">
                            No notifications yet.
                        </p>
                    </div>
                {:else}
                    {#each $notifications as n}
                        <div
                            class="p-4 border-b border-border-subtle last:border-0 hover:bg-surface-muted transition-colors flex gap-3 {n.read
                                ? 'opacity-70'
                                : ''}"
                        >
                            <div class="flex-shrink-0 mt-1">
                                <div
                                    class="w-2 h-2 rounded-full {n.read
                                        ? 'bg-surface-muted'
                                        : n.type === 'error'
                                          ? 'bg-gov-red'
                                          : n.type === 'warning'
                                            ? 'bg-gov-gold'
                                            : n.type === 'success'
                                              ? 'bg-gov-green'
                                              : 'bg-gov-blue'}"
                                ></div>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div
                                    class="flex justify-between items-start mb-0.5"
                                >
                                    <p
                                        class="text-xs font-bold text-text-primary truncate uppercase tracking-tight"
                                    >
                                        {n.title}
                                    </p>
                                    <span
                                        class="text-[9px] text-text-muted font-medium ml-2"
                                    >
                                        {new Date(
                                            n.created_at,
                                        ).toLocaleDateString([], {
                                            month: "short",
                                            day: "numeric",
                                        })}
                                    </span>
                                </div>
                                <p
                                    class="text-[11px] text-text-secondary leading-normal mb-2 line-clamp-3"
                                >
                                    {n.message}
                                </p>

                                <div class="flex items-center gap-3">
                                    {#if !n.read}
                                        <button
                                            onclick={() => handleMarkRead(n.id)}
                                            class="text-[10px] sm:text-[9px] font-bold text-gov-blue hover:text-gov-blue-dark flex items-center gap-1 uppercase tracking-wider py-1 sm:py-0"
                                        >
                                            <Check
                                                size={12}
                                                class="sm:w-[10px] sm:h-[10px]"
                                                strokeWidth={3}
                                            /> ACKNOWLEDGE
                                        </button>
                                    {/if}
                                    {#if n.link}
                                        <a
                                            href={n.link}
                                            class="text-[10px] sm:text-[9px] font-bold text-text-muted hover:text-text-primary flex items-center gap-1 uppercase tracking-wider py-1 sm:py-0"
                                            onclick={() => (isOpen = false)}
                                        >
                                            <ArrowRight
                                                size={12}
                                                class="sm:w-[10px] sm:h-[10px]"
                                                strokeWidth={3}
                                            /> VIEW DETAILS
                                        </a>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>

            {#if $notifications.length > 0}
                <div
                    class="p-3 border-t border-border-subtle bg-surface-muted text-center flex-shrink-0"
                >
                    <p
                        class="text-[9px] font-bold text-text-muted uppercase tracking-widest"
                    >
                        System Hub Monitoring Active
                    </p>
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    :global(.animate-bounce-subtle) {
        animation: bounce-subtle 3s infinite;
    }

    @keyframes bounce-subtle {
        0%,
        100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(-3px);
        }
    }
</style>
