<script lang="ts">
    import NotificationCenter from "./NotificationCenter.svelte";
    import MobileDrawer from "./MobileDrawer.svelte";
    import { profile, signOut } from "$lib/utils/auth";
    import { theme } from "$lib/stores/theme";
    import { connectivity } from "$lib/stores/connectivity";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { Sun, Moon, LogOut, WifiOff, RefreshCw, QrCode, Settings, Menu } from "lucide-svelte";
    import { focusTrap } from "$lib/actions/focusTrap";
    import { getNavItemsForRole } from "$lib/config/navigation";
    import { showQRScanner } from "$lib/stores/ui";
    import { isMobileDevice } from "$lib/utils/device";

    const { isOnline: onlineStatus, pendingCount } = connectivity;
    const isMobile = isMobileDevice();

    const navItems = $derived(
        getNavItemsForRole($profile?.role).filter(
            (item) => item.href !== "/dashboard/settings" && !item.onClick,
        ),
    );

    function isActive(href: string): boolean {
        const currentPath = $page.url.pathname;
        if (href === "/dashboard") return currentPath === "/dashboard";
        return currentPath.startsWith(href);
    }

    let profileMenuOpen = $state(false);
    let mobileDrawerOpen = $state(false);
    let profileMenuRef: HTMLDivElement | undefined = $state();
    let profileMenuDropdown: HTMLDivElement | undefined = $state();

    async function handleLogout() {
        await signOut();
    }

    function handleMenuKeydown(e: KeyboardEvent) {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const items = Array.from(
            profileMenuDropdown?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
        );
        if (items.length === 0) return;
        const current = items.indexOf(document.activeElement as HTMLElement);
        let next: number;
        if (e.key === "Home") next = 0;
        else if (e.key === "End") next = items.length - 1;
        else if (e.key === "ArrowDown") next = current < items.length - 1 ? current + 1 : 0;
        else next = current > 0 ? current - 1 : items.length - 1;
        items[next].focus();
    }
</script>

