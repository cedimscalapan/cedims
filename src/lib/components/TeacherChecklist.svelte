<script lang="ts">
    import { Upload, ChevronLeft, ChevronRight } from 'lucide-svelte';
    import { profile } from '$lib/utils/auth';
    import { buildRequirements, scopedCalendar, summarizeRequirements } from '$lib/utils/compliance';
    export let submissions: any[] = [];
    export let teachingLoads: any[] = [];
    export let calendarWeeks: any[] = [];
    export let title = 'Submission Tracker';
    let term = 'all';
    let status = 'all';
    let page = 1;
    const size = 8;
    $: requirements = buildRequirements(teachingLoads, scopedCalendar(calendarWeeks, $profile?.district_id), submissions);
    $: termRows = requirements.filter(r => term === 'all' || r.calendar.term === Number(term));
    $: summary = summarizeRequirements(termRows);
    $: rows = termRows.filter(r => status === 'all' || r.status === status);
    $: pages = Math.max(1, Math.ceil(rows.length / size));
    $: if (page > pages) page = pages;
</script>

<section class="tracker">
    <header><h2>{title}</h2><div>
        <label>Term <select bind:value={term} on:change={() => page = 1}><option value="all">All terms</option>{#each [1, 2, 3] as t}<option value={String(t)}>Term {t}</option>{/each}</select></label>
        <label>Status <select bind:value={status} on:change={() => page = 1}><option value="all">All statuses</option><option value="missing">Missing</option><option value="upcoming">Upcoming</option><option value="on-time">On time</option><option value="late">Late</option></select></label>
    </div></header>
    <dl>{#each [['Expected', summary.expected], ['Submitted', summary.submitted], ['Missing', summary.missing], ['Upcoming', summary.upcoming], ['Late', summary.late]] as item}<div><dt>{item[0]}</dt><dd>{item[1]}</dd></div>{/each}</dl>
    <p class="formula">Completion: {summary.rate === null ? 'N/A' : `${summary.rate}%`} ({summary.submitted} / {summary.expected}). Late submissions included.</p>
    <div class="scroll"><table><thead><tr><th>Term</th><th>Week</th><th>Subject / Grade</th><th>Deadline</th><th>Status</th><th></th></tr></thead><tbody>
        {#each rows.slice((page - 1) * size, page * size) as row}
            <tr><td>{row.calendar.term}</td><td>{row.calendar.week_number}</td><th scope="row">{row.load.subject}<small>{row.load.grade_level}</small></th><td>{new Date(row.calendar.deadline_date).toLocaleDateString('en-PH')}</td><td class:missing={row.status === 'missing'}>{row.status === 'on-time' ? 'On time' : row.status === 'late' ? 'Late, submitted' : row.status === 'missing' ? 'Missing' : 'Upcoming'}</td><td>{#if !row.submission}<a href="/dashboard/upload" title="Upload DLL" aria-label="Upload DLL"><Upload size={18} /></a>{/if}</td></tr>
        {/each}
    </tbody></table></div>
    {#if rows.length === 0}<p class="empty">No requirements match this view.</p>{/if}
    <footer><span>{rows.length ? (page - 1) * size + 1 : 0}-{Math.min(page * size, rows.length)} of {rows.length}</span><div><button title="Previous page" aria-label="Previous page" disabled={page === 1} on:click={() => page--}><ChevronLeft size={18} /></button><span>{page} / {pages}</span><button title="Next page" aria-label="Next page" disabled={page === pages} on:click={() => page++}><ChevronRight size={18} /></button></div></footer>
</section>
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
    small { display: block; font-weight: 400; } .missing { color: var(--color-gov-red); font-weight: 700; }
    footer { padding: 12px 0; } button, a { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 1px solid var(--color-border-subtle); border-radius: 6px; }
    button:disabled { opacity: .4; } .empty { padding: 24px 0; text-align: center; }
    @media (max-width: 480px) { dl { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
