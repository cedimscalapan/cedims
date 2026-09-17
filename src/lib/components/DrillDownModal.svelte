<script lang="ts">
  import { type Snippet } from "svelte";
  import { focusTrap } from "$lib/actions/focusTrap";

  interface Props {
    isOpen: boolean;
    title: string;
    onClose: () => void;
    children: Snippet;
  }

  let { isOpen, title, onClose, children }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-16 overflow-y-auto"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
  >
    <div
      class="gov-card-static w-full max-w-2xl animate-slide-up max-h-[80vh] flex flex-col"
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
      role="document"
      use:focusTrap
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0"
      >
        <h2 class="text-lg font-bold text-text-primary">{title}</h2>
        <button
          onclick={onClose}
          class="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-surface-muted transition-colors text-xl text-text-muted"
          aria-label="Close"
        >
          Close
        </button>
      </div>

      <!-- Content -->
      <div class="px-6 py-4 overflow-y-auto flex-1">
        {@render children()}
      </div>
    </div>
  </div>
{/if}
