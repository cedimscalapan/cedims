<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { supabase } from '$lib/utils/supabase';
    import { profile } from '$lib/utils/auth';
    import { focusTrap } from '$lib/actions/focusTrap';
    import { requestUploadTargets } from '$lib/utils/uploadTargets';
    import { addToast } from '$lib/stores/toast';
    import { validateReview, currentDocumentReview, type ReviewEntry } from '$lib/utils/trackerView';
    import ReviewPdfPreview from './ReviewPdfPreview.svelte';
    export let document: any;
    export let onClose: () => void;
    export let onSaved: (() => void) | undefined = undefined;
    let current: ReviewEntry[] = [];
    let history: ReviewEntry[] = [];
    let canReview = false;
    let loading = true;
    let saving = false;
    let error = '';
    let previewError = '';
    let preview = '';
    let status = 'checked';
    let comment = '';
    let alive = true;
    const controller = new AbortController();
    const date = (value: string) => new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    function apply(data: any) {
        const shared = currentDocumentReview(data.current || []);
        current = shared ? [shared] : [];
        history = data.history || [];
        canReview = data.can_review === true;
        status = 'checked';
        comment = shared?.comment || '';
    }
    async function loadReviews() {
        loading = true; error = '';
        try {
            const { data, error: issue } = await requestUploadTargets(signal => supabase.rpc('get_document_reviews', { p_submission: document.id }).abortSignal(signal), 15000);
            if (issue) throw issue;
            if (alive) apply(data);
        } catch { if (alive) error = 'Could not load reviews. Please try again.'; }
        finally { if (alive) loading = false; }
    }
    async function loadPreview() {
        previewError = '';
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session || !document.file_path) throw new Error();
            const response = await fetch('/api/storage/presign', { method: 'POST', signal: controller.signal,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ key: document.file_path, intent: 'download' }) });
            if (!response.ok) throw new Error();
            const data = await response.json();
            if (alive) preview = data.url;
        } catch { if (alive) previewError = 'The preview is unavailable. You can retry or find the file in Archives.'; }
    }
    async function save() {
        error = validateReview(status, comment) || '';
        if (error || saving || !canReview) return;
        saving = true;
        try {
            const { data, error: issue } = await requestUploadTargets(signal => supabase.rpc('save_document_review', {
                p_submission: document.id, p_status: status, p_comment: comment.trim()
            }).abortSignal(signal), 15000);
            if (issue) throw issue;
            if (!alive) return;
            apply(data);
            addToast('success', 'Review saved. The teacher has been notified.');
            onSaved?.();
        } catch { if (alive) error = 'Could not save your review. Your text is still here; please try again.'; }
        finally { if (alive) saving = false; }
    }
    function close() { if (!saving) onClose(); }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') { event.stopPropagation(); close(); } }
    onMount(() => { void loadReviews(); void loadPreview(); });
    onDestroy(() => { alive = false; controller.abort(); });
</script>

