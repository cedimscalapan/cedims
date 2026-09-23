<script lang="ts">
    import { page } from '$app/stores';
    import { profile, signOut } from '$lib/utils/auth';
    import { getNavItemsForRole } from '$lib/config/navigation';
    import NotificationCenter from './NotificationCenter.svelte';
    import { theme } from '$lib/stores/theme';
    import { connectivity } from '$lib/stores/connectivity';
    import { goto } from '$app/navigation';
    import { isMobileDevice } from '$lib/utils/device';
    import { PanelLeftClose, PanelLeftOpen, LogOut, Moon, RefreshCw, Settings, Sun, WifiOff } from 'lucide-svelte';

    let { collapsed = $bindable(false) } = $props();
    const items = $derived(getNavItemsForRole($profile?.role));
    const { isOnline: onlineStatus, pendingCount } = connectivity;
    const isMobile = isMobileDevice();
    function active(href: string) {
        return href === '/dashboard' ? $page.url.pathname === href : $page.url.pathname.startsWith(href);
    }
</script>

<aside class="sidebar" class:collapsed aria-label="CEDIMS navigation">
    <div class="identity">
        <img src="/deped-calapan-east-district.jpg" alt="Calapan East District seal" width="36" height="36" />
        {#if !collapsed}<div><strong>CEDIMS</strong><p>Calapan East District</p></div>{/if}
    </div>
    <button class="nav-control" onclick={() => collapsed = !collapsed} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!collapsed}>
        {#if collapsed}<PanelLeftOpen size={20} />{:else}<PanelLeftClose size={20} /><span>Collapse navigation</span>{/if}
    </button>
    <nav aria-label="Main navigation">
        {#each items as item}
            {@const Icon = item.icon}
            {#if item.onClick}
                <button class="nav-control" onclick={item.onClick} title={item.label} aria-label={item.label}><Icon size={20} aria-hidden="true" />{#if !collapsed}<span>{item.label}</span>{/if}</button>
            {:else}
                <a class="nav-control" class:active={active(item.href)} href={item.href} title={item.label} aria-label={item.label} aria-current={active(item.href) ? 'page' : undefined} data-nav={item.navKey || null}>
                    <Icon size={20} aria-hidden="true" />{#if !collapsed}<span>{item.label}</span>{/if}
                </a>
            {/if}
        {/each}
    </nav>
    <div class="account">
        <div class="profile-summary" data-tour="profile-menu">
            {#if $profile?.avatar_url}
                <img src={$profile.avatar_url} alt={$profile.full_name} width="36" height="36" loading="lazy" />
            {:else}
                <div class="avatar-fallback">{$profile?.full_name?.charAt(0) || 'U'}</div>
            {/if}
            {#if !collapsed}
                <div>
                    <strong>{$profile?.full_name}</strong>
                    <p>{$profile?.role}</p>
                </div>
            {/if}
        </div>
        <div class="quick-actions" aria-label="System controls">
            {#if !$onlineStatus || ($pendingCount > 0 && !isMobile)}
                <button
                    class="quick-action status-control"
                    class:offline={!$onlineStatus}
                    onclick={() => goto('/dashboard/upload')}
                    aria-label={$onlineStatus
                        ? `${$pendingCount} file(s) waiting to sync`
                        : 'You are offline. Changes will sync once reconnected'}
                    title={$onlineStatus
                        ? `${$pendingCount} file(s) waiting to sync`
                        : 'You are offline. Changes will sync once reconnected'}
                >
                    {#if $onlineStatus}
                        <RefreshCw size={18} aria-hidden="true" />
                    {:else}
                        <WifiOff size={18} aria-hidden="true" />
                    {/if}
                </button>
            {/if}
            <button
                data-tour="theme-toggle"
                class="quick-action"
                onclick={() => theme.toggle()}
                aria-label={$theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={$theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
                {#if $theme === 'dark'}
                    <Sun size={18} aria-hidden="true" />
                {:else}
                    <Moon size={18} aria-hidden="true" />
                {/if}
            </button>
            <div class="notification-slot" data-tour="notifications">
                <NotificationCenter />
            </div>
            <a class="quick-action" href="/dashboard/settings" aria-label="Settings" title="Settings"><Settings size={18} aria-hidden="true" /></a>
            <button class="quick-action" onclick={() => signOut()} aria-label="Sign out" title="Sign out"><LogOut size={18} aria-hidden="true" /></button>
        </div>
    </div>
</aside>

<style>
    .sidebar { position: fixed; inset: 0 auto 0 0; z-index: 35; display: flex; flex-direction: column; width: 72px; padding: 10px 8px; background: var(--color-surface-white); border-right: 1px solid var(--color-border-subtle); overflow: hidden; }
    .identity { display: flex; align-items: center; justify-content: center; min-height: 44px; margin-bottom: 8px; }
    .identity img { flex-shrink: 0; object-fit: contain; }
    .identity div, .nav-control span, .profile-summary div { display: none; }
    nav { display: grid; gap: 2px; margin-top: 8px; }
    .nav-control { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-height: 40px; padding: 8px; border-radius: 6px; font-size: .875rem; text-align: left; color: var(--color-text-secondary); cursor: pointer; }
    .nav-control:hover { background: var(--color-surface-muted); color: var(--color-text-primary); }
    .status-control { color: var(--color-gov-gold-dark); }
    .status-control.offline { color: var(--color-gov-red); }
    .quick-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
    .quick-action, .notification-slot { display: flex; align-items: center; justify-content: center; min-height: 34px; border-radius: 6px; color: var(--color-text-secondary); }
    .quick-action:hover, .notification-slot:hover { background: var(--color-surface-muted); color: var(--color-text-primary); }
    .notification-slot :global(.notification-container > button) { width: 34px; height: 34px; border: 0; background: transparent; }
    .active { background: var(--color-gov-blue); color: white; font-weight: 600; }
    .active:hover { background: var(--color-gov-blue-dark); color: white; }
    .account { margin-top: auto; padding-top: 10px; border-top: 1px solid var(--color-border-subtle); }
    .profile-summary { display: flex; align-items: center; justify-content: center; min-height: 38px; margin-bottom: 6px; padding: 0; }
    .profile-summary img, .avatar-fallback { flex-shrink: 0; width: 32px; height: 32px; border-radius: 8px; }
    .profile-summary img { object-fit: cover; border: 2px solid color-mix(in srgb, var(--color-gov-blue) 20%, transparent); }
    .avatar-fallback { display: flex; align-items: center; justify-content: center; background: var(--color-gov-blue); color: white; font-size: .75rem; font-weight: 700; }

    @media (min-width: 1024px) {
        .sidebar { width: 232px; padding: 12px; }
        .collapsed { width: 72px; }
        .identity { justify-content: flex-start; gap: 10px; margin-bottom: 10px; }
        .identity div, .nav-control span, .profile-summary div { display: block; }
        .collapsed .identity div, .collapsed .nav-control span, .collapsed .profile-summary div { display: none; }
        .identity p, .account p { font-size: .75rem; color: var(--color-text-secondary); }
        nav { gap: 2px; margin-top: 8px; }
        .nav-control { justify-content: flex-start; min-height: 38px; padding: 8px 10px; }
        .account { margin-top: auto; padding-top: 10px; }
        .profile-summary { justify-content: flex-start; gap: 10px; min-height: 40px; padding: 0 8px; }
        .profile-summary strong { display: block; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .875rem; color: var(--color-text-primary); }
        .profile-summary p { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .quick-actions { grid-template-columns: repeat(5, minmax(0, 1fr)); }
    }
</style>
