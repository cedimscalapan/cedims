<script lang="ts">
    import { onDestroy } from 'svelte';
    import { profile } from '$lib/utils/auth';
    import { supabase } from '$lib/utils/supabase';
    import { buildRequirements, scopedCalendar, summarizeRequirements, fetchRowsForIds, submissionTerm } from '$lib/utils/compliance';
    import { effectiveDeadlineForSubject } from '$lib/utils/deadlineRules';
    import { type ReviewEntry } from '$lib/utils/trackerView';
    import TeacherChecklist from './TeacherChecklist.svelte';
    import DocumentReviewPanel from './DocumentReviewPanel.svelte';
    import PaginationBar from './PaginationBar.svelte';
    import CedimsSelect from './CedimsSelect.svelte';
    import { focusTrap } from '$lib/actions/focusTrap';
    export let teachers: any[] = [];
    export let loads: any[] = [];
    export let submissions: any[] = [];
    export let calendar: any[] = [];
    export let leaveRequests: any[] = [];
    export let onChanged: (() => void) | undefined = undefined;
    let term = 'all'; let week = 'all'; let grade = 'all'; let subject = 'all'; let status = 'all'; let search = '';
    let selected = ''; let page = 1; let reviewTarget: any = null;
    let reviews: ReviewEntry[] = []; let reviewError = ''; let reviewsLoading = false;
    let savingLeave = ''; let leaveError = ''; let reviewRun = 0;
    let leaveTarget: any = null; let leaveDecision = 'approved'; let leaveComment = '';
    function trackerGrade(value: string | null | undefined) {
        const grade = (value || '').trim();
        return /^(?:k|kinder|kindergarten)$/i.test(grade) ? 'Kinder' : grade;
    }
    $: ownRole = $profile?.role || '';
    $: reviewKey = submissions.map(s => s.id).sort().join(',');
    $: if (reviewKey) void loadReviews(reviewKey);
    async function loadReviews(key: string) {
        const run = ++reviewRun; reviewsLoading = true; reviewError = '';
        try {
            const data = await fetchRowsForIds<ReviewEntry>(key.split(','), ids => supabase.from('document_review_current').select('*').in('submission_id',ids).order('id'));
            if (run === reviewRun) reviews = data;
        } catch { if (run === reviewRun) reviewError = 'Review statuses could not be refreshed.'; }
        finally { if (run === reviewRun) reviewsLoading = false; }
    }
    onDestroy(() => { reviewRun++; });
    $: periods = scopedCalendar(calendar, $profile?.district_id);
    $: weeks = [...new Set(periods.filter(c => term === 'all' || c.term === Number(term)).map(c => c.week_number))].sort((a,b)=>a-b);
    $: gradeOptions = [...new Set(loads.map(l => trackerGrade(l.grade_level)).filter(Boolean))].sort((a,b) => a === 'Kinder' ? -1 : b === 'Kinder' ? 1 : a.localeCompare(b, undefined, { numeric: true }));
    $: subjectOptions = [...new Set(loads.map(l => l.subject).filter(Boolean))].sort();
    $: visibleTeachers = teachers.filter(t => !search.trim() || (t.full_name || t.name || '').toLowerCase().includes(search.trim().toLowerCase()));
    $: visibleIds = new Set(visibleTeachers.map(t=>t.id));
    $: visibleLoads = loads.filter(l => visibleIds.has(l.user_id) && (grade==='all'||trackerGrade(l.grade_level)===grade) && (subject==='all'||l.subject===subject));
    $: requirements = buildRequirements(visibleLoads, periods.filter(c=>(term==='all'||c.term===Number(term))&&(week==='all'||c.week_number===Number(week))),submissions,[],Date.now(),leaveRequests);
    $: summary = summarizeRequirements(requirements.filter(r => !selected || r.teacherId === selected));
    $: filteredDocs = submissions.filter(s => visibleIds.has(s.user_id) && !!s.file_path && ['DLL','DLP'].includes(s.doc_type) && (grade==='all'||visibleLoads.some(l=>l.id===s.teaching_load_id)) && (subject==='all'||visibleLoads.some(l=>l.id===s.teaching_load_id)) && (term==='all'||submissionTerm(s)===Number(term)) && (week==='all'||s.week_number===Number(week)));
    $: docsByTeacher = new Map(visibleTeachers.map(t => [t.id, filteredDocs.filter(s=>s.user_id===t.id)]));
    $: rows = visibleTeachers.map(t => {
        const requirementsForTeacher = requirements.filter(r=>r.teacherId===t.id);
        const docs = docsByTeacher.get(t.id) || [];
        const pending = t.id === $profile?.id ? 0 : docs.filter(s=>!reviews.some(r=>r.submission_id===s.id)).length;
        return {...t,...summarizeRequirements(requirementsForTeacher),pending,docs};
    }).filter(t => (grade==='all'&&subject==='all'||visibleLoads.some(l=>l.user_id===t.id)) && (status==='all'||status==='overdue'&&t.missing>0||status==='review'&&t.pending>0||status==='complete'&&t.expected>0&&t.submitted===t.expected))
        .sort((a,b)=>b.missing-a.missing||b.pending-a.pending||(a.full_name||'').localeCompare(b.full_name||''));
    $: selectedTeacher = teachers.find(t=>t.id===selected);
    $: selectedDocs = filteredDocs.filter(s=>s.user_id===selected);
    $: pendingCount = filteredDocs.filter(s=>s.user_id!==$profile?.id&&!reviews.some(r=>r.submission_id===s.id)).length;
    $: pendingLeaves = leaveRequests.filter(r=>r.status==='pending'&&visibleIds.has(r.user_id)&&(term==='all'||r.term_number===Number(term))&&(week==='all'||r.week_number===Number(week))&&(grade==='all'&&subject==='all'||visibleLoads.some(l=>l.id===r.teaching_load_id)));
    $: actionQueue = [
        ...requirements.filter(r => r.status === 'missing' && (!selected || r.teacherId === selected) && (status === 'all' || status === 'overdue')).map(r => ({ key: `missing-${r.teacherId}-${r.load.id}-${r.calendar.id}`, kind: 'missing', teacherId: r.teacherId, teacher: teachers.find(t => t.id === r.teacherId)?.full_name || 'Teacher', detail: `${r.load.subject} · ${r.load.grade_level} · Term ${r.calendar.term}, Week ${r.calendar.week_number}`, doc: null as any, deadline: effectiveDeadlineForSubject(r.calendar.deadline_date, r.load.subject, r.load.school_name).getTime() })),
        ...filteredDocs.filter(doc => !reviewsLoading && doc.user_id !== $profile?.id && (!selected || doc.user_id === selected) && (status === 'all' || status === 'review') && !reviews.some(r => r.submission_id === doc.id)).map(doc => ({ key: `review-${doc.id}`, kind: 'review', teacherId: doc.user_id, teacher: teachers.find(t => t.id === doc.user_id)?.full_name || 'Teacher', detail: `${loads.find(load => load.id === doc.teaching_load_id)?.subject || doc.subject || 'Document'} · Term ${submissionTerm(doc) || '—'}, Week ${doc.week_number || '—'}`, doc, deadline: Number.MAX_SAFE_INTEGER })),
    ].sort((a,b) => a.deadline - b.deadline).slice(0, 6);
    $: scopeLabel = `${selectedTeacher?.full_name || 'All teachers'} · ${term === 'all' ? 'All terms' : `Term ${term}`} · ${week === 'all' ? 'All weeks' : `Week ${week}`} · ${grade === 'all' ? 'All grades' : grade} · ${subject === 'all' ? 'All subjects' : subject}`;
    $: pages = Math.max(1,Math.ceil(rows.length/8));
    $: if(page>pages) page=pages;
    function reset() { term='all';week='all';grade='all';subject='all';status='all';search='';page=1;selected=''; }
    function openReview(doc: any) { const load=loads.find(l=>l.id===doc.teaching_load_id);reviewTarget={...doc,teacher_name:teachers.find(t=>t.id===doc.user_id)?.full_name,subject:load?.subject||doc.subject,grade_level:load?.grade_level}; }
    function savedReview() { void loadReviews(reviewKey); onChanged?.(); }
    async function saveLeave() {
        if(!leaveTarget || savingLeave || !$profile) return;
        if(leaveDecision==='rejected'&&!leaveComment.trim()) {leaveError='Explain why this request is declined.';return;}
        savingLeave=leaveTarget.id;leaveError='';
        const {error}=await supabase.from('submission_leave_requests').update({status:leaveDecision,reviewer_id:$profile.id,reviewed_at:new Date().toISOString(),reviewer_comment:leaveComment.trim()||null}).eq('id',leaveTarget.id).eq('status','pending');
        savingLeave='';
        if(error) {leaveError='Could not save this decision. Please try again.';return;}
        leaveRequests=leaveRequests.map(r=>r.id===leaveTarget.id?{...r,status:leaveDecision}:r);leaveTarget=null;onChanged?.();
    }
