<script lang="ts">
    import { onMount } from 'svelte';
    import PaginationBar from './PaginationBar.svelte';
    import CedimsSelect from './CedimsSelect.svelte';
    import { profile } from '$lib/utils/auth';
    import { supabase } from '$lib/utils/supabase';
    import { buildRequirements, scopedCalendar, summarizeRequirements } from '$lib/utils/compliance';
    import { effectiveDeadlineForSubject, submissionWindowOpen } from '$lib/utils/deadlineRules';
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
    let requesting: any = null;
    let leaveType = 'Sick leave';
    let reason = '';
    let startDate = '';
    let endDate = '';
    let saving = false;
    let error = '';
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
    $: scopeLabel = `${term === 'all' ? 'All terms' : `Term ${term}`} · ${week === 'all' ? 'All weeks' : `Week ${week}`} · ${loadId === 'all' ? 'All teaching loads' : teachingLoads.find(load => load.id === loadId)?.subject || 'Selected teaching load'}`;
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
    function openLeave(row: any) {
        if (!actionsOpen(row, Date.now())) return;
        requesting = row;
        reason = '';
        error = '';
        startDate = row.calendar.deadline_date?.slice(0, 10) || '';
        endDate = startDate;
    }
    async function submitLeave() {
        if (!requesting || !$profile) return;
        if (!reason.trim()) { error = 'Please add a short reason for the request.'; return; }
        saving = true;
        error = '';
        const { data: calendar, error: calendarError } = await supabase.from('academic_calendar')
            .select('is_active, deadline_date').eq('id', requesting.calendar.id).single();
        if (calendarError || !calendar || !submissionWindowOpen(calendar, requesting.load.subject, requesting.load.school_name)) {
            saving = false;
            error = calendarError ? 'Could not confirm the calendar status. Please try again.' : 'This term and week are Closed in the Academic Calendar. Leave requests are no longer available.';
            return;
        }
        const { error: requestError } = await supabase.from('submission_leave_requests').upsert({
            user_id: $profile.id,
            teaching_load_id: requesting.load.id,
            school_id: $profile.school_id,
            district_id: $profile.district_id,
            school_year: requesting.calendar.school_year,
            term_number: requesting.calendar.term,
            week_number: requesting.calendar.week_number,
            leave_type: leaveType,
            reason: reason.trim(),
            start_date: startDate || null,
            end_date: endDate || null,
            status: 'pending'
        }, { onConflict: 'user_id,teaching_load_id,school_year,term_number,week_number' });
        saving = false;
        if (requestError) { error = requestError.message; return; }
        requesting = null;
        onChanged?.();
    }
</script>