<header class="sticky top-0 z-30 w-full border-b border-border-subtle bg-surface-white">
    <div class="app-header-inner">
        <button
            class="mobile-menu-button"
            onclick={() => mobileDrawerOpen = true}
            aria-label="Open navigation menu"
            aria-expanded={mobileDrawerOpen}
        >
            <Menu size={22} strokeWidth={2} aria-hidden="true" />
        </button>

        <a href="/dashboard" class="app-brand" aria-label="CEDIMS Dashboard">
            <img
                src="/app_icon.png"
                alt=""
                class="h-9 w-9 rounded-lg object-contain lg:h-10 lg:w-10"
                loading="eager"
                aria-hidden="true"
            />
            <span class="flex flex-col items-start">
                <span class="brand-title">CEDIMS</span>
                <span class="mt-1 h-1 w-7 rounded-full bg-gov-blue-vibrant" aria-hidden="true"></span>
            </span>
        </a>

        <nav class="app-nav" aria-label="Main navigation">
            {#each navItems as item}
                {@const Icon = item.icon}
                {#if item.onClick}
                    <button
                        class="top-nav-link"
                        onclick={item.onClick}
                        aria-label={item.label}
                        title={item.label}
                    >
                        <Icon size={20} aria-hidden="true" />
                        <span>{item.label}</span>
                    </button>
                {:else}
                    <a
                        class="top-nav-link"
                        class:active={isActive(item.href)}
                        href={item.href}
                        aria-current={isActive(item.href) ? "page" : undefined}
                        data-nav={item.navKey || null}
                    >
                        <Icon size={20} aria-hidden="true" />
                        <span>{item.label}</span>
                    </a>
                {/if}
            {/each}
        </nav>

        <div class="app-actions">
            {#if !$onlineStatus || ($pendingCount > 0 && !isMobile)}
                <button
                    onclick={() => goto("/dashboard/upload")}
                    class="flex min-h-10 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm font-bold transition-colors {$onlineStatus
                        ? 'border-gov-gold/30 bg-gov-gold/10 text-gov-gold-dark hover:bg-gov-gold/20'
                        : 'border-gov-red/30 bg-gov-red/10 text-gov-red hover:bg-gov-red/20'}"
                    aria-label={$onlineStatus
                        ? `${$pendingCount} file(s) waiting to sync`
                        : "You are offline. Changes will sync once reconnected"}
                    title={$onlineStatus
                        ? `${$pendingCount} file(s) waiting to sync`
                        : "You are offline. Changes will sync once reconnected"}
                >
                    {#if $onlineStatus}
                        <RefreshCw size={18} strokeWidth={2} aria-hidden="true" />
                        <span class="hidden xs:inline">{$pendingCount} pending</span>
                    {:else}
                        <WifiOff size={18} strokeWidth={2} aria-hidden="true" />
                        <span class="hidden xs:inline">Offline</span>
                    {/if}
                </button>
            {/if}

            <button
                onclick={() => showQRScanner.set(true)}
                class="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors duration-200 hover:bg-gov-blue/10 hover:text-gov-blue"
                aria-label="Scan QR code"
            >
                <QrCode size={21} strokeWidth={1.8} aria-hidden="true" />
            </button>

            <button
                data-tour="theme-toggle"
                onclick={() => theme.toggle()}
                class="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors duration-200 hover:bg-gov-blue/10 hover:text-gov-blue"
                aria-label={$theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
                {#if $theme === "dark"}
                    <Sun size={21} strokeWidth={1.8} />
                {:else}
                    <Moon size={21} strokeWidth={1.8} />
                {/if}
            </button>

            <div data-tour="notifications">
                <NotificationCenter />
            </div>

            <div class="mx-1.5 hidden h-6 w-px bg-border-subtle sm:block"></div>

            <div class="relative" data-tour="profile-menu" bind:this={profileMenuRef}>
                <button
                    onclick={() => profileMenuOpen = !profileMenuOpen}
                    class="relative z-20 flex min-h-10 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors duration-200 hover:bg-gov-blue/10"
                    aria-expanded={profileMenuOpen}
                    aria-haspopup="true"
                    aria-label="Profile menu"
                >
                    {#if $profile?.avatar_url}
                        <img
                            src={$profile.avatar_url}
                            alt={$profile.full_name}
                            class="h-8 w-8 flex-shrink-0 rounded-lg border-2 border-gov-blue/20 object-cover"
                            loading="lazy"
                        />
                    {:else}
                        <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gov-blue text-sm font-bold text-white">
                            {$profile?.full_name?.charAt(0) || "U"}
                        </div>
                    {/if}
                    <span class="hidden max-w-[150px] truncate text-base font-bold text-text-primary xl:block">
                        {$profile?.full_name}
                    </span>
                </button>

                {#if profileMenuOpen}
                    <div
                        class="absolute right-0 mt-2 w-60 rounded-lg border border-border-subtle bg-surface-white shadow-xl"
                        role="menu"
                        aria-orientation="vertical"
                        tabindex="-1"
                        bind:this={profileMenuDropdown}
                        use:focusTrap
                        onkeydown={handleMenuKeydown}
                    >
                        <a
                            href="/dashboard/settings"
                            class="flex min-h-14 items-center gap-3 px-4 py-3 text-base font-semibold text-text-primary transition-colors first:rounded-t-lg hover:bg-gov-blue/10"
                            role="menuitem"
                            onclick={() => profileMenuOpen = false}
                        >
                            <Settings size={20} strokeWidth={2} aria-hidden="true" />
                            Settings
                        </a>
                        <button
                            onclick={handleLogout}
                            class="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-base font-semibold text-gov-red transition-colors last:rounded-b-lg hover:bg-gov-red/10"
                            role="menuitem"
                        >
                            <LogOut size={20} strokeWidth={2} aria-hidden="true" />
                            Sign Out
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</header>

<MobileDrawer bind:open={mobileDrawerOpen} />

<svelte:window
    onkeydown={(e) => {
        if (e.key === "Escape" && profileMenuOpen) {
            profileMenuOpen = false;
        }
    }}
    onclick={(e) => {
        const target = e.target as Node;
        if (profileMenuOpen && profileMenuRef && !profileMenuRef.contains(target)) {
            profileMenuOpen = false;
        }
    }}
/>

<style>
    .app-header-inner {
        width: 100%;
        max-width: 96rem;
        min-height: 4rem;
        margin: 0 auto;
        padding: 0.5rem 1rem;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.875rem;
    }

    .mobile-menu-button {
        display: none;
        align-items: center;
        justify-content: center;
        height: 2.5rem;
        width: 2.5rem;
        border-radius: 0.5rem;
        color: var(--color-text-muted);
        transition: background-color 160ms ease, color 160ms ease;
    }

    .mobile-menu-button:hover {
        background: var(--color-surface-muted);
        color: var(--color-gov-blue);
    }

    .app-brand {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        min-width: max-content;
    }

    .brand-title {
        font-size: clamp(1.15rem, 1.35vw, 1.4rem);
        line-height: 1;
        font-weight: 850;
        color: var(--color-text-primary);
    }

    .app-nav {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 0.35rem;
        overflow-x: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
    }

    .app-nav::-webkit-scrollbar {
        display: none;
    }

    .app-actions {
        min-width: max-content;
        display: flex;
        align-items: center;
        gap: 0.35rem;
        justify-content: flex-end;
    }

    .top-nav-link {
        display: inline-flex;
        align-items: center;
        gap: 0.38rem;
        min-height: 2.55rem;
        padding: 0.5rem 0.68rem;
        border-radius: 0.5rem;
        color: var(--color-text-secondary);
        font-size: clamp(0.9rem, 0.9vw, 1rem);
        font-weight: 700;
        white-space: nowrap;
        flex: 0 0 auto;
        transition: background-color 160ms ease, color 160ms ease;
    }

    .top-nav-link:hover {
        background: var(--color-surface-muted);
        color: var(--color-text-primary);
    }

    .top-nav-link.active {
        background: var(--color-gov-blue);
        color: white;
    }

    @media (max-width: 760px) {
        .app-header-inner {
            grid-template-columns: auto minmax(0, 1fr) auto;
            gap: 0.6rem;
            padding-inline: 0.8rem;
        }

        .mobile-menu-button {
            display: inline-flex;
        }

        .app-nav {
            display: none;
        }

        .brand-title {
            font-size: 1.1rem;
        }

        .top-nav-link {
            min-height: 2.65rem;
            padding-inline: 0.65rem;
        }
    }
</style>