<svelte:window on:keydown={escape} />
<div class="review-backdrop">
    <div class="review-dialog" role="dialog" aria-modal="true" aria-label="Document review and feedback" tabindex="-1" use:focusTrap>
        <header>
            <div><h2>Document review</h2><p>{document.teacher_name || document.uploader?.full_name || 'My submission'} · {document.subject || document.doc_type}{document.grade_level ? ` · ${document.grade_level}` : ''}</p>
                <small>{document.term_number ? `Term ${document.term_number} · ` : ''}{document.week_number ? `Week ${document.week_number} · ` : ''}{document.created_at ? date(document.created_at) : ''}</small></div>
            <button class="close" on:click={close} disabled={saving} aria-label="Close document review">✕</button>
        </header>
        <div class="review-layout">
            <div class="preview">
                <div class="preview-title"><strong>{document.file_name || 'Lesson plan'}</strong>{#if preview}<a href={preview} target="_blank" rel="noopener noreferrer">Open full document ↗</a>{/if}</div>
                {#if preview}<ReviewPdfPreview url={preview} />
                {:else if previewError}<div class="preview-message"><p>{previewError}</p><button on:click={loadPreview}>Retry preview</button></div>
                {:else}<p class="preview-message" role="status">Loading document preview…</p>{/if}
            </div>
            <div class="feedback">
                {#if loading}<p role="status">Loading reviews…</p>
                {:else}
                    {#if canReview}
                        <form on:submit|preventDefault={save}>
                            <h3>{current.length ? 'Edit remark' : 'Check document'}</h3>
                            <label>Remarks<textarea bind:value={comment} rows="4" maxlength="5000" disabled={saving} placeholder="Write a remark…"></textarea></label>
                            <button class="primary" disabled={saving}>{saving ? 'Saving…' : current.length ? 'Save remark' : 'Mark as checked'}</button>
                        </form>
                    {/if}
                    {#if error}<div role="alert" class="error">{error} {#if !canReview}<button on:click={loadReviews}>Retry</button>{/if}</div>{/if}
                    <h3>Current remark</h3>
                    {#each current as review (review.id)}
                        <article><div class="review-heading"><strong>{review.reviewer_role}</strong><span class="status">Checked</span></div><p class="remark">{review.comment || 'Document checked. No additional remarks.'}</p><small>{review.reviewer_name} · {history.length > 1 ? 'Edited · ' : ''}{date(review.created_at)}</small></article>
                    {:else}<p class="help">This document is waiting for review.</p>{/each}
                    {#if history.length > current.length}<details><summary>Remark edit history ({history.length})</summary><p class="help">Previous versions are retained. Only the latest shared remark appears above.</p>{#each history as entry (entry.id)}<article><strong>{entry.reviewer_name} · {entry.reviewer_role}</strong><p>Checked</p><p class="remark">{entry.comment || 'No additional remarks.'}</p><small>{date(entry.created_at)}</small></article>{/each}{#if history.length === 100}<small>Showing the latest 100 entries.</small>{/if}</details>{/if}
                {/if}
            </div>
        </div>
    </div>
</div>

<style>
    .review-backdrop { position:fixed; inset:0; z-index:80; background:rgb(15 23 42 / .55); display:grid; place-items:center; padding:12px; }
    .review-dialog { background:var(--color-surface-white); color:var(--color-text-primary); border-radius:16px; width:min(1680px,100%); height:calc(100dvh - 24px); display:flex; flex-direction:column; overflow:hidden; box-shadow:0 24px 80px #0004; }
    header { display:flex; flex:none; justify-content:space-between; gap:12px; padding:12px 18px; border-bottom:1px solid var(--color-border-subtle); }
    h2 { font-size:20px; font-weight:800; } h3 { font-size:16px; font-weight:750; margin-bottom:8px; } p,small { overflow-wrap:anywhere; } header p { margin:4px 0; } small,.help { color:var(--color-text-muted); font-size:12px; } .help { margin:0 0 14px; line-height:1.6; }
    .review-layout { display:grid; grid-template-columns:minmax(0,1fr) clamp(280px,26vw,360px); grid-template-rows:minmax(0,1fr); min-height:0; flex:1 1 0; overflow:hidden; }
    .preview { background:var(--color-surface-muted); display:flex; flex-direction:column; min-width:0; min-height:0; overflow:hidden; } .preview-title { flex:none; padding:12px 16px; font-size:12px; display:flex; flex-wrap:wrap; justify-content:space-between; gap:10px; overflow-wrap:anywhere; } .preview-title strong { min-width:0; } a { color:var(--color-text-primary); text-decoration:underline; font-weight:700; flex-shrink:0; }
    .preview-message { margin:auto; padding:30px; text-align:center; }
    .feedback { min-height:0; overflow-y:auto; overscroll-behavior:contain; scrollbar-gutter:stable; padding:18px; border-left:1px solid var(--color-border-subtle); } form { padding-bottom:22px; margin-bottom:20px; border-bottom:1px solid var(--color-border-subtle); }
    label { display:grid; gap:6px; font-size:13px; font-weight:700; margin:14px 0; } textarea { width:100%; padding:10px 12px; border:1px solid var(--color-border-subtle); border-radius:8px; background:var(--color-surface-white); color:inherit; font-weight:400; } textarea { resize:vertical; }
    button { border:1px solid var(--color-border-subtle); border-radius:8px; min-height:48px; padding:8px 14px; font-size:13px; font-weight:700; } button:disabled { opacity:.5; } .close { min-width:44px; align-self:start; } .primary { width:100%; background:var(--color-gov-blue); color:white; border-color:transparent; }
    article { padding:14px; border:1px solid var(--color-border-subtle); border-radius:10px; margin:10px 0; font-size:13px; } .review-heading { display:flex; flex-wrap:wrap; justify-content:space-between; gap:8px; } .remark { white-space:pre-wrap; margin:10px 0; line-height:1.6; } .status { color:var(--color-gov-green); font-size:12px; font-weight:700; } .error { color:var(--color-gov-red); } .error { padding:12px 0; font-size:13px; } summary { cursor:pointer; padding:14px 0; font-size:13px; font-weight:700; }
    @media(max-width:900px) { .review-backdrop { padding:0; } .review-dialog { height:100dvh; border-radius:0; } .review-layout { display:block; overflow-y:auto; } .preview { height:65dvh; } .feedback { overflow:visible; border-left:0; border-top:1px solid var(--color-border-subtle); padding:18px; } header { padding:14px 16px; } }
</style>