<section class="tracker">
    <header>
        <div><h2>{title}</h2><p>{readOnly ? 'View deadlines, submission status and documents.' : 'Check deadlines, upload lesson plans and read remarks.'}</p></div>

    </header>
    <p class="scope">{scopeLabel} · Totals include all statuses</p>
    {#if !readOnly}<section class="next-actions" aria-labelledby="next-actions-title"><div class="section-heading"><div><h3 id="next-actions-title">Needs your attention</h3><p>{actionRows.length ? 'Upload a DLL or request leave for the relevant week.' : 'No open submissions need action in this view.'}</p></div><span>{actionRows.length} shown</span></div>{#each actionRows as row}<div class="next-row"><div><strong>{row.load.subject} · {row.load.grade_level}</strong><small>Term {row.calendar.term}, Week {row.calendar.week_number} · Due {formatDeadline(row)}</small></div><div class="next-action"><span class:missing={row.status === 'missing'}>{row.status === 'missing' ? 'Overdue' : 'Upcoming'}</span><button type="button" on:click={() => openLeave(row)}>Request leave</button><a href={`/dashboard/upload?load=${encodeURIComponent(row.load.id)}&term=${row.calendar.term}&week=${row.calendar.week_number}`}>Upload DLL</a></div></div>{/each}</section>{/if}
    <dl class="primary-counts">{#each [['Expected', summary.expected], ['Submitted', summary.submitted], ['Remaining', Math.max(0, summary.expected-summary.submitted)], ['Overdue', summary.missing]] as item}<div><dt>{item[0]}</dt><dd>{item[1]}</dd></div>{/each}</dl>
    {#if summary.onLeave || summary.leavePending}<details class="secondary-counts"><summary>Leave status <span>{summary.onLeave} approved · {summary.leavePending} awaiting review</span></summary><div class="leave-counts"><div><dt>On leave / excluded</dt><dd>{summary.onLeave}</dd></div><div><dt>Pending leave requests</dt><dd>{summary.leavePending}</dd></div></div></details>{/if}
    <p class="formula"><strong>{summary.rate === null ? 'N/A' : `${summary.rate}%`} complete</strong> · {summary.submitted} of {summary.expected} submitted. Approved leave is excluded from expected work.</p>
    <details class="filters" ><summary>Find a submission <span>Term {term === 'all' ? '· All' : term} · {status === 'all' ? 'All statuses' : label({ status })}</span></summary>
            <div class="filter-fields">
                <label>Term <CedimsSelect bind:value={term} ariaLabel="Term" options={[{value:'all',label:'All terms'}, ...[1,2,3].map(t=>({value:String(t),label:`Term ${t}`}))]} onChange={() => { page = 1; week = 'all'; }} /></label>
                <label>Week <CedimsSelect bind:value={week} ariaLabel="Week" options={[{value:'all',label:'All weeks'}, ...weeks.map(w=>({value:String(w),label:`Week ${w}`}))]} onChange={() => page = 1} /></label><label>Teaching load <CedimsSelect bind:value={loadId} ariaLabel="Teaching load" options={[{value:'all',label:'All teaching loads'}, ...teachingLoads.map(load=>({value:load.id,label:`${load.subject} · ${load.grade_level}`}))]} onChange={() => page = 1} /></label><label>Status <CedimsSelect bind:value={status} ariaLabel="Status" options={[{value:'all',label:'All statuses'},{value:'missing',label:'Overdue'},{value:'closed',label:'Closed'},{value:'leave-requested',label:'Leave requested'},{value:'on-leave',label:'On leave'},{value:'upcoming',label:'Upcoming'},{value:'on-time',label:'On time'},{value:'late',label:'Late'}]} onChange={() => page = 1} /></label><button type="button" class="reset" on:click={resetFilters}>Reset filters</button>
            </div>
        </details>
    <div class="scroll"><table><thead><tr><th>Term</th><th>Week</th><th>Subject / Grade</th><th>Deadline</th><th>Submission status</th><th>Action</th></tr></thead><tbody>
        {#each rows.slice((page - 1) * size, page * size) as row}
            <tr><td data-label="Term">{row.calendar.term}</td><td data-label="Week">{row.calendar.week_number}</td><th scope="row">{row.load.subject}<small>{row.load.grade_level}</small></th><td data-label="Deadline">{formatDeadline(row)}</td><td data-label="Submission status" class:missing={row.status === 'missing'} class:leave={row.status === 'on-leave' || row.status === 'leave-requested'}>{submissionStatus(row)}{#if readOnly && row.submission}<small class="review-state">Review: {reviewStatus(row)}</small>{/if}</td><td class="actions">{#if row.submission}<button class="text-action" on:click={() => openReview(row)}>{readOnly && reviewStatus(row) === 'For checking' ? 'Review document' : 'View document'}</button>{:else if !readOnly && actionsOpen(row, now) && row.status !== 'on-leave'}<a class="text-action primary-action" href={`/dashboard/upload?load=${encodeURIComponent(row.load.id)}&term=${row.calendar.term}&week=${row.calendar.week_number}`}>Upload DLL</a>{#if row.status !== 'leave-requested'}<button class="text-action" type="button" on:click={() => openLeave(row)}>Request leave</button>{/if}{:else}<span class="closed-hint">{row.status === 'on-leave' ? 'Excluded from expected' : 'No submission yet'}</span>{/if}</td></tr>
        {/each}
    </tbody></table></div>
    {#if rows.length === 0}<p class="empty">No requirements match this view.</p>{/if}
    <PaginationBar bind:page pages={pages} total={rows.length} pageSize={size} itemLabel="requirements" />
</section>
{#if reviewTarget}<DocumentReviewPanel document={reviewTarget} onClose={() => reviewTarget = null} onSaved={onChanged} />{/if}
{#if requesting}
    <div class="modal-backdrop" role="presentation">
        <form class="leave-modal" on:submit|preventDefault={submitLeave}>
            <h3>Request Leave / Exclusion</h3>
            <p>{requesting.load.subject} · Term {requesting.calendar.term}, Week {requesting.calendar.week_number}</p>
            <label>Leave type <CedimsSelect bind:value={leaveType} ariaLabel="Leave type" options={['Sick leave','Official travel','Emergency leave','Maternity/Paternity leave','Other'].map(label=>({value:label,label}))} /></label>
            <div class="date-grid"><label>Start date <input type="date" bind:value={startDate} /></label><label>End date <input type="date" bind:value={endDate} /></label></div>
            <label>Reason <textarea bind:value={reason} rows="3" placeholder="Briefly explain why this submission should be excluded."></textarea></label>
            {#if error}<p class="error">{error}</p>{/if}
            <div class="modal-actions"><button type="button" on:click={() => requesting = null}>Cancel</button><button class="primary" disabled={saving}>{saving ? 'Sending...' : 'Submit request'}</button></div>
        </form>
    </div>
{/if}
<style>
    .tracker { min-width: 0; padding: 18px; color: var(--color-text-primary); border: 1px solid var(--color-border-subtle); border-radius: 12px; background: var(--color-surface-white); box-shadow: 0 8px 20px rgba(15, 23, 42, .04); }
    .scope { margin: 0 0 14px; color: var(--color-text-secondary); font-size: 14px; font-weight: 650; }
    .next-actions { margin-bottom: 18px; border: 1px solid var(--color-border-subtle); border-left: 4px solid var(--color-gov-blue); border-radius: 8px; padding: 16px 18px; background: var(--color-surface-white); }
    .section-heading, .next-row, .next-action { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .section-heading { padding-bottom: 8px; }.section-heading h3 { font-size: 19px; font-weight: 800; }.section-heading p, .section-heading > span { color: var(--color-text-muted); font-size: 13px; }
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
    .modal-backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 20px; background: rgba(15, 23, 42, .35); }
    .leave-modal { width: min(520px, 100%); display: grid; gap: 14px; padding: 20px; border-radius: 8px; background: var(--color-surface-white); box-shadow: 0 18px 44px rgba(15, 23, 42, .25); }
    .leave-modal h3 { font-size: 20px; font-weight: 800; }
    .leave-modal p { color: var(--color-text-secondary); }
    .leave-modal label { display: grid; gap: 6px; font-weight: 800; }
    .leave-modal input, .leave-modal textarea { width: 100%; border: 1px solid var(--color-border-subtle); border-radius: 6px; padding: 10px; color: var(--color-text-primary); background: var(--color-surface-white); }
    .date-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .modal-actions { display: flex; justify-content: end; gap: 10px; }
    .modal-actions button { width: auto; padding: 0 14px; font-weight: 800; }
    .modal-actions .primary { color: white; background: var(--color-gov-blue); border-color: var(--color-gov-blue); }
    .error { color: var(--color-gov-red); font-weight: 800; }
    @media (max-width: 760px) { .tracker { padding: 12px; } header { align-items: stretch; } .filters { width: 100%; } .primary-counts { grid-template-columns: repeat(2,minmax(0,1fr)); } .scroll { border:0; overflow:visible; } table,tbody { display:block; } thead { display:none; } tr { display:flex; flex-direction:column; padding:12px; border:1px solid var(--color-border-subtle); border-radius:10px; margin-bottom:10px; } td,th { border:0; padding:5px 0; } th { order:-1; font-size:16px; } td[data-label] { display:flex; justify-content:space-between; gap:12px; } td[data-label]::before { content:attr(data-label); color:var(--color-text-muted); font-size:12px; } .actions { justify-content:flex-start; margin-top:8px; } .leave-counts { grid-template-columns: 1fr; } .actions { min-width: 180px; } .next-row { align-items: stretch; flex-direction: column; gap: 9px; } .next-action { flex-wrap: wrap; justify-content: flex-start; } .next-action span { width: 100%; } }
</style>
