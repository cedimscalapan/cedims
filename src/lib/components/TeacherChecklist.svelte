<script lang="ts">
    import PaginationBar from './PaginationBar.svelte';
    import { profile } from '$lib/utils/auth';
    import { supabase } from '$lib/utils/supabase';
    import { buildRequirements, scopedCalendar, summarizeRequirements } from '$lib/utils/compliance';
    import { effectiveDeadlineForSubject } from '$lib/utils/deadlineRules';
    export let submissions: any[] = [];
    export let teachingLoads: any[] = [];
    export let calendarWeeks: any[] = [];
    export let leaveRequests: any[] = [];
    export let title = 'Submission Tracker';
    export let onChanged: (() => void) | undefined = undefined;
    let term = 'all';
    let status = 'all';
    let page = 1;
    let requesting: any = null;
    let leaveType = 'Sick leave';
    let reason = '';
    let startDate = '';
    let endDate = '';
    let saving = false;
    let error = '';
    const size = 8;
    $: requirements = buildRequirements(teachingLoads, scopedCalendar(calendarWeeks, $profile?.district_id), submissions, [], Date.now(), leaveRequests);
    $: termRows = requirements.filter(r => term === 'all' || r.calendar.term === Number(term));
    $: summary = summarizeRequirements(termRows);
    $: rows = termRows.filter(r => status === 'all' || r.status === status);
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
    function formatDeadline(row: any) {
        return effectiveDeadlineForSubject(row.calendar.deadline_date, row.load.subject, row.load.school_name)
            .toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    function openLeave(row: any) {
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
        <div><h2>{title}</h2><p>See what is due and take the next step for each teaching load.</p></div>
        <details class="filters"><summary>Filter submissions <span>Term {term === 'all' ? '· All' : term} · {status === 'all' ? 'All statuses' : label({ status })}</span></summary>
            <div class="filter-fields">
                <label>Term <select bind:value={term} on:change={() => page = 1}><option value="all">All terms</option>{#each [1, 2, 3] as t}<option value={String(t)}>Term {t}</option>{/each}</select></label>
                <label>Status <select bind:value={status} on:change={() => page = 1}><option value="all">All statuses</option><option value="missing">Missing</option><option value="leave-requested">Leave requested</option><option value="on-leave">On leave</option><option value="upcoming">Upcoming</option><option value="on-time">On time</option><option value="late">Late</option></select></label>
            </div>
        </details>
    </header>
    <dl class="primary-counts">{#each [['Expected', summary.expected], ['Submitted', summary.submitted], ['Missing', summary.missing]] as item}<div><dt>{item[0]}</dt><dd>{item[1]}</dd></div>{/each}</dl>
    <details class="secondary-counts"><summary>Leave status <span>{summary.onLeave} approved · {summary.leavePending} awaiting review</span></summary><div class="leave-counts"><div><dt>On leave / excluded</dt><dd>{summary.onLeave}</dd></div><div><dt>Pending leave requests</dt><dd>{summary.leavePending}</dd></div></div></details>
    <p class="formula"><strong>{summary.rate === null ? 'N/A' : `${summary.rate}%`} complete</strong> · {summary.submitted} of {summary.expected} submitted. Approved leave is excluded from expected submissions.</p>
    <div class="scroll"><table><thead><tr><th>Term</th><th>Week</th><th>Subject / Grade</th><th>Deadline</th><th>Status</th><th></th></tr></thead><tbody>
        {#each rows.slice((page - 1) * size, page * size) as row}
            <tr><td>{row.calendar.term}</td><td>{row.calendar.week_number}</td><th scope="row">{row.load.subject}<small>{row.load.grade_level}</small></th><td>{formatDeadline(row)}</td><td class:missing={row.status === 'missing'} class:leave={row.status === 'on-leave' || row.status === 'leave-requested'}>{label(row)}</td><td class="actions">{#if !row.submission && row.status !== 'on-leave'}<a class="text-action primary-action" href="/dashboard/upload">Upload DLL</a>{#if row.status !== 'leave-requested'}<button class="text-action" type="button" on:click={() => openLeave(row)}>Request leave</button>{/if}{/if}</td></tr>
        {/each}
    </tbody></table></div>
    {#if rows.length === 0}<p class="empty">No requirements match this view.</p>{/if}
    <PaginationBar bind:page pages={pages} total={rows.length} pageSize={size} itemLabel="requirements" />
</section>
{#if requesting}
    <div class="modal-backdrop" role="presentation">
        <form class="leave-modal" on:submit|preventDefault={submitLeave}>
            <h3>Request Leave / Exclusion</h3>
            <p>{requesting.load.subject} · Term {requesting.calendar.term}, Week {requesting.calendar.week_number}</p>
            <label>Leave type <select bind:value={leaveType}><option>Sick leave</option><option>Official travel</option><option>Emergency leave</option><option>Maternity/Paternity leave</option><option>Other</option></select></label>
            <div class="date-grid"><label>Start date <input type="date" bind:value={startDate} /></label><label>End date <input type="date" bind:value={endDate} /></label></div>
            <label>Reason <textarea bind:value={reason} rows="3" placeholder="Briefly explain why this submission should be excluded."></textarea></label>
            {#if error}<p class="error">{error}</p>{/if}
            <div class="modal-actions"><button type="button" on:click={() => requesting = null}>Cancel</button><button class="primary" disabled={saving}>{saving ? 'Sending...' : 'Submit request'}</button></div>
        </form>
    </div>
{/if}
<style>
    .tracker { min-width: 0; padding: 18px; color: var(--color-text-primary); border: 1px solid var(--color-border-subtle); border-radius: 12px; background: var(--color-surface-white); box-shadow: 0 8px 20px rgba(15, 23, 42, .04); }
    header, header div { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
    header { padding: 0 0 14px; } h2 { font-size: 18px; font-weight: 800; } header p { margin-top: 3px; color: var(--color-text-muted); font-size: 13px; }
    .filters, .secondary-counts { border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-white); }
    .filters summary, .secondary-counts summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 40px; padding: 8px 12px; color: var(--color-gov-blue); font-size: 12px; font-weight: 800; cursor: pointer; list-style: none; }
    .filters summary::-webkit-details-marker, .secondary-counts summary::-webkit-details-marker { display: none; }
    .filters summary::after, .secondary-counts summary::after { content: '+'; font-size: 18px; }
    .filters[open] summary::after, .secondary-counts[open] summary::after { content: '−'; }
    .filters summary span, .secondary-counts summary span { color: var(--color-text-muted); font-size: 11px; font-weight: 600; }
    .filter-fields { display: flex; flex-wrap: wrap; gap: 10px; padding: 0 12px 12px; }
    label, select, table, .formula { font-size: 13px; }
    select { padding: 8px; border: 1px solid var(--color-border-subtle); border-radius: 6px; background: var(--color-surface-white); }
    dl { display: grid; gap: 10px; }
    .primary-counts { grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0 0 10px; }
    .primary-counts > div, .leave-counts > div { padding: 12px 14px; border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-muted); }
    dt { font-size: 12px; color: var(--color-text-muted); } dd { margin-top: 3px; font-size: 22px; font-weight: 800; }
    .secondary-counts { margin-bottom: 10px; }
    .leave-counts { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 0 10px 10px; }
    .formula { padding: 8px 0 14px; color: var(--color-text-muted); font-size: 13px; } .formula strong { color: var(--color-text-primary); }
    .scroll { overflow-x: auto; border: 1px solid var(--color-border-subtle); border-radius: 8px; } table { width: 100%; text-align: left; border-collapse: collapse; }
    td, th { padding: 12px; border-bottom: 1px solid var(--color-border-subtle); } thead { background: var(--color-surface-muted); }
    small { display: block; font-weight: 400; } .missing { color: var(--color-gov-red); font-weight: 700; } .leave { color: var(--color-gov-blue); font-weight: 800; }
    button, a { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; border: 1px solid var(--color-border-subtle); border-radius: 6px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; min-width: 240px; }
    .text-action { width: auto; min-width: 106px; padding: 0 12px; color: var(--color-gov-blue); background: #eef4ff; border-color: #b8c7ee; font-size: 13px; font-weight: 800; white-space: nowrap; }
    .text-action.primary-action { color: white; background: var(--color-gov-blue); border-color: var(--color-gov-blue); }
    button:disabled { opacity: .4; } .empty { padding: 24px 0; text-align: center; }
    .modal-backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 20px; background: rgba(15, 23, 42, .35); }
    .leave-modal { width: min(520px, 100%); display: grid; gap: 14px; padding: 20px; border-radius: 8px; background: var(--color-surface-white); box-shadow: 0 18px 44px rgba(15, 23, 42, .25); }
    .leave-modal h3 { font-size: 20px; font-weight: 800; }
    .leave-modal p { color: var(--color-text-secondary); }
    .leave-modal label { display: grid; gap: 6px; font-weight: 800; }
    .leave-modal input, .leave-modal select, .leave-modal textarea { width: 100%; border: 1px solid var(--color-border-subtle); border-radius: 6px; padding: 10px; color: var(--color-text-primary); background: var(--color-surface-white); }
    .date-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .modal-actions { display: flex; justify-content: end; gap: 10px; }
    .modal-actions button { width: auto; padding: 0 14px; font-weight: 800; }
    .modal-actions .primary { color: white; background: var(--color-gov-blue); border-color: var(--color-gov-blue); }
    .error { color: var(--color-gov-red); font-weight: 800; }
    @media (max-width: 600px) { .tracker { padding: 12px; } header { align-items: stretch; } .filters { width: 100%; } .primary-counts { grid-template-columns: 1fr; } .leave-counts { grid-template-columns: 1fr; } .actions { min-width: 180px; } }
</style>
