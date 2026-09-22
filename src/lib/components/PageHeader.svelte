<script lang="ts">
    import type { Snippet } from 'svelte';
    let { title, description = '', children }: { title: string; description?: string; children?: Snippet } = $props();
</script>

<div class="page-heading">
    <div class="min-w-0"><h1>{title}</h1>{#if description}<p>{description}</p>{/if}</div>
    {#if children}<div class="page-actions">{@render children()}</div>{/if}
</div>
