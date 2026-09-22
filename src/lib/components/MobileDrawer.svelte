<script lang="ts">
    import { page } from '$app/stores';
    import { profile, signOut } from '$lib/utils/auth';
    import { getNavItemsForRole } from '$lib/config/navigation';
    import { X, LogOut } from 'lucide-svelte';
    import { onMount } from 'svelte';
    let { open = $bindable(false) }: { open?: boolean } = $props();
    let dialog: HTMLDialogElement;
    const items = $derived(getNavItemsForRole($profile?.role));
    $effect(() => {
        if (open) dialog?.showModal();
        else dialog?.close();
    });
    onMount(() => {
        const media = window.matchMedia('(min-width: 1024px)');
        const closeOnDesktop = () => { if (media.matches) open = false; };
        media.addEventListener('change', closeOnDesktop);
        return () => media.removeEventListener('change', closeOnDesktop);
    });
</script>

<dialog bind:this={dialog} onclose={() => open = false} aria-labelledby="drawer-title">
    <div class="drawer-heading">
        <div><h2 id="drawer-title">CEDIMS</h2><p>Calapan East District</p></div>
        <button class="icon-button" onclick={() => open = false} aria-label="Close navigation"><X size={22} /></button>
    </div>
    <nav aria-label="Main navigation">
        {#each items as item}
            {@const Icon = item.icon}
            {@const active = item.href === '/dashboard' ? $page.url.pathname === item.href : $page.url.pathname.startsWith(item.href)}
            {#if item.onClick}
                <button class="drawer-link" onclick={(event) => { open = false; item.onClick?.(event); }}><Icon size={20} aria-hidden="true" />{item.label}</button>
            {:else}
                <a class="drawer-link" class:active href={item.href} onclick={() => open = false} aria-current={active ? 'page' : undefined} data-nav={item.navKey || null}><Icon size={20} aria-hidden="true" />{item.label}</a>
            {/if}
        {/each}
    </nav>
    <div class="drawer-account"><p>{$profile?.full_name}</p><p>{$profile?.role}</p><button class="drawer-link" onclick={() => { open = false; signOut(); }}><LogOut size={20} aria-hidden="true" />Sign out</button></div>
</dialog>

<style>
    dialog { margin: 0; width: min(320px, 90vw); max-width: none; height: 100dvh; max-height: 100dvh; padding: 20px 16px; background: var(--color-surface-white); color: var(--color-text-primary); border: 0; border-right: 1px solid var(--color-border-subtle); overflow-y: auto; overscroll-behavior: contain; }
    dialog::backdrop { background: rgb(15 23 42 / .45); }
    .drawer-heading { display: flex; align-items: center; justify-content: space-between; padding-bottom: 20px; border-bottom: 1px solid var(--color-border-subtle); }
    h2 { font-size: 1.125rem; font-weight: 700; }
    p { font-size: .875rem; color: var(--color-text-secondary); overflow-wrap: anywhere; }
    nav { display: grid; gap: 4px; padding: 16px 0; }
    .drawer-link { display: flex; gap: 12px; align-items: center; width: 100%; min-height: 48px; padding: 10px 12px; border-radius: 6px; text-align: left; font-size: .9375rem; }
    .drawer-link:hover { background: var(--color-surface-muted); }
    .active { background: var(--color-gov-blue); color: white; font-weight: 600; }
    .active:hover { background: var(--color-gov-blue-dark); }
    .drawer-account { border-top: 1px solid var(--color-border-subtle); padding-top: 16px; }
</style>
