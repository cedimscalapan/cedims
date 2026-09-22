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

<div class="flex flex-col items-center justify-center text-center py-8 px-4 sm:py-10">
    <div class="flex items-center justify-center mb-3">
        <IconComponent size={24} class="text-text-muted" aria-hidden="true" />
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
            type="button"
            class="gov-btn-primary mt-4"
        >
            {actionLabel}
        </button>
    {/if}
</div>
