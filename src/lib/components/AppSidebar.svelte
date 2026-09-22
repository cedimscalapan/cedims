<script lang="ts">
    import { page } from '$app/stores';
    import { profile, signOut } from '$lib/utils/auth';
    import { getNavItemsForRole } from '$lib/config/navigation';
    import { PanelLeftClose, PanelLeftOpen, LogOut } from 'lucide-svelte';

    let { collapsed = $bindable(false) } = $props();
    const items = $derived(getNavItemsForRole($profile?.role));
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
        {#if !collapsed}<p>{$profile?.role}</p>{/if}
        <button class="nav-control" onclick={() => signOut()} aria-label="Sign out" title="Sign out"><LogOut size={20} aria-hidden="true" />{#if !collapsed}<span>Sign out</span>{/if}</button>
    </div>
</aside>

<style>
    .sidebar { display: none; }
    @media (min-width: 1024px) {
        .sidebar { position: fixed; inset: 0 auto 0 0; z-index: 35; display: flex; flex-direction: column; width: 232px; padding: 16px 12px; background: var(--color-surface-white); border-right: 1px solid var(--color-border-subtle); overflow-y: auto; }
        .collapsed { width: 72px; }
        .identity { display: flex; align-items: center; gap: 10px; min-height: 52px; margin-bottom: 16px; }
        .identity img { flex-shrink: 0; object-fit: contain; }
        .identity p, .account p { font-size: .75rem; color: var(--color-text-secondary); }
        nav { display: grid; gap: 4px; margin-top: 16px; }
        .nav-control { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 44px; padding: 10px 12px; border-radius: 6px; font-size: .875rem; text-align: left; color: var(--color-text-secondary); cursor: pointer; }
        .nav-control:hover { background: var(--color-surface-muted); color: var(--color-text-primary); }
        .active { background: var(--color-gov-blue); color: white; font-weight: 600; }
        .active:hover { background: var(--color-gov-blue-dark); color: white; }
        .account { margin-top: auto; padding-top: 24px; }
        .account p { padding: 0 12px 8px; }
    }
</style>
