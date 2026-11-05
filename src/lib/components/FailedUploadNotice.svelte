<script lang="ts">
    import { goto } from '$app/navigation';
    import { profile } from '$lib/utils/auth';
    import { dismissFailedUpload, failedUploads, type FailedUpload } from '$lib/utils/offline';

    const own = $derived($failedUploads.filter((item) => item.userId === $profile?.id));

    async function uploadAgain(item: FailedUpload) {
        await dismissFailedUpload(item.key);
        await goto(item.redoHref);
    }
</script>

{#if own.length}
    <section class="notices" aria-label="Cancelled uploads">
        {#each own as item (item.key)}
            <div class="notice" role="alert">
                <div class="text">
                    <strong>Upload cancelled: {item.fileName}</strong>
                    <p>{item.reason}{item.canRedo ? ' Please upload the document again.' : ''}</p>
                </div>
                <div class="actions">
                    {#if item.canRedo}<button type="button" class="primary" onclick={() => uploadAgain(item)}>Upload again</button>{/if}
                    <button type="button" onclick={() => dismissFailedUpload(item.key)}>Dismiss</button>
                </div>
            </div>
        {/each}
    </section>
{/if}

<style>
    .notices { display: grid; gap: 10px; margin-bottom: 18px; }
    .notice { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border: 1px solid var(--color-border-subtle); border-left: 4px solid var(--color-gov-red); border-radius: 8px; color: var(--color-text-primary); background: var(--color-surface-white); }
    .text { min-width: 0; }
    strong { display: block; font-size: 15px; font-weight: 800; overflow-wrap: anywhere; }
    p { margin-top: 3px; color: var(--color-text-secondary); font-size: 14px; line-height: 1.45; }
    .actions { display: flex; flex-shrink: 0; gap: 8px; }
    button { min-height: 44px; padding: 0 14px; border: 1px solid var(--color-border-subtle); border-radius: 6px; color: var(--color-text-primary); background: var(--color-surface-white); font-size: 14px; font-weight: 800; white-space: nowrap; }
    .primary { color: white; border-color: var(--color-gov-blue); background: var(--color-gov-blue); }
    @media (max-width: 640px) {
        .notice { align-items: stretch; flex-direction: column; gap: 10px; }
        .actions button { flex: 1; }
    }
</style>
