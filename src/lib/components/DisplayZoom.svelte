<script lang="ts">
    import { onMount } from 'svelte';
    import { MonitorCog, Moon, Sun } from 'lucide-svelte';
    import { supportTool } from '$lib/stores/supportTool';
    import { theme } from '$lib/stores/theme';
    let { placement = 'floating' }: { placement?: 'floating' | 'header' } = $props();

    const storageKey = 'cedims-display-zoom';
    let zoom = $state(100);
    let highContrast = $state(false);
    let open = $derived($supportTool === 'zoom');

    function applyZoom(value: number) {
        zoom = Math.min(200, Math.max(100, value));
        document.documentElement.style.setProperty('zoom', String(zoom / 100));
        document.documentElement.style.setProperty('--cedims-display-scale', String(zoom / 100));
        document.documentElement.dataset.displayZoom = String(zoom);
        try { localStorage.setItem(storageKey, String(zoom)); } catch { /* Size still works when storage is unavailable. */ }
    }

    onMount(() => {
        try {
            const saved = Number(localStorage.getItem(storageKey));
            if ([100, 125, 150, 175, 200].includes(saved)) applyZoom(saved);
        } catch { /* Keep the default size. */ }
        try { setContrast(localStorage.getItem('cedims-reading-contrast') === 'high'); } catch { /* Keep normal contrast. */ }
    });

    function setContrast(enabled: boolean) {
        highContrast = enabled;
        document.documentElement.dataset.readingContrast = enabled ? 'high' : 'normal';
        try { localStorage.setItem('cedims-reading-contrast', enabled ? 'high' : 'normal'); } catch { /* Still works for this visit. */ }
    }
</script>

<div class="display-zoom" class:header={placement === 'header'}>
    {#if open}
        <section id="display-zoom-controls" aria-label="Display size">
            <div class="panel-heading"><strong>Display size</strong><button class="close" aria-label="Close display size" onclick={() => supportTool.set(null)}>×</button></div>
            <div class="controls">
                <button aria-label="Zoom out" title="Zoom out" disabled={zoom === 100} onclick={() => applyZoom(zoom - 25)}>A−</button>
                <output aria-live="polite" aria-label="Current display size">{zoom}%</output>
                <button aria-label="Zoom in" title="Zoom in" disabled={zoom === 200} onclick={() => applyZoom(zoom + 25)}>A+</button>
            </div>
            <button class="reset" disabled={zoom === 100} onclick={() => applyZoom(100)}>Reset to normal size</button>
            <div class="presets" aria-label="Quick display sizes">
                {#each [{value:100,label:'Normal'},{value:125,label:'Larger'},{value:150,label:'Extra large'}] as size}
                    <button aria-pressed={zoom === size.value} onclick={() => applyZoom(size.value)}>{size.label}</button>
                {/each}
            </div>
            <label class="contrast"><input type="checkbox" checked={highContrast} onchange={(event) => setContrast(event.currentTarget.checked)} /> Higher contrast</label>
            <div class="appearance" role="group" aria-label="Appearance">
                <span>Appearance</span>
                <div>
                    <button aria-pressed={$theme === 'light'} onclick={() => theme.set('light')}><Sun size={17} aria-hidden="true" /> Light</button>
                    <button aria-pressed={$theme === 'dark'} onclick={() => theme.set('dark')}><Moon size={17} aria-hidden="true" /> Dark</button>
                </div>
            </div>
        </section>
    {/if}
    <button class="toggle" aria-label="Display size" title="Adjust interface size and contrast" aria-expanded={open} aria-controls="display-zoom-controls" onclick={() => supportTool.set(open ? null : 'zoom')}>
        <MonitorCog size={24} strokeWidth={2} aria-hidden="true" />
    </button>
</div>

<style>
    .display-zoom { position:relative; display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:8px; font-family: inherit; color: var(--color-text-primary); }
    button { font: inherit; cursor: pointer; min-height: 44px; border: 1px solid var(--color-border-strong); border-radius: 8px; background: var(--color-surface-white); color: var(--color-text-primary); font-weight: 650; }
    button:focus-visible { outline: 3px solid #2563eb; outline-offset: 3px; }
    button:hover:not(:disabled) { background: var(--color-surface-muted); }
    button:disabled { opacity: .45; cursor: default; }
    .toggle { display:flex; align-items:center; justify-content:center; width:48px; height:48px; padding:0; border-radius:10px; border-color:var(--color-border-subtle); background:var(--color-surface-white); color:var(--color-text-secondary); }
    section { position:absolute; right:0; bottom:60px; width:min(280px,calc(100vw - 32px)); padding:12px; border:1px solid var(--color-border-strong); border-radius:12px; background:var(--color-surface-white); color:var(--color-text-primary); font-size:16px; box-shadow:0 4px 24px #0003; }
    .panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .close { width: 44px; font-size: 24px; border-color: transparent; }
    .controls { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 8px 0 12px; }
    .controls button { width: 56px; font-size: 20px; }
    output { font-weight: 700; }
    .reset { width: 100%; padding: 8px; font-size: 16px; }
    .presets { display:grid; grid-template-columns:1fr; gap:6px; margin-top:12px; }
    .presets button[aria-pressed='true'] { border:2px solid var(--color-gov-blue); background:var(--color-surface-muted); }
    .appearance { border-top:1px solid var(--color-border-subtle); padding-top:12px; font-size:14px; font-weight:700; }
    .appearance > div { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
    .appearance button { display:flex; align-items:center; justify-content:center; gap:6px; padding:6px; }
    .appearance button[aria-pressed='true'] { border-color:var(--color-gov-blue); background:var(--color-surface-muted); }
    .contrast { display:flex; align-items:center; gap:10px; min-height:48px; font-size:16px; font-weight:650; }
    .contrast input { width:22px; height:22px; }
    section { max-height:calc(100dvh / var(--cedims-display-scale, 1) - 256px); overflow-y:auto; }
    .header .toggle { width:44px; height:44px; min-height:44px; border-radius:9px; }
    .header section { top:calc(100% + 8px); bottom:auto; z-index:100; max-height:calc(100dvh / var(--cedims-display-scale, 1) - 112px); }
    @media (max-width:640px) {
        section { right:0; bottom:96px; width:min(300px,calc(100vw / var(--cedims-display-scale, 1) - 32px)); max-height:calc(100dvh / var(--cedims-display-scale, 1) - 256px); padding:10px; }
        .controls { gap:4px; }
        .controls button { width:44px; flex-shrink:0; }
        output { font-size:16px; }
        .header .toggle { width:40px; height:44px; min-height:44px; }
        .header .toggle :global(svg) { width:20px; height:20px; flex-shrink:0; }
        .header section { position:fixed; top:8px; right:8px; bottom:auto; max-height:calc(100dvh / var(--cedims-display-scale, 1) - 16px); }
    }
    @media print { .display-zoom { display: none; } }
</style>
