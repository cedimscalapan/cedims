<script lang="ts">
    export let page = 1;
    export let pages = 1;
    export let total = 0;
    export let pageSize = 10;
    export let itemLabel = 'items';

    $: safePages = Math.max(1, pages);
    $: start = total === 0 ? 0 : (page - 1) * pageSize + 1;
    $: end = Math.min(page * pageSize, total);
</script>

{#if total > 0}
    <nav class="pagination-bar" aria-label="Pagination">
        <p class="pagination-summary" aria-live="polite">
            Showing {start}&ndash;{end} of {total} {itemLabel}
        </p>
        <div class="pagination-controls">
            <button
                type="button"
                class="pagination-button"
                aria-label="Previous page"
                disabled={page <= 1}
                onclick={() => page = Math.max(1, page - 1)}
            >Previous</button>
            <span class="pagination-page" aria-current="page">{page} / {safePages}</span>
            <button
                type="button"
                class="pagination-button next"
                aria-label="Next page"
                disabled={page >= safePages}
                onclick={() => page = Math.min(safePages, page + 1)}
            >Next</button>
        </div>
    </nav>
{/if}

<style>
    .pagination-bar {
        align-items: center;
        background: var(--color-surface-white, #fff);
        border: 1px solid var(--color-border-subtle, #dce3ef);
        border-radius: 16px;
        box-shadow: 0 1px 3px rgb(15 23 42 / 7%);
        display: flex;
        flex-wrap: wrap;
        gap: 12px 20px;
        justify-content: space-between;
        margin-top: 12px;
        min-height: 76px;
        padding: 12px 16px 12px 24px;
        width: 100%;
    }

    .pagination-summary {
        color: var(--color-text-muted, #64748b);
        font-size: 14px;
        font-weight: 500;
        line-height: 1.4;
        margin: 0;
    }

    .pagination-controls {
        align-items: center;
        background: var(--color-surface-white, #fff);
        border: 1px solid var(--color-border-subtle, #dce3ef);
        border-radius: 999px;
        display: inline-flex;
        flex: 0 0 auto;
        gap: 4px;
        padding: 5px;
    }

    .pagination-button,
    .pagination-page {
        align-items: center;
        border: 0;
        border-radius: 999px;
        display: inline-flex;
        font: inherit;
        font-size: 14px;
        font-weight: 750;
        justify-content: center;
        line-height: 1;
        min-height: 42px;
        min-width: 76px;
        padding: 0 16px;
        white-space: nowrap;
    }

    .pagination-button {
        background: transparent;
        color: var(--color-gov-blue, #2345b8);
        cursor: pointer;
        transition: background-color 140ms ease, color 140ms ease;
    }

    .pagination-button:not(:disabled):hover {
        background: var(--color-surface-muted, #eef1f5);
    }

    .pagination-button:focus-visible {
        outline: 3px solid rgb(35 69 184 / 28%);
        outline-offset: 2px;
    }

    .pagination-button:disabled {
        background: #f4f5f7;
        color: #b7c0cc;
        cursor: not-allowed;
    }

    .pagination-button.next:not(:disabled) {
        background: var(--color-gov-blue, #2345b8);
        color: #fff;
    }

    .pagination-button.next:not(:disabled):hover {
        background: var(--color-gov-blue-dark, #193894);
    }

    .pagination-button.next:disabled {
        background: #f4f5f7;
        color: #b7c0cc;
    }

    .pagination-page {
        background: #eef0f3;
        color: var(--color-gov-blue, #2345b8);
        min-width: 88px;
    }

    @media (max-width: 520px) {
        .pagination-bar {
            align-items: stretch;
            border-radius: 14px;
            padding: 12px;
        }

        .pagination-controls {
            justify-content: space-between;
            width: 100%;
        }

        .pagination-button,
        .pagination-page {
            min-width: 0;
        }
    }
</style>
