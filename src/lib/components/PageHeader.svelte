<script lang="ts">
    import type { Snippet } from 'svelte';
    let { title, description = '', children }: { title: string; description?: string; children?: Snippet } = $props();
</script>

<div class="page-heading">
    <div class="min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1>{title}</h1>
        {#if description}<p class="!mt-0">{description}</p>{/if}
    </div>
    {#if children}<div class="page-actions">{@render children()}</div>{/if}
</div>