</script>

<section class="school-tracker">
    <header><div><h2>School submissions</h2><p>All teachers in your school. Start with overdue work or documents waiting for your review.</p></div><a href="/dashboard/compliance">Full compliance report ↗</a></header>
    <div class="school-search"><label class="search">Find a teacher<input bind:value={search} on:input={()=>{page=1;selected='';}} placeholder="Search by name" /></label><button on:click={reset}>Reset filters</button></div>
    <details class="school-filters"><summary>Filter school submissions <span>{[term,week,grade,subject,status].filter(value => value !== 'all').length ? 'Filters applied' : 'All submissions'}</span></summary>    <div class="filters">
        
        <label>Term<CedimsSelect bind:value={term} ariaLabel="Term" options={[{value:'all',label:'All terms'}, ...[1,2,3].map(value=>({value:String(value),label:`Term ${value}`}))]} onChange={()=>{week='all';page=1;}} /></label>
        <label>Week<CedimsSelect bind:value={week} ariaLabel="Week" options={[{value:'all',label:'All weeks'}, ...weeks.map(value=>({value:String(value),label:`Week ${value}`}))]} onChange={()=>page=1} /></label>
        <label>Grade<CedimsSelect bind:value={grade} ariaLabel="Grade" options={[{value:'all',label:'All grades'}, ...gradeOptions.map(value=>({value,label:value}))]} onChange={()=>page=1} /></label>
        <label>Subject<CedimsSelect bind:value={subject} ariaLabel="Subject" options={[{value:'all',label:'All subjects'}, ...subjectOptions.map(value=>({value,label:value}))]} onChange={()=>page=1} /></label>
        <label>Show<CedimsSelect bind:value={status} ariaLabel="Show teachers" options={[{value:'all',label:'All teachers'},{value:'overdue',label:'Overdue work'},{value:'review',label:'Documents to check'},{value:'complete',label:'Complete'}]} onChange={()=>page=1} /></label>
        
    </div></details>
    <p class="context">{scopeLabel} · {selected ? 1 : visibleTeachers.length} teacher{selected || visibleTeachers.length === 1 ? '' : 's'} · Totals include all statuses · {summary.onLeave} approved leave excluded</p>
    <section class="action-queue" aria-labelledby="school-actions-title"><div class="queue-heading"><div><h3 id="school-actions-title">Needs follow-up</h3><p class="context">Missing work and documents awaiting remarks</p></div><span>{actionQueue.length} shown</span></div>{#each actionQueue as item}<div class="queue-row"><div><strong>{item.teacher}</strong><small>{item.detail}</small></div><span class:overdue={item.kind === 'missing'}>{item.kind === 'missing' ? 'Missing DLL' : 'For checking'}</span><button class="primary" on:click={() => item.doc ? openReview(item.doc) : selected = item.teacherId}>{item.kind === 'missing' ? 'View teacher' : 'Review document'}</button></div>{:else}<p class="empty">{reviewsLoading ? 'Checking document review status…' : 'No missing DLLs or documents awaiting remarks in this view.'}</p>{/each}</section>
    <dl class="summary"><div><dt>Expected</dt><dd>{summary.expected}</dd></div><div><dt>Submitted</dt><dd>{summary.submitted}</dd></div><div><dt>Remaining</dt><dd>{Math.max(0,summary.expected-summary.submitted)}</dd></div><div><dt>Overdue</dt><dd class="overdue">{summary.missing}</dd></div></dl>
    <div class="attention"><button on:click={()=>{status='review';selected='';page=1;}} disabled={reviewsLoading}>Documents to check <strong>{reviewsLoading?'…':pendingCount}</strong></button>{#if ownRole==='School Head'}<a href="#tracker-leave">Pending leave requests <strong>{pendingLeaves.length}</strong></a>{/if}</div>
    {#if reviewError}<p role="alert">{reviewError} <button on:click={()=>loadReviews(reviewKey)}>Retry</button></p>{/if}
    {#if selectedTeacher}
        <div class="detail-heading"><button on:click={()=>selected=''}>← All teachers</button><h3>{selectedTeacher.full_name || selectedTeacher.name}</h3></div>
        <TeacherChecklist title="Weekly submission details" submissions={selectedDocs} teachingLoads={visibleLoads.filter(l=>l.user_id===selected)} calendarWeeks={periods.filter(c=>(term==='all'||c.term===Number(term))&&(week==='all'||c.week_number===Number(week)))} leaveRequests={leaveRequests.filter(r=>r.user_id===selected)} reviewEntries={reviews} readOnly={true} onChanged={savedReview} />
    {:else}
        <div class="roster"><table><thead><tr><th>Teacher</th><th>Expected</th><th>Submitted</th><th>Remaining</th><th>Overdue</th><th>For checking</th><th>Action</th></tr></thead><tbody>{#each rows.slice((page-1)*8,page*8) as teacher (teacher.id)}<tr><th scope="row">{teacher.full_name||teacher.name}{#if teacher.id===$profile?.id}<small>My submissions</small>{/if}</th><td data-label="Expected">{teacher.expected}</td><td data-label="Submitted">{teacher.submitted}</td><td data-label="Remaining">{Math.max(0,teacher.expected-teacher.submitted)}</td><td data-label="Overdue" class:overdue={teacher.missing>0}>{teacher.missing}</td><td data-label="For checking">{teacher.id===$profile?.id?'—':teacher.pending}</td><td><button class="primary" on:click={()=>selected=teacher.id}>View details →</button></td></tr>{:else}<tr><td colspan="7" class="empty">No teachers match these filters. <button on:click={reset}>Reset filters</button></td></tr>{/each}</tbody></table></div>
        <PaginationBar bind:page {pages} total={rows.length} pageSize={8} itemLabel="teachers" />
    {/if}
    {#if ownRole==='School Head'}<section id="tracker-leave" class="leave-section"><h3>Pending leave requests</h3><p class="context">A request is excluded from expected submissions only after approval.</p>{#each pendingLeaves as request (request.id)}<div class="document-row"><div><strong>{teachers.find(t=>t.id===request.user_id)?.full_name || 'Teacher'}</strong><p>{loads.find(l=>l.id===request.teaching_load_id)?.subject} · Term {request.term_number} · Week {request.week_number}</p><p>{request.leave_type} · {request.reason}</p></div><button on:click={()=>{leaveTarget=request;leaveComment='';leaveDecision='approved';leaveError='';}}>Review request</button></div>{:else}<p class="empty">No pending leave requests for these filters.</p>{/each}</section>{/if}
</section>
{#if reviewTarget}<DocumentReviewPanel document={reviewTarget} onClose={()=>reviewTarget=null} onSaved={savedReview} />{/if}
{#if leaveTarget}<div class="leave-backdrop"><div class="leave-dialog" role="dialog" aria-modal="true" aria-label="Review leave request" tabindex="-1" use:focusTrap><form on:submit|preventDefault={saveLeave}><h3>Review leave request</h3><p>{leaveTarget.reason}</p><label>Decision<CedimsSelect bind:value={leaveDecision} ariaLabel="Decision" options={[{value:'approved',label:'Approve exclusion'},{value:'rejected',label:'Decline request'}]} /></label><label>Remarks {leaveDecision==='rejected'?'(required)':'(optional)'}<textarea rows="3" bind:value={leaveComment}></textarea></label>{#if leaveError}<p role="alert" class="overdue">{leaveError}</p>{/if}<div class="dialog-actions"><button type="button" disabled={!!savingLeave} on:click={()=>leaveTarget=null}>Cancel</button><button class="primary" disabled={!!savingLeave}>{savingLeave?'Saving…':'Save decision'}</button></div></form></div></div>{/if}

<style>
    .school-tracker { padding:22px; background:var(--color-surface-white); color:var(--color-text-primary); border:1px solid var(--color-border-subtle); border-radius:14px; }
    .action-queue { border:1px solid var(--color-border-subtle); border-left:4px solid var(--color-gov-blue); border-radius:9px; padding:16px 18px; margin:18px 0; }
    .queue-heading,.queue-row { display:flex; align-items:center; justify-content:space-between; gap:16px; }.queue-heading { padding-bottom:8px; }.queue-heading > span { color:var(--color-text-muted); font-size:13px; }.queue-heading p { margin:3px 0 0; }
    .queue-row { border-top:1px solid var(--color-border-subtle); padding:13px 0; }.queue-row:last-child { padding-bottom:0; }.queue-row > div { flex:1; }.queue-row strong { font-size:15px; }.queue-row small { display:block; margin-top:3px; }.queue-row > span { font-size:13px; font-weight:750; color:var(--color-gov-gold-dark); }.queue-row > span.overdue { color:var(--color-gov-red); }
    header { display:flex; flex-wrap:wrap; justify-content:space-between; gap:16px; margin-bottom:20px; } h2 { font-size:20px; font-weight:800; } h3 { font-size:17px; font-weight:750; } header p,.context { font-size:13px; color:var(--color-text-muted); line-height:1.6; } a { color:var(--color-gov-blue); font-size:13px; font-weight:700; }
    .filters { display:flex; flex-wrap:wrap; align-items:end; gap:10px; padding:16px; background:var(--color-surface-muted); border-radius:10px; margin-bottom:16px; } label { display:grid; gap:6px; font-size:12px; font-weight:700; flex:1; min-width:100px; } .search { flex:2; min-width:180px; } input,textarea { min-height:48px; padding:10px; border:1px solid var(--color-border-subtle); border-radius:7px; background:var(--color-surface-white); color:inherit; font-weight:400; width:100%; }
    .summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:16px 0 10px; } .summary div { border:1px solid var(--color-border-subtle); border-radius:10px; padding:16px; } dt { font-size:12px; color:var(--color-text-muted); } dd { font-size:28px; font-weight:800; margin-top:4px; } .overdue { color:var(--color-gov-red); font-weight:750; }
    button { min-height:48px; padding:9px 14px; border:1px solid var(--color-border-subtle); border-radius:8px; font-size:13px; font-weight:700; background:var(--color-surface-white); } button:disabled { opacity:.5; } .primary { background:var(--color-gov-blue); border-color:transparent; color:white; white-space:nowrap; } .attention { display:flex; flex-wrap:wrap; gap:12px; margin:18px 0; } .attention button,.attention a { display:flex; gap:12px; align-items:center; border:1px solid var(--color-border-subtle); border-radius:8px; padding:10px 16px; font-size:13px; color:var(--color-gov-blue); } .attention strong { background:var(--color-surface-muted); padding:2px 10px; border-radius:20px; }
    .roster { overflow:auto; } table { width:100%; border-collapse:collapse; text-align:left; font-size:13px; } th,td { padding:14px 10px; border-bottom:1px solid var(--color-border-subtle); } thead { background:var(--color-surface-muted); font-size:12px; } small { display:block; font-size:12px; color:var(--color-text-muted); font-weight:400; } .empty { text-align:center; padding:24px; font-size:13px; color:var(--color-text-muted); }
    .detail-heading { display:flex; gap:16px; align-items:center; margin:18px 0; } .document-row { display:flex; justify-content:space-between; gap:16px; align-items:center; padding:16px 0; border-bottom:1px solid var(--color-border-subtle); font-size:14px; } .document-row p { color:var(--color-text-muted); font-size:12px; margin:5px 0; } .leave-section { margin-top:24px; padding-top:20px; border-top:1px solid var(--color-border-subtle); scroll-margin-top:100px; }
    .leave-backdrop { position:fixed; inset:0; background:#0f172a88; display:grid; place-items:center; z-index:80; padding:20px; } .leave-dialog { display:grid; gap:16px; padding:24px; width:min(500px,100%); border-radius:12px; background:var(--color-surface-white); } .leave-dialog form { display:contents; } .dialog-actions { display:flex; justify-content:end; gap:10px; }
    @media(max-width:700px) { .school-tracker { padding:14px; } .summary { grid-template-columns:repeat(2,minmax(0,1fr)); } .summary div { padding:12px; } table,tbody { display:block; } thead { display:none; } tr { display:flex; flex-direction:column; border:1px solid var(--color-border-subtle); border-radius:10px; padding:12px; margin-bottom:12px; } td,th { border:0; padding:5px 0; } td[data-label] { display:flex; justify-content:space-between; } td[data-label]::before { content:attr(data-label); color:var(--color-text-muted); } th { font-size:16px; margin-bottom:6px; } td:last-child button { width:100%; margin-top:8px; } .document-row { flex-wrap:wrap; } .filters { padding:12px; } .queue-row { display:grid; grid-template-columns:1fr auto; }.queue-row > div { grid-column:1/-1; }.queue-row button { width:auto; }.queue-heading { align-items:flex-start; } }
</style>

