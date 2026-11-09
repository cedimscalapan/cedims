<script lang="ts">
    import { onMount } from 'svelte';
    import '$lib/styles/simpleTracker.css';
    import PaginationBar from './PaginationBar.svelte';
    import CedimsSelect from './CedimsSelect.svelte';
    import { profile } from '$lib/utils/auth';
    import { supabase } from '$lib/utils/supabase';
    import { buildRequirements, isTeacherWideLeave, scopedCalendar, summarizeRequirements } from '$lib/utils/compliance';
    import { effectiveDeadlineForSubject, phDateKey, submissionWindowOpen } from '$lib/utils/deadlineRules';
    import { formatLeaveRange } from '$lib/utils/leaveDates';
    import LeaveRequestDialog from './LeaveRequestDialog.svelte';
    import { trackerLabel, prioritizeTrackerRows, documentReviewLabel, type ReviewEntry } from '$lib/utils/trackerView';
    import DocumentReviewPanel from './DocumentReviewPanel.svelte';
    export let submissions: any[] = [];
    export let teachingLoads: any[] = [];
    export let calendarWeeks: any[] = [];
    export let leaveRequests: any[] = [];
    export let title = 'Weekly submissions';
    export let onChanged: (() => void) | undefined = undefined;
    export let readOnly = false;
    export let reviewEntries: ReviewEntry[] = [];
    let term = 'all';
    let status = 'all';
    let week = 'all';
    let loadId = 'all';
    let reviewTarget: any = null;
    let page = 1;
    let leaveDialogOpen = false;
    let leaveInitialDay = '';
    let cancellingLeave = '';
    let leaveListError = '';
    let now = Date.now();
    onMount(() => {
        const timer = window.setInterval(() => now = Date.now(), 30000);
        return () => window.clearInterval(timer);
    });
    function actionsOpen(row: any, time: number) {
        return submissionWindowOpen(row.calendar, row.load.subject, row.load.school_name, time);
    }
    const size = 8;
    $: requirements = buildRequirements(teachingLoads, scopedCalendar(calendarWeeks, $profile?.district_id), submissions, [], now, leaveRequests);
    $: weeks = [...new Set(requirements.filter(r => term === 'all' || r.calendar.term === Number(term)).map(r => r.calendar.week_number))].sort((a,b) => a-b);
    $: termRows = requirements.filter(r => (term === 'all' || r.calendar.term === Number(term)) && (week === 'all' || r.calendar.week_number === Number(week)) && (loadId === 'all' || r.load.id === loadId));
    $: summary = summarizeRequirements(termRows);
    $: rows = prioritizeTrackerRows(termRows.filter(r => status === 'all' || (status === 'closed' ? !r.submission && r.status !== 'on-leave' && !actionsOpen(r, now) : r.status === status)));
    $: actionRows = prioritizeTrackerRows(termRows.filter(r => !r.submission && r.status !== 'on-leave' && r.status !== 'leave-requested' && actionsOpen(r, now))).slice(0, 3);
    $: scopeLabel = `${term === 'all' ? 'All terms' : `Term ${term}`} · ${week === 'all' ? 'All weeks' : `Week ${week}`} · ${loadId === 'all' ? 'All teaching loads' : loadLabel(loadId)}`;
    $: leaveCalendar = scopedCalendar(calendarWeeks, $profile?.district_id);
    $: visibleLeaves = leaveRequests.filter(request => request.status !== 'cancelled').slice(0, 6);
    $: pages = Math.max(1, Math.ceil(rows.length / size));
    $: if (page > pages) page = pages;
    function label(row: any) {
        if (row.status === 'on-time') return 'On time';
        if (row.status === 'late') return 'Late, submitted';
        if (row.status === 'missing') return 'Missing';
        if (row.status === 'leave-requested') return 'Leave requested';
        if (row.status === 'on-leave') return 'On Leave / Excluded';
        if (row.status === 'leave-rejected') return 'Leave rejected';
        return 'Upcoming';
    }
    function resetFilters() { term = 'all'; week = 'all'; loadId = 'all'; status = 'all'; page = 1; }
    function openReview(row: any) { reviewTarget = { ...row.submission, subject: row.load.subject, grade_level: row.load.grade_level }; }
    function reviewStatus(row: any) { return row.submission ? documentReviewLabel(reviewEntries.filter(entry => entry.submission_id === row.submission.id)) : ''; }
    function submissionStatus(row: any) {
        const open = actionsOpen(row, now);
        if (!row.submission && row.status === 'upcoming' && open) return 'Upcoming · Open';
        if (!row.submission && !open && row.status !== 'on-leave' && row.status !== 'leave-requested') return 'Closed · No submission';
        return trackerLabel(row, open);
    }
    function formatDeadline(row: any) {
        return effectiveDeadlineForSubject(row.calendar.deadline_date, row.load.subject, row.load.school_name)
            .toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    function loadLabel(id: string) {
        const load = teachingLoads.find(item => item.id === id);
        return load ? `${load.subject} · ${load.grade_level}` : 'Selected teaching load';
    }
    function openLeave(row?: any) {
        leaveInitialDay = row ? phDateKey(row.calendar.deadline_date) : '';
        leaveDialogOpen = true;
    }
    function leaveTitle(request: any) {
        if (isTeacherWideLeave(request)) return formatLeaveRange(request.start_date, request.end_date);
        return `${loadLabel(request.teaching_load_id)} · Term ${request.term_number}, Week ${request.week_number}`;
    }
    function leaveStatusLabel(status: string) {
        return status === 'approved' ? 'Approved' : status === 'rejected' ? 'Declined' : 'Waiting for review';
    }
    async function cancelLeave(request: any) {
        if (cancellingLeave || !confirm(`Withdraw your leave request for ${leaveTitle(request)}?`)) return;
        cancellingLeave = request.id;
        leaveListError = '';
        const { data, error } = await supabase.from('submission_leave_requests')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', request.id).eq('status', 'pending').select('id');
        cancellingLeave = '';
        if (error || !data?.length) {
            leaveListError = error ? 'Could not withdraw this request. Check your connection and try again.' : 'This request was already decided, so it can no longer be withdrawn.';
        }
        onChanged?.();
    }
</script>

<section class="tracker simple-tracker">
    <header>
        <div class="title-row"><div><h2>{title}</h2><p>{readOnly ? 'View deadlines, submission status and documents.' : 'Check deadlines, upload lesson plans and read remarks.'}</p></div>{#if !readOnly}<button type="button" class="request-leave" on:click={() => openLeave()}>Request leave</button>{/if}</div>
    </header>
    <p class="scope">{scopeLabel} · Totals include all statuses</p>

    <dl class="primary-counts">{#each [['Expected', summary.expected], ['Submitted', summary.submitted], ['Remaining', Math.max(0, summary.expected-summary.submitted)], ['Overdue', summary.missing]] as item}<div><dt>{item[0]}</dt><dd>{item[1]}</dd></div>{/each}</dl>
    {#if summary.onLeave || summary.leavePending}<details class="secondary-counts"><summary>Leave status <span>{summary.onLeave} approved · {summary.leavePending} awaiting review</span></summary><div class="leave-counts"><div><dt>On leave / excluded</dt><dd>{summary.onLeave}</dd></div><div><dt>Pending leave requests</dt><dd>{summary.leavePending}</dd></div></div></details>{/if}
    {#if visibleLeaves.length}<details class="leave-list"><summary>{readOnly ? 'Leave requests' : 'My leave requests'} ({visibleLeaves.length})</summary>{#each visibleLeaves as request (request.id)}<div class="leave-row"><div><strong>{leaveTitle(request)}</strong><small>{request.leave_type} · {request.reason}</small>{#if request.reviewer_comment}<small>Reviewer remark: {request.reviewer_comment}</small>{/if}</div><div class="leave-side"><span class="leave-status {request.status}">{leaveStatusLabel(request.status)}</span>{#if !readOnly && request.status === 'pending'}<button type="button" disabled={cancellingLeave === request.id} on:click={() => cancelLeave(request)}>{cancellingLeave === request.id ? 'Withdrawing…' : 'Withdraw'}</button>{/if}</div></div>{/each}{#if leaveListError}<p class="error" role="alert">{leaveListError}</p>{/if}</details>{/if}
    <p class="formula"><strong>{summary.rate === null ? 'N/A' : `${summary.rate}%`} complete</strong> · {summary.submitted} of {summary.expected} submitted. Approved leave is excluded from expected work.</p>
    <details class="filters" ><summary>Find a submission <span>Term {term === 'all' ? '· All' : term} · {status === 'all' ? 'All statuses' : label({ status })}</span></summary>
            <div class="filter-fields">
                <label>Term <CedimsSelect bind:value={term} ariaLabel="Term" options={[{value:'all',label:'All terms'}, ...[1,2,3].map(t=>({value:String(t),label:`Term ${t}`}))]} onChange={() => { page = 1; week = 'all'; }} /></label>
                <label>Week <CedimsSelect bind:value={week} ariaLabel="Week" options={[{value:'all',label:'All weeks'}, ...weeks.map(w=>({value:String(w),label:`Week ${w}`}))]} onChange={() => page = 1} /></label><label>Teaching load <CedimsSelect bind:value={loadId} ariaLabel="Teaching load" options={[{value:'all',label:'All teaching loads'}, ...teachingLoads.map(load=>({value:load.id,label:`${load.subject} · ${load.grade_level}`}))]} onChange={() => page = 1} /></label><label>Status <CedimsSelect bind:value={status} ariaLabel="Status" options={[{value:'all',label:'All statuses'},{value:'missing',label:'Overdue'},{value:'closed',label:'Closed'},{value:'leave-requested',label:'Leave requested'},{value:'on-leave',label:'On leave'},{value:'upcoming',label:'Upcoming'},{value:'on-time',label:'On time'},{value:'late',label:'Late'}]} onChange={() => page = 1} /></label><button type="button" class="reset" on:click={resetFilters}>Reset filters</button>
            </div>
        </details>
    <div class="scroll"><table><thead><tr><th>Term</th><th>Week</th><th>Subject / Grade</th><th>Deadline</th><th>Submission status</th><th>Action</th></tr></thead><tbody>
        {#each rows.slice((page - 1) * size, page * size) as row}
            <tr><td data-label="Term">{row.calendar.term}</td><td data-label="Week">{row.calendar.week_number}</td><th scope="row">{row.load.subject}<small>{row.load.grade_level}</small></th><td data-label="Deadline">{formatDeadline(row)}</td><td data-label="Submission status" class:missing={row.status === 'missing'} class:leave={row.status === 'on-leave' || row.status === 'leave-requested'}>{submissionStatus(row)}{#if readOnly && row.submission}<small class="review-state">Review: {reviewStatus(row)}</small>{/if}</td><td class="actions">{#if row.submission}<button class="text-action" on:click={() => openReview(row)}>{readOnly && reviewStatus(row) === 'For checking' ? 'Review document' : 'View document'}</button>{:else if !readOnly && actionsOpen(row, now) && row.status !== 'on-leave'}<a class="text-action primary-action" href={`/dashboard/upload?load=${encodeURIComponent(row.load.id)}&term=${row.calendar.term}&week=${row.calendar.week_number}`}>Upload DLL</a>{#if row.status !== 'leave-requested'}<button class="text-action" type="button" on:click={() => openLeave(row)}>Request leave</button>{/if}{:else if !readOnly && row.status !== 'on-leave' && row.status !== 'leave-requested'}<button class="text-action" type="button" on:click={() => openLeave(row)}>Request leave</button>{:else}<span class="closed-hint">{row.status === 'on-leave' ? 'Excluded from expected' : row.status === 'leave-requested' ? 'Waiting for leave review' : 'No submission yet'}</span>{/if}</td></tr>
        {/each}
    </tbody></table></div>
    {#if rows.length === 0}<p class="empty">No requirements match this view.</p>{/if}
    <PaginationBar bind:page pages={pages} total={rows.length} pageSize={size} itemLabel="requirements" />
    {#if !readOnly}<details class="next-actions"><summary>Upload and leave shortcuts <span>{actionRows.length}</span></summary>{#each actionRows as row}<div class="next-row"><div><strong>{row.load.subject} · {row.load.grade_level}</strong><small>Term {row.calendar.term}, Week {row.calendar.week_number} · Due {formatDeadline(row)}</small></div><div class="next-action"><span class:missing={row.status === 'missing'}>{row.status === 'missing' ? 'Overdue' : 'Upcoming'}</span><button type="button" on:click={() => openLeave(row)}>Request leave</button><a href={`/dashboard/upload?load=${encodeURIComponent(row.load.id)}&term=${row.calendar.term}&week=${row.calendar.week_number}`}>Upload DLL</a></div></div>{/each}</details>{/if}
</section>
{#if reviewTarget}<DocumentReviewPanel document={reviewTarget} onClose={() => reviewTarget = null} onSaved={onChanged} />{/if}
{#if leaveDialogOpen}<LeaveRequestDialog loads={teachingLoads} calendar={leaveCalendar} {leaveRequests} initialDay={leaveInitialDay} onClose={() => leaveDialogOpen = false} onSaved={() => onChanged?.()} />{/if}
<style>
    .tracker { min-width: 0; padding: 18px; color: var(--color-text-primary); border: 1px solid var(--color-border-subtle); border-radius: 12px; background: var(--color-surface-white); box-shadow: 0 8px 20px rgba(15, 23, 42, .04); }
    .scope { margin: 0 0 14px; color: var(--color-text-secondary); font-size: 14px; font-weight: 650; }
    .next-actions { margin-bottom: 18px; border: 1px solid var(--color-border-subtle); border-left: 4px solid var(--color-gov-blue); border-radius: 8px; padding: 16px 18px; background: var(--color-surface-white); }
    .next-row, .next-action { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    
    .next-row { border-top: 1px solid var(--color-border-subtle); padding: 12px 0; }.next-row:last-child { padding-bottom: 0; }.next-row strong { font-size: 15px; }.next-row small { color: var(--color-text-muted); font-size: 13px; margin-top: 3px; }
    .next-action span { font-size: 13px; font-weight: 700; }.next-action button, .next-action a { padding: 8px 15px; font-weight: 750; white-space: nowrap; }.next-action button { color: var(--color-gov-blue); background: var(--color-surface-white); }.next-action a { background: var(--color-gov-blue); color: white; border-color: var(--color-gov-blue); }
    .review-state { margin-top: 4px; color: var(--color-text-secondary); font-size: 12px; }
    header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
    header > div { width:100%; } header { padding: 0 0 14px; } .filters { width:100%; } .filter-fields label { display:grid; gap:5px; flex:1; min-width:120px; } .reset { padding:8px 12px; align-self:end; color:var(--color-text-primary); } .closed-hint { font-size:12px; color:var(--color-text-muted); } h2 { font-size: 18px; font-weight: 800; } header p { margin-top: 3px; color: var(--color-text-muted); font-size: 13px; }
    .filters, .secondary-counts { border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-white); }
    .filters summary, .secondary-counts summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 40px; padding: 8px 12px; color: var(--color-gov-blue); font-size: 12px; font-weight: 800; cursor: pointer; list-style: none; }
    .filters summary::-webkit-details-marker, .secondary-counts summary::-webkit-details-marker { display: none; }
    .filters summary::after, .secondary-counts summary::after { content: '+'; font-size: 18px; }
    .filters[open] summary::after, .secondary-counts[open] summary::after { content: '−'; }
    .filters summary span, .secondary-counts summary span { color: var(--color-text-muted); font-size: 11px; font-weight: 600; }
    .filter-fields { display: grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap: 10px; padding: 0 12px 12px; }
    label, table, .formula { font-size: 13px; }
    dl { display: grid; gap: 10px; }
    .primary-counts { grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0 0 10px; }
    .primary-counts > div, .leave-counts > div { padding: 12px 14px; border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-muted); }
    dt { font-size: 12px; color: var(--color-text-muted); } dd { margin-top: 3px; font-size: 22px; font-weight: 800; }
    .secondary-counts { margin-bottom: 10px; }
    .leave-counts { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 0 10px 10px; }
    .formula { padding: 8px 0 14px; color: var(--color-text-muted); font-size: 13px; } .formula strong { color: var(--color-text-primary); }
    .scroll { overflow-x: auto; border: 1px solid var(--color-border-subtle); border-radius: 8px; } table { width: 100%; text-align: left; border-collapse: collapse; }
    td, th { padding: 12px; border-bottom: 1px solid var(--color-border-subtle); } thead { background: var(--color-surface-muted); }
    small { display: block; font-weight: 400; } .missing { color: var(--color-gov-red); font-weight: 700; } .leave { color: var(--color-gov-blue); font-weight: 800; }
    button, a { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; border: 1px solid var(--color-border-subtle); border-radius: 6px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; min-width: 240px; }
    .text-action { width: auto; min-width: 106px; padding: 0 12px; color: var(--color-gov-blue); background: #eef4ff; border-color: #b8c7ee; font-size: 13px; font-weight: 800; white-space: nowrap; }
    .text-action.primary-action { color: white; background: var(--color-gov-blue); border-color: var(--color-gov-blue); }
    button:disabled { opacity: .4; } .empty { padding: 24px 0; text-align: center; }
    .title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .request-leave { flex-shrink: 0; padding: 0 16px; color: var(--color-gov-blue); background: var(--color-surface-white); font-size: 14px; font-weight: 800; white-space: nowrap; }
    .leave-list { margin-bottom: 14px; border: 1px solid var(--color-border-subtle); border-radius: 8px; padding: 14px 16px; }
    
    .leave-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; border-top: 1px solid var(--color-border-subtle); padding: 10px 0; }
    .leave-row:last-of-type { padding-bottom: 0; }
    .leave-row strong { font-size: 14px; }
    .leave-row small { margin-top: 3px; color: var(--color-text-secondary); font-size: 13px; overflow-wrap: anywhere; }
    .leave-side { display: flex; flex-shrink: 0; align-items: center; gap: 10px; }
    .leave-side button { padding: 0 14px; color: var(--color-text-primary); background: var(--color-surface-white); font-size: 13px; font-weight: 800; }
    .leave-status { font-size: 13px; font-weight: 800; color: var(--color-gov-gold-dark); white-space: nowrap; }
    .leave-status.approved { color: var(--color-gov-green); }
    .leave-status.rejected { color: var(--color-gov-red); }
    .error { color: var(--color-gov-red); font-weight: 800; }
    @media (max-width: 760px) { .tracker { padding: 12px; } .leave-row { align-items: stretch; flex-direction: column; gap: 8px; } .leave-side { justify-content: space-between; } .title-row { flex-direction: column; } .request-leave { width: 100%; } header { align-items: stretch; } .filters { width: 100%; } .primary-counts { grid-template-columns: repeat(2,minmax(0,1fr)); } .scroll { border:0; overflow:visible; } table,tbody { display:block; } thead { display:none; } tr { display:flex; flex-direction:column; padding:12px; border:1px solid var(--color-border-subtle); border-radius:10px; margin-bottom:10px; } td,th { border:0; padding:5px 0; } th { order:-1; font-size:16px; } td[data-label] { display:flex; justify-content:space-between; gap:12px; } td[data-label]::before { content:attr(data-label); color:var(--color-text-muted); font-size:12px; } .actions { justify-content:flex-start; margin-top:8px; } .leave-counts { grid-template-columns: 1fr; } .actions { min-width: 180px; } .next-row { align-items: stretch; flex-direction: column; gap: 9px; } .next-action { flex-wrap: wrap; justify-content: flex-start; } .next-action span { width: 100%; } }
</style>
