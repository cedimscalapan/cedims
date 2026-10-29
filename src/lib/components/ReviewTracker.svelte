<script lang="ts">
    import { onDestroy } from 'svelte';
    import { supabase } from '$lib/utils/supabase';
    import { profile } from '$lib/utils/auth';
    import { fetchRowsForIds } from '$lib/utils/compliance';
    import { documentReviewLabel, type ReviewEntry } from '$lib/utils/trackerView';
    import DocumentReviewPanel from './DocumentReviewPanel.svelte';
    import PaginationBar from './PaginationBar.svelte';
    import CedimsSelect from './CedimsSelect.svelte';
    export let items: any[] = [];
    export let title = 'Documents & feedback';
    export let pendingOnly = false;
    export let readOnlyRemarks = false;
    export let formatDate: (value: string) => string = value => new Date(value).toLocaleDateString('en-PH');
    export let onChanged: (() => void) | undefined = undefined;
    let search = ''; let status = 'all'; let type = 'all'; let page = 1; let target: any = null;
    let reviews: ReviewEntry[] = []; let issue = ''; let loading = false; let run = 0;
    $: key = items.map(s=>s.id).sort().join(',');
    $: if(key) void refreshReviews(key);
    async function refreshReviews(ids: string) {
        const request=++run;loading=true;issue='';
        try { const result=await fetchRowsForIds<ReviewEntry>(ids.split(','),batch=>supabase.from('document_review_current').select('*').in('submission_id',batch).order('id')); if(request===run)reviews=result; }
        catch {if(request===run)issue='Feedback statuses are unavailable. Open a document to retry.';} finally {if(request===run)loading=false;}
    }
    onDestroy(()=>run++);
    $: visible=items.filter(item=>(type==='all'||item.doc_type===type)&&(!search.trim()||[item.file_name,item.subject,item.teacher_name].some(v=>String(v||'').toLowerCase().includes(search.trim().toLowerCase()))));
    function reviewStatus(id: string) { const entries=reviews.filter(r=>r.submission_id===id);return entries.length?'checked':'pending'; }
    $: rows=visible.filter(item=>status==='all'&&!pendingOnly||reviewStatus(item.id)===(pendingOnly?'pending':status));
    $: pages=Math.max(1,Math.ceil(rows.length/6));
    $: if(page>pages)page=pages;
    function saved() {void refreshReviews(key);onChanged?.();}
</script>
<section class="documents">
    <header><div><h2>{title}</h2><p>Open a document to read feedback and see its review history.</p></div><a href="/dashboard/archive">Browse archives ↗</a></header>
    <div class="filters"><label>Find a document<input bind:value={search} on:input={()=>page=1} placeholder="Search file, subject or teacher" /></label><label>Document type<CedimsSelect bind:value={type} ariaLabel="Document type" options={[{value:'all',label:'All types'},{value:'DLL',label:'Lesson plan'},{value:'ISP',label:'ISP'},{value:'ISR',label:'ISR'}]} onChange={()=>page=1} /></label><label>Review status<CedimsSelect bind:value={status} ariaLabel="Review status" options={[{value:'all',label:'All reviews'},{value:'pending',label:'For checking'},{value:'checked',label:'Checked'}]} onChange={()=>page=1} /></label><button on:click={()=>{search='';status='all';type='all';page=1;}}>Reset</button></div>
    {#if issue}<p role="alert">{issue}</p>{/if}
    {#each rows.slice((page-1)*6,page*6) as item (item.id)}<article><div><h3>{item.file_name || item.subject || item.doc_type}</h3><p>{item.doc_type==='DLL'?'Lesson plan':item.doc_type}{item.week_number?` · Week ${item.week_number}`:''}{item.created_at?` · ${formatDate(item.created_at)}`:''}</p><div class="review-pair"><span>Review: {loading?'Loading…':documentReviewLabel(reviews.filter(r=>r.submission_id===item.id))}</span></div></div><button class="primary" on:click={()=>target=item}>{readOnlyRemarks||item.user_id===$profile?.id?'View document & feedback':'Review'}</button></article>{:else}<p class="empty">No documents match this view.</p>{/each}
    <PaginationBar bind:page {pages} total={rows.length} pageSize={6} itemLabel="documents" />
</section>
{#if target}<DocumentReviewPanel document={target} onClose={()=>target=null} onSaved={saved} />{/if}
<style>
    .documents {padding:20px;border:1px solid var(--color-border-subtle);border-radius:14px;background:var(--color-surface-white);color:var(--color-text-primary);} header {display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px;} h2{font-size:18px;font-weight:800;} header p,p{font-size:13px;color:var(--color-text-muted);margin:5px 0;} a{color:var(--color-gov-blue);font-size:13px;font-weight:700;} .filters{display:flex;flex-wrap:wrap;align-items:end;gap:10px;background:var(--color-surface-muted);padding:14px;border-radius:10px;} label{display:grid;gap:6px;font-size:12px;font-weight:700;flex:1;min-width:140px;} input{padding:10px;border:1px solid var(--color-border-subtle);border-radius:7px;min-height:48px;background:var(--color-surface-white);color:inherit;} button{min-height:48px;padding:9px 14px;border:1px solid var(--color-border-subtle);border-radius:8px;font-size:13px;font-weight:700;} article{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 0;border-bottom:1px solid var(--color-border-subtle);} h3{font-size:14px;font-weight:750;overflow-wrap:anywhere;} .primary{background:var(--color-gov-blue);color:white;} .review-pair{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;margin-top:8px;} .review-pair span{background:var(--color-surface-muted);padding:4px 8px;border-radius:6px;} .empty{padding:24px;text-align:center;} @media(max-width:650px){.documents{padding:14px;}article{align-items:stretch;flex-direction:column;}}
</style>
