<script lang="ts">
    import type { Snippet } from "svelte";
    import { Inbox } from "lucide-svelte";

    interface Props {
        icon?: any;
        title: string;
        description?: string;
        actionLabel?: string;
        onAction?: () => void;
        children?: Snippet;
    }

    let {
        icon: IconComponent = Inbox,
        title,
        description = "",
        actionLabel = "",
        onAction,
        children,
    }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center text-center py-16 px-6">
    <div class="w-16 h-16 rounded-md bg-surface-muted flex items-center justify-center mb-4">
        <IconComponent size={28} class="text-text-muted" aria-hidden="true" />
    </div>
    <p class="text-lg font-semibold text-text-primary">{title}</p>
    {#if description}
        <p class="text-sm text-text-muted mt-2 max-w-sm">{description}</p>
    {/if}
    {#if children}
        <div class="mt-4">
            {@render children()}
        </div>
    {/if}
    {#if actionLabel && onAction}
        <button
            onclick={onAction}
            class="mt-5 px-4 py-2 bg-gov-blue text-white text-sm font-bold rounded-xl hover:bg-gov-blue-dark transition-colors"
        >
            {actionLabel}
        </button>
    {/if}
</div>
