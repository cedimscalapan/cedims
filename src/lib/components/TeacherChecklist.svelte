<script lang="ts">
    import { Upload, ChevronLeft, ChevronRight, CalendarX } from 'lucide-svelte';
    import { profile } from '$lib/utils/auth';
    import { supabase } from '$lib/utils/supabase';
    import { buildRequirements, scopedCalendar, summarizeRequirements } from '$lib/utils/compliance';
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
    <header><h2>{title}</h2><div>
        <label>Term <select bind:value={term} on:change={() => page = 1}><option value="all">All terms</option>{#each [1, 2, 3] as t}<option value={String(t)}>Term {t}</option>{/each}</select></label>
        <label>Status <select bind:value={status} on:change={() => page = 1}><option value="all">All statuses</option><option value="missing">Missing</option><option value="leave-requested">Leave requested</option><option value="on-leave">On leave</option><option value="upcoming">Upcoming</option><option value="on-time">On time</option><option value="late">Late</option></select></label>
    </div></header>
    <dl>{#each [['Expected', summary.expected], ['Submitted', summary.submitted], ['Missing', summary.missing], ['On leave', summary.onLeave], ['Pending leave', summary.leavePending]] as item}<div><dt>{item[0]}</dt><dd>{item[1]}</dd></div>{/each}</dl>
    <p class="formula">Completion: {summary.rate === null ? 'N/A' : `${summary.rate}%`} ({summary.submitted} / {summary.expected}). Approved leave is excluded from expected submissions.</p>
    <div class="scroll"><table><thead><tr><th>Term</th><th>Week</th><th>Subject / Grade</th><th>Deadline</th><th>Status</th><th></th></tr></thead><tbody>
        {#each rows.slice((page - 1) * size, page * size) as row}
            <tr><td>{row.calendar.term}</td><td>{row.calendar.week_number}</td><th scope="row">{row.load.subject}<small>{row.load.grade_level}</small></th><td>{new Date(row.calendar.deadline_date).toLocaleDateString('en-PH')}</td><td class:missing={row.status === 'missing'} class:leave={row.status === 'on-leave' || row.status === 'leave-requested'}>{label(row)}</td><td class="actions">{#if !row.submission && row.status !== 'on-leave'}<a href="/dashboard/upload" title="Upload DLL" aria-label="Upload DLL"><Upload size={18} /></a>{#if row.status !== 'leave-requested'}<button type="button" title="Request leave or exclusion" aria-label="Request leave or exclusion" on:click={() => openLeave(row)}><CalendarX size={18} /></button>{/if}{/if}</td></tr>
        {/each}
    </tbody></table></div>
    {#if rows.length === 0}<p class="empty">No requirements match this view.</p>{/if}
    <footer><span>{rows.length ? (page - 1) * size + 1 : 0}-{Math.min(page * size, rows.length)} of {rows.length}</span><div><button title="Previous page" aria-label="Previous page" disabled={page === 1} on:click={() => page--}><ChevronLeft size={18} /></button><span>{page} / {pages}</span><button title="Next page" aria-label="Next page" disabled={page === pages} on:click={() => page++}><ChevronRight size={18} /></button></div></footer>
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
    .tracker { min-width: 0; color: var(--color-text-primary); }
    header, header div, footer, footer div { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
    header { padding: 12px 0; } h2 { font-size: 16px; font-weight: 700; }
    label, select, table, footer, .formula { font-size: 13px; }
    select { padding: 8px; border: 1px solid var(--color-border-subtle); border-radius: 6px; background: var(--color-surface-white); }
    dl { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); padding: 16px 0; border-block: 1px solid var(--color-border-subtle); gap: 12px; }
    dt { font-size: 12px; color: var(--color-text-muted); } dd { font-size: 22px; font-weight: 700; }
    .formula { padding: 12px 0; } .scroll { overflow-x: auto; } table { width: 100%; text-align: left; border-collapse: collapse; }
    td, th { padding: 12px; border-bottom: 1px solid var(--color-border-subtle); } thead { background: var(--color-surface-muted); }
    small { display: block; font-weight: 400; } .missing { color: var(--color-gov-red); font-weight: 700; } .leave { color: var(--color-gov-blue); font-weight: 800; }
    footer { padding: 12px 0; } button, a { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 1px solid var(--color-border-subtle); border-radius: 6px; }
    .actions { display: flex; gap: 8px; }
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
    @media (max-width: 480px) { dl { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
