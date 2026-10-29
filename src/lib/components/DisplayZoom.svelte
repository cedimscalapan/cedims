<script lang="ts">
    import { onMount } from 'svelte';
    import { supportTool } from '$lib/stores/supportTool';

    const storageKey = 'cedims-display-zoom';
    let zoom = $state(100);
    let open = $derived($supportTool === 'zoom');

    function applyZoom(value: number) {
        zoom = Math.min(200, Math.max(100, value));
        document.documentElement.style.setProperty('zoom', String(zoom / 100));
        try { localStorage.setItem(storageKey, String(zoom)); } catch { /* Size still works when storage is unavailable. */ }
    }

    onMount(() => {
        try {
            const saved = Number(localStorage.getItem(storageKey));
            if ([100, 125, 150, 175, 200].includes(saved)) applyZoom(saved);
        } catch { /* Keep the default size. */ }
    });
</script>

<div class="display-zoom">
    {#if open}
        <section id="display-zoom-controls" aria-label="Display size">
            <div class="panel-heading"><strong>Display size</strong><button class="close" aria-label="Close display size" onclick={() => supportTool.set(null)}>×</button></div>
            <div class="controls">
                <button aria-label="Zoom out" title="Zoom out" disabled={zoom === 100} onclick={() => applyZoom(zoom - 25)}>A−</button>
                <output aria-live="polite" aria-label="Current display size">{zoom}%</output>
                <button aria-label="Zoom in" title="Zoom in" disabled={zoom === 200} onclick={() => applyZoom(zoom + 25)}>A+</button>
            </div>
            <button class="reset" disabled={zoom === 100} onclick={() => applyZoom(100)}>Reset to normal size</button>
        </section>
    {/if}
    <button class="toggle" aria-label="Display size" title="Display size" aria-expanded={open} aria-controls="display-zoom-controls" onclick={() => supportTool.set(open ? null : 'zoom')}>
        <span aria-hidden="true">Aa</span>
    </button>
</div>

<style>
    .display-zoom { display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:8px; font-family: inherit; color: #172033; }
    button { font: inherit; cursor: pointer; min-height: 44px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; color: #172033; font-weight: 650; }
    button:focus-visible { outline: 3px solid #2563eb; outline-offset: 3px; }
    button:hover:not(:disabled) { background: #eff6ff; }
    button:disabled { opacity: .45; cursor: default; }
    .toggle { display:flex; align-items:center; justify-content:center; width:48px; height:48px; padding:0; border-radius:50%; font-size:14px; box-shadow:0 2px 10px #0002; }
    .toggle span { font-size: 20px; }
    section { position:absolute; right:60px; bottom:0; width:min(260px,calc(100vw - 92px)); padding:12px; border:1px solid #cbd5e1; border-radius:12px; background:#fff; font-size:16px; box-shadow:0 4px 24px #0003; }
    .panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .close { width: 44px; font-size: 24px; border-color: transparent; }
    .controls { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 8px 0 12px; }
    .controls button { width: 56px; font-size: 20px; }
    output { font-weight: 700; }
    .reset { width: 100%; padding: 8px; font-size: 14px; }
    @media print { .display-zoom { display: none; } }
</style>
