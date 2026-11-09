<script lang="ts">
    import { ArrowLeft } from 'lucide-svelte';
    import { onMount } from 'svelte';
    let { label = 'Back', onBack, disabled = false, focusOnMount = false }: {
        label?: string; onBack: () => void; disabled?: boolean; focusOnMount?: boolean;
    } = $props();
    let button: HTMLButtonElement;
    onMount(() => { if (focusOnMount) button.focus(); });
</script>

<button bind:this={button} type="button" onclick={onBack} {disabled}>
    <ArrowLeft size={20} aria-hidden="true" /><span>{label}</span>
</button>

<style>
    button { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:48px; padding:10px 14px; border:1px solid var(--color-border-strong); border-radius:8px; color:var(--color-text-primary); background:var(--color-surface-white); font:inherit; font-size:16px; line-height:1.4; font-weight:700; cursor:pointer; text-align:left; }
    button:hover:not(:disabled) { background:var(--color-surface-muted); }
    button:disabled { opacity:.5; cursor:default; }
    button :global(svg) { flex-shrink:0; }
</style>
