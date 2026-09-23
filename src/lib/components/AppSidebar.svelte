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
    {#if !collapsed}
        <p class="section-label">
            {items.find((item) => !item.onClick && active(item.href))?.label || 'Dashboard'}
        </p>
    {/if}
    <button class="nav-control" onclick={() => collapsed = !collapsed} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!collapsed}>
        {#if collapsed}<PanelLeftOpen size={20} />{:else}<PanelLeftClose size={20} /><span>Collapse navigation</span>{/if}
    </button>
    <div class="utility-controls" aria-label="System controls">
        {#if !$onlineStatus || ($pendingCount > 0 && !isMobile)}
            <button
                class="nav-control status-control"
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
                    <RefreshCw size={20} aria-hidden="true" />
                    {#if !collapsed}<span>{$pendingCount} pending</span>{/if}
                {:else}
                    <WifiOff size={20} aria-hidden="true" />
                    {#if !collapsed}<span>Offline</span>{/if}
                {/if}
            </button>
        {/if}
        <button
            data-tour="theme-toggle"
            class="nav-control"
            onclick={() => theme.toggle()}
            aria-label={$theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={$theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            {#if $theme === 'dark'}
                <Sun size={20} aria-hidden="true" />
                {#if !collapsed}<span>Light mode</span>{/if}
            {:else}
                <Moon size={20} aria-hidden="true" />
                {#if !collapsed}<span>Dark mode</span>{/if}
            {/if}
        </button>
        <div class="notification-slot" class:collapsed-notification={collapsed} data-tour="notifications">
            <NotificationCenter />
            {#if !collapsed}<span>Notifications</span>{/if}
        </div>
    </div>
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
        <a class="nav-control" href="/dashboard/settings" aria-label="Settings" title="Settings"><Settings size={20} aria-hidden="true" />{#if !collapsed}<span>Settings</span>{/if}</a>
        <button class="nav-control" onclick={() => signOut()} aria-label="Sign out" title="Sign out"><LogOut size={20} aria-hidden="true" />{#if !collapsed}<span>Sign out</span>{/if}</button>
    </div>
</aside>

<style>
    .sidebar { position: fixed; inset: 0 auto 0 0; z-index: 35; display: flex; flex-direction: column; width: 72px; padding: 12px 8px; background: var(--color-surface-white); border-right: 1px solid var(--color-border-subtle); overflow-y: auto; }
    .identity { display: flex; align-items: center; justify-content: center; min-height: 52px; margin-bottom: 12px; }
    .identity img { flex-shrink: 0; object-fit: contain; }
    .identity div, .section-label, .nav-control span, .notification-slot span, .profile-summary div { display: none; }
    nav, .utility-controls { display: grid; gap: 4px; margin-top: 12px; }
    .nav-control { display: flex; align-items: center; justify-content: center; gap: 12px; width: 100%; min-height: 44px; padding: 10px; border-radius: 6px; font-size: .875rem; text-align: left; color: var(--color-text-secondary); cursor: pointer; }
    .nav-control:hover { background: var(--color-surface-muted); color: var(--color-text-primary); }
    .status-control { color: var(--color-gov-gold-dark); }
    .status-control.offline { color: var(--color-gov-red); }
    .notification-slot { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 44px; padding: 0; border-radius: 6px; font-size: .875rem; color: var(--color-text-secondary); }
    .notification-slot:hover { background: var(--color-surface-muted); color: var(--color-text-primary); }
    .notification-slot :global(.notification-container > button) { border: 0; background: transparent; }
    .active { background: var(--color-gov-blue); color: white; font-weight: 600; }
    .active:hover { background: var(--color-gov-blue-dark); color: white; }
    .account { margin-top: auto; padding-top: 16px; }
    .profile-summary { display: flex; align-items: center; justify-content: center; min-height: 48px; margin-bottom: 8px; padding: 6px 0; border-top: 1px solid var(--color-border-subtle); }
    .profile-summary img, .avatar-fallback { flex-shrink: 0; width: 36px; height: 36px; border-radius: 8px; }
    .profile-summary img { object-fit: cover; border: 2px solid color-mix(in srgb, var(--color-gov-blue) 20%, transparent); }
    .avatar-fallback { display: flex; align-items: center; justify-content: center; background: var(--color-gov-blue); color: white; font-size: .75rem; font-weight: 700; }

    @media (min-width: 1024px) {
        .sidebar { width: 232px; padding: 16px 12px; }
        .collapsed { width: 72px; }
        .identity { justify-content: flex-start; gap: 10px; margin-bottom: 16px; }
        .identity div, .nav-control span, .notification-slot span, .profile-summary div { display: block; }
        .collapsed .identity div, .collapsed .section-label, .collapsed .nav-control span, .collapsed .notification-slot span, .collapsed .profile-summary div { display: none; }
        .identity p, .account p, .section-label { font-size: .75rem; color: var(--color-text-secondary); }
        .section-label { display: block; padding: 0 12px 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
        nav, .utility-controls { display: grid; gap: 4px; margin-top: 16px; }
        .nav-control { justify-content: flex-start; padding: 10px 12px; }
        .notification-slot { justify-content: flex-start; gap: 12px; padding: 0 12px 0 0; }
        .collapsed-notification { justify-content: center; padding: 0; }
        .account { margin-top: auto; padding-top: 24px; }
        .profile-summary { justify-content: flex-start; gap: 10px; padding: 6px 12px; }
        .profile-summary strong { display: block; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .875rem; color: var(--color-text-primary); }
        .profile-summary p { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    }
</style>
