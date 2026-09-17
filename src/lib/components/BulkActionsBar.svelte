<script lang="ts">
    import { fly } from "svelte/transition";
    import { X } from "lucide-svelte";

    interface BulkAction {
        label: string;
        onClick: () => void;
        variant?: "primary" | "danger";
        disabled?: boolean;
    }

    interface Props {
        count: number;
        actions: BulkAction[];
        onClear: () => void;
        busy?: boolean;
    }

    let { count, actions, onClear, busy = false }: Props = $props();
</script>

{#if count > 0}
    <div
        class="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4"
        in:fly={{ y: 24, duration: 200 }}
        out:fly={{ y: 24, duration: 150 }}
    >
        <div
            class="flex items-center gap-3 rounded-2xl bg-text-primary text-white shadow-2xl px-4 py-3 max-w-full overflow-x-auto"
            role="toolbar"
            aria-label="Bulk actions"
        >
            <span class="text-sm font-semibold whitespace-nowrap">{count} selected</span>
            <div class="h-5 w-px bg-white/20 flex-shrink-0"></div>
            {#each actions as action}
                <button
                    onclick={action.onClick}
                    disabled={busy || action.disabled}
                    class="whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed {action.variant ===
                    'danger'
                        ? 'bg-gov-red/90 hover:bg-gov-red text-white'
                        : 'bg-gov-blue hover:bg-gov-blue-dark text-white'}"
                >
                    {action.label}
                </button>
            {/each}
            <button
                onclick={onClear}
                disabled={busy}
                class="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors flex-shrink-0"
                aria-label="Clear selection"
            >
                <X size={16} />
            </button>
        </div>
    </div>
{/if}
