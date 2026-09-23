<script lang="ts">
    import type { Snippet } from 'svelte';
    let { title, description = '', children }: { title: string; description?: string; children?: Snippet } = $props();
</script>

{#if children}
    <div class="page-actions page-actions-only">{@render children()}</div>
{/if}
