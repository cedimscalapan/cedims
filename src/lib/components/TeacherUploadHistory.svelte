<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { supabase } from '$lib/utils/supabase';
    import { profile } from '$lib/utils/auth';
    import { fetchAllRows, fetchRowsForIds, submissionTerm } from '$lib/utils/compliance';
    import { uploadedDocumentsOldestFirst } from '$lib/utils/teacherUploadHistory';
    import type { ReviewEntry } from '$lib/utils/trackerView';
    import PaginationBar from './PaginationBar.svelte';
    import DocumentReviewPanel from './DocumentReviewPanel.svelte';
    import StatusBadge from './StatusBadge.svelte';
    export let teacherId: string;
    export let teacherName: string;
    export let onChanged: (() => void) | undefined = undefined;
    let uploads: any[] = [];
    let reviews: ReviewEntry[] = [];
    let loading = true;
    let issue = '';
    let reviewIssue = '';
    let search = '';
    let page = 1;
    let run = 0;
    let target: any = null;
    const pageSize = 8;
    onMount(() => { void load(); });
    onDestroy(() => { run++; });
    async function load() {
        const request = ++run;
        loading = true; issue = ''; reviewIssue = '';
        try {
            const result = await fetchAllRows<any>(() => supabase.from('submissions')
                .select('id,user_id,teaching_load_id,school_year,term_number,calendar_id,file_name,file_path,file_hash,file_size,doc_type,compliance_status,created_at,week_number,subject,teaching_load:teaching_loads(subject,grade_level)')
                .eq('user_id', teacherId).order('created_at', { ascending: true }).order('id'));
            if (request !== run) return;
            uploads = uploadedDocumentsOldestFirst(result).map(doc => {
                const load = Array.isArray(doc.teaching_load) ? doc.teaching_load[0] : doc.teaching_load;
                return { ...doc, subject: load?.subject || doc.subject, grade_level: load?.grade_level, teacher_name: teacherName };
            });
            page = 1;
            await refreshReviews(request);
        } catch { if (request === run) issue = 'Could not load all uploads. Please try again.'; }
        finally { if (request === run) loading = false; }
    }
    async function refreshReviews(request = run) {
        try {
            const result = await fetchRowsForIds<ReviewEntry>(uploads.map(doc => doc.id), ids => supabase.from('document_review_current').select('*').in('submission_id', ids).order('id'));
            if (request === run) { reviews = result; reviewIssue = ''; }
        } catch { if (request === run) reviewIssue = 'Review status is unavailable. Open a document to check its remarks.'; }
    }
    $: checkedIds = new Set(reviews.map(review => review.submission_id));
    $: rows = uploads.filter(doc => !search.trim() || [doc.file_name, doc.subject, doc.grade_level, doc.doc_type, doc.school_year, `Term ${submissionTerm(doc)}`, `Week ${doc.week_number}`].some(value => String(value || '').toLowerCase().includes(search.trim().toLowerCase())));
    $: pages = Math.max(1, Math.ceil(rows.length / pageSize));
    $: if (page > pages) page = pages;
    function dateLabel(date: string) { return new Date(date).toLocaleString('en-PH', { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }); }
    function saved() { void refreshReviews(); onChanged?.(); }
</script>
<section class="upload-history" aria-label="All teacher uploads">
    <header><div><h2>All uploads <span>{loading ? '…' : uploads.length}</span></h2><p>Oldest to newest · All submission types and school years</p></div><label>Find an upload<input bind:value={search} on:input={() => page = 1} placeholder="Search file, subject, grade, term or week" /></label></header>
    {#if loading}<p role="status">Loading all uploads…</p>
    {:else if issue}<div role="alert"><p>{issue}</p><button on:click={() => void load()}>Try again</button></div>
    {:else}
        {#if reviewIssue}<p role="alert">{reviewIssue}</p>{/if}
        <div class="upload-list">
            {#each rows.slice((page-1)*pageSize, page*pageSize) as doc (doc.id)}
                <article class="upload-row"><div class="upload-info"><h3>{doc.file_name || 'Document'}</h3><p>{doc.subject || doc.doc_type}{doc.grade_level ? ` · ${doc.grade_level}` : ''} · Term {submissionTerm(doc) || '—'} · Week {doc.week_number ?? '—'}</p><div class="upload-badges"><span class:checked={checkedIds.has(doc.id)}>{reviewIssue ? 'Review unavailable' : checkedIds.has(doc.id) ? 'Checked' : 'For checking'}</span><span>{['DLL','DLP'].includes(doc.doc_type) ? 'Lesson plan' : doc.doc_type}</span><StatusBadge status={doc.compliance_status || 'pending'} size="sm" /></div><p class="upload-date">{dateLabel(doc.created_at)}{doc.school_year ? ` · SY ${doc.school_year}` : ''}</p></div><button class="upload-open" on:click={() => target = doc}>{doc.user_id === $profile?.id ? 'View document' : checkedIds.has(doc.id) ? 'View remarks' : 'Review'}</button></article>
            {:else}<p class="empty">{search ? 'No uploads match your search.' : 'No uploads yet.'}</p>{/each}
        </div>
        <PaginationBar bind:page {pages} total={rows.length} {pageSize} itemLabel="uploads" />
    {/if}
</section>
{#if target}<DocumentReviewPanel document={target} onClose={() => target = null} onSaved={saved} />{/if}
<style>
    .upload-history { min-width:0; color:var(--color-text-primary); }
    header { display:grid; grid-template-columns:minmax(0,1fr) minmax(240px,1fr); align-items:end; gap:20px; padding-bottom:16px; }
    h2 { display:flex; align-items:center; gap:10px; font-size:22px; font-weight:800; }
    h2 span { font-size:16px; border-radius:6px; padding:2px 8px; background:var(--color-surface-muted); }
    header p,.upload-date { color:var(--color-text-muted); font-size:14px; line-height:1.5; margin-top:6px; }
    label { display:grid; gap:6px; font-size:14px; font-weight:700; min-width:0; }
    input { width:100%; min-height:48px; border:1px solid var(--color-border-subtle); border-radius:8px; padding:10px 12px; font:inherit; background:var(--color-surface-white); color:inherit; }
    .upload-list { border-top:1px solid var(--color-border-subtle); }
    .upload-row { display:grid; grid-template-columns:minmax(0,1fr) 150px; align-items:center; gap:20px; padding:18px 0; border-bottom:1px solid var(--color-border-subtle); }
    .upload-info { min-width:0; }
    h3 { font-size:17px; font-weight:750; line-height:1.5; overflow-wrap:anywhere; }
    .upload-info > p { font-size:15px; line-height:1.5; margin-top:5px; overflow-wrap:anywhere; }
    .upload-badges { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-top:8px; }
    .upload-badges > span { background:var(--color-surface-muted); padding:3px 8px; border-radius:6px; font-size:13px; font-weight:700; }
    .upload-badges > span.checked { color:var(--color-gov-green-dark); background:color-mix(in srgb,var(--color-gov-green) 10%,transparent); }
    button { min-height:48px; border-radius:8px; padding:10px 14px; font-size:16px; font-weight:700; }
    .upload-open { width:100%; background:var(--color-gov-blue); color:white; }
    .empty { padding:24px; text-align:center; }
    @media(max-width:650px) { header { grid-template-columns:minmax(0,1fr); gap:14px; } .upload-row { grid-template-columns:minmax(0,1fr); gap:12px; } .upload-open { justify-self:start; width:auto; min-width:140px; } }
</style>
