<script lang="ts">
    import { Download, Search, ArrowUpDown, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-svelte';
    import { buildRequirements, scopedCalendar, summarizeRequirements, riskReason, submissionTerm, type CalendarSlot, type ComplianceLoad, type ComplianceSubmission, type Requirement } from '$lib/utils/compliance';
    let { teachers, schools, loads, calendar, submissions, reviews, year, role }: {
        teachers: { id: string; full_name: string; school_id: string }[];
        schools: { id: string; name: string; district_id: string }[];
        loads: ComplianceLoad[]; calendar: CalendarSlot[]; submissions: ComplianceSubmission[];
        reviews: { submission_id: string; status: string }[]; year: string; role: string;
    } = $props();
    let term = $state('all');
    let week = $state('all');
    let school = $state('all');
    let subject = $state('all');
    let search = $state('');
    let status = $state('all');
    let tab = $state('teachers');
    let selectedTeacher = $state<string | null>(null);
    let page = $state(1);
    let descending = $state(true);
    let sort = $state('missing');
    let exporting = $state(false);
    let exportError = $state('');
    const size = 15;
    const isDistrict = $derived(role === 'District Supervisor');
    const districtOverview = $derived(isDistrict && school === 'all');
    const activeTab = $derived(districtOverview ? 'schools' : tab);
    const requirements = $derived(teachers.flatMap(t => buildRequirements(
        loads.filter(l => l.user_id === t.id),
        scopedCalendar(calendar.filter(c => c.school_year === year), schools.find(s => s.id === t.school_id)?.district_id),
        submissions.filter(s => s.user_id === t.id), reviews,
    )));
    const unmatched = $derived.by(() => {
        const key = (s: ComplianceSubmission) => `${s.teaching_load_id}|${s.school_year}|${submissionTerm(s) ?? s.calendar_id}|${s.week_number}`;
        const matched = new Set(requirements.filter(r => r.submission).map(r => key(r.submission!)));
        return submissions.filter(s => ['compliant', 'late', 'on-time'].includes(s.compliance_status || '') && !matched.has(key(s))).length;
    });
    const weeks = $derived([...new Set(calendar.filter(c => term === 'all' || c.term === Number(term)).map(c => c.week_number))].sort((a, b) => a - b));
    const subjects = $derived([...new Set(loads.map(l => l.subject))].sort());
    const scopedTeachers = $derived(teachers.filter(t => school === 'all' || t.school_id === school));
    const scoped = $derived(requirements.filter(r => scopedTeachers.some(t => t.id === r.teacherId) &&
        (term === 'all' || r.calendar.term === Number(term)) && (week === 'all' || r.calendar.week_number === Number(week)) &&
        (subject === 'all' || r.load.subject === subject)));
    const teacherRows = $derived(scopedTeachers.map(t => {
        const rows = scoped.filter(r => r.teacherId === t.id);
        return { ...t, ...summarizeRequirements(rows), risk: riskReason(rows), rows };
    }).filter(t => (subject === 'all' || t.rows.length > 0) && (!search.trim() || t.full_name.toLowerCase().includes(search.trim().toLowerCase()))).filter(t => status === 'all' ||
        (status === 'risk' && (!!t.risk || t.pending > 0)) || (status === 'complete' && t.expected > 0 && t.submitted === t.expected) ||
        (status === 'missing' && t.missing > 0) || (status === 'late' && t.late > 0) ||
        (status === 'pending' && t.pending > 0) || (status === 'returned' && t.returned > 0) || (status === 'approved' && t.approved > 0)));
    const visible = $derived(scoped.filter(r => teacherRows.some(t => t.id === r.teacherId)));
    const summary = $derived(summarizeRequirements(scoped));
    const schoolRows = $derived(schools.filter(s => school === 'all' || school === s.id).map(s => ({ ...s, ...summarizeRequirements(requirements.filter(r => teachers.find(t => t.id === r.teacherId)?.school_id === s.id && (term === 'all' || r.calendar.term === Number(term)) && (week === 'all' || r.calendar.week_number === Number(week)) && (subject === 'all' || r.load.subject === subject))) })));
    const sortedTeachers = $derived([...teacherRows].sort((a, b) => {
        const value = sort === 'name' ? a.full_name.localeCompare(b.full_name) : sort === 'missing' ? a.missing - b.missing : (a.rate ?? -1) - (b.rate ?? -1);
        return descending ? -value : value;
    }));
    const rankedSchools = $derived(schoolRows.filter(s => (!search.trim() || s.name.toLowerCase().includes(search.trim().toLowerCase())) && (status !== 'risk' || s.missing > 0)).sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name)));
    const subjectRows = $derived([...new Set(scoped.map(r => `${r.load.subject}|${r.load.grade_level || ''}`))].sort().map(key => {
        const rows = scoped.filter(r => `${r.load.subject}|${r.load.grade_level || ''}` === key);
        return { key, label: [rows[0].load.subject, rows[0].load.grade_level].filter(Boolean).join(' / '), ...summarizeRequirements(rows) };
    }));
    const detailRows = $derived(visible.filter(r => (!selectedTeacher || r.teacherId === selectedTeacher) && (tab !== 'missing' || r.status === 'missing') && (tab !== 'reviews' || r.review === 'needs-check' || r.review === 'returned')).sort((a, b) => a.calendar.term - b.calendar.term || a.calendar.week_number - b.calendar.week_number || teacherName(a.teacherId).localeCompare(teacherName(b.teacherId))));
    const rowCount = $derived(activeTab === 'teachers' ? sortedTeachers.length : activeTab === 'schools' ? rankedSchools.length : detailRows.length);
    const pages = $derived(Math.max(1, Math.ceil(rowCount / size)));
    $effect(() => { if (page > pages) page = pages; });
    function reset() { page = 1; }
    function openSchool(id: string) { school = id; search = ''; status = 'all'; selectedTeacher = null; tab = 'teachers'; reset(); }
    function goBack() {
        if (selectedTeacher) { selectedTeacher = null; tab = 'teachers'; }
        else { school = 'all'; tab = 'teachers'; }
        search = ''; status = 'all'; subject = 'all'; reset();
    }
    function teacherName(id: string) { return teachers.find(t => t.id === id)?.full_name || 'Unknown teacher'; }
    function schoolName(id: string) { return schools.find(s => s.id === id)?.name || 'Unassigned school'; }
    function statusLabel(r: Requirement) { return r.status === 'on-time' ? 'On time' : r.status === 'late' ? 'Late, submitted' : r.status === 'missing' ? 'Missing' : 'Upcoming'; }
    function reviewLabel(r: Requirement) { return r.review === 'none' ? '-' : r.review === 'needs-check' ? 'For checking' : r.review === 'returned' ? 'Returned' : 'Approved'; }
    function changeSort(field: string) { descending = sort === field ? !descending : false; sort = field; reset(); }
    async function exportReport() {
        exporting = true; exportError = '';
        try {
            const ExcelJS = await import('exceljs');
            const book = new ExcelJS.Workbook();
            const overview = book.addWorksheet('Summary');
            overview.addRows([
                ['CEDIMS Compliance', year], ['Generated', new Date().toISOString()],
                ['Term', term], ['Week', week], ['School', school === 'all' ? 'All' : schoolName(school)],
                ['Scope', 'All requirements in the selected school and period'],
                ['Expected', summary.expected], ['Submitted', summary.submitted], ['Missing overdue', summary.missing],
                ['Upcoming', summary.upcoming], ['Late submitted', summary.late], ['Approved', summary.approved],
                ['Returned', summary.returned], ['For checking', summary.pending],
                ['Completion %', summary.rate ?? 'N/A'], ['Formula', 'Submitted / expected requirements x 100; late included'],
            ]);
            const people = book.addWorksheet('Teachers');
            people.addRow(['Teacher', 'School', 'Expected', 'Submitted', 'Missing', 'Upcoming', 'Late', 'For checking', 'Approved', 'Returned', 'Completion %', 'Attention']);
            for (const teacher of scopedTeachers) {
                const rows = scoped.filter(r => r.teacherId === teacher.id);
                const t = summarizeRequirements(rows);
                people.addRow([teacher.full_name, schoolName(teacher.school_id), t.expected, t.submitted, t.missing, t.upcoming, t.late, t.pending, t.approved, t.returned, t.rate ?? 'N/A', riskReason(rows)]);
            }
            const subjectsSheet = book.addWorksheet('Subjects');
            subjectsSheet.addRow(['Subject / Grade', 'Expected', 'Submitted', 'Missing', 'Upcoming', 'Late', 'Completion %']);
            for (const s of subjectRows) subjectsSheet.addRow([s.label, s.expected, s.submitted, s.missing, s.upcoming, s.late, s.rate ?? 'N/A']);
            const details = book.addWorksheet('Requirements');
            details.addRow(['School year', 'Teacher', 'School', 'Subject', 'Grade', 'Term', 'Week', 'Deadline', 'Submission status', 'Review status', 'Submitted at', 'Submission ID']);
            for (const r of scoped) details.addRow([year, teacherName(r.teacherId), schoolName(teachers.find(t => t.id === r.teacherId)?.school_id || ''), r.load.subject, r.load.grade_level, r.calendar.term, r.calendar.week_number, r.calendar.deadline_date, statusLabel(r), reviewLabel(r), r.submission?.created_at || '', r.submission?.id || '']);
            for (const sheet of book.worksheets) {
                sheet.views = [{ state: 'frozen', ySplit: 1 }];
                sheet.getRow(1).font = { bold: true };
                sheet.columns.forEach(column => { column.width = 24; });
            }
            const bytes = await book.xlsx.writeBuffer();
            const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
            const link = document.createElement('a'); link.href = url; link.download = `CEDIMS-compliance-${year}-term-${term}.xlsx`; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) { exportError = 'Export failed. Please try again.'; console.error(e); }
        finally { exporting = false; }
    }
</script>

<div class="compliance-workspace">
    <header class="view-heading">
        <div>
            {#if selectedTeacher || (isDistrict && school !== 'all')}<button class="back" onclick={goBack}><ArrowLeft size={16} />{selectedTeacher ? 'Back to teachers' : 'Back to district'}</button>{/if}
            <h2>{selectedTeacher ? teacherName(selectedTeacher) : districtOverview ? 'District compliance' : school !== 'all' ? schoolName(school) : schools[0]?.name || 'School compliance'}</h2>
        </div>
        <button class="export" onclick={exportReport} disabled={exporting || !scoped.length}><Download size={16} />{exporting ? 'Exporting...' : 'Export period report'}</button>
    </header>
    <div class="filters">
        <label>Term<select aria-label="Term" bind:value={term} onchange={() => { week = 'all'; reset(); }}><option value="all">All terms</option>{#each [1, 2, 3] as t}<option value={String(t)}>Term {t}</option>{/each}</select></label>
        <label>Week<select aria-label="Week" bind:value={week} onchange={reset}><option value="all">All weeks</option>{#each weeks as w}<option value={String(w)}>Week {w}</option>{/each}</select></label>
        <span class="period">{year}</span>
    </div>
    {#if exportError}<p role="alert">{exportError}</p>{/if}
    <dl class="stats">
        <div><dt>Submitted</dt><dd>{summary.submitted}<small>of {summary.expected} expected DLLs</small></dd></div>
        <div><dt>Overdue DLLs</dt><dd class:missing={summary.missing > 0}>{summary.missing}<small>{summary.upcoming} upcoming</small></dd></div>
        {#if districtOverview}<div><dt>Schools with overdue work</dt><dd>{schoolRows.filter(s => s.missing > 0).length}<small>of {schoolRows.length} schools</small></dd></div>
        {:else}<div><dt>Review follow-up</dt><dd>{summary.pending + summary.returned}<small>{summary.pending} for checking / {summary.returned} returned</small></dd></div>{/if}
    </dl>
    <div class="completion">
        <strong>Completion: {summary.rate === null ? 'N/A' : summary.rate + '%'}</strong>
        <progress max="100" value={summary.rate || 0} aria-label="Overall submission completion"></progress>
        <span>Late uploads count as submitted. Upcoming DLLs are not overdue.</span>
    </div>
    <div class="list-tools">
        {#if !districtOverview && !selectedTeacher}
            <nav class="tabs" aria-label="School compliance views">
                {#each [['teachers', 'Teachers'], ['missing', 'Missing DLLs'], ['reviews', 'Review follow-up']] as option}
                    <button aria-current={tab === option[0] ? 'page' : undefined} class:active={tab === option[0]} onclick={() => { tab = option[0]; reset(); }}>{option[1]}</button>
                {/each}
            </nav>
        {:else}<h3>{districtOverview ? 'Schools' : 'Submission records'}</h3>{/if}
        {#if !selectedTeacher}
            <label class="search"><span class="sr-only">{districtOverview ? 'Search schools' : 'Search teachers'}</span><div><Search size={16} /><input aria-label={districtOverview ? 'Search schools' : 'Search teachers'} placeholder={districtOverview ? 'Search schools' : 'Search teachers'} bind:value={search} oninput={reset} /></div></label>
            {#if districtOverview || tab === 'teachers'}<label class="attention"><input type="checkbox" checked={status === 'risk'} onchange={(event) => { status = event.currentTarget.checked ? 'risk' : 'all'; reset(); }} />Needs follow-up only</label>{/if}
        {/if}
    </div>
    <div class="table-scroll" role="region" aria-label="Compliance results">
        <table>
            {#if districtOverview}
                <thead><tr><th>School</th><th>Submission progress</th><th>Overdue DLLs</th><th></th></tr></thead>
                <tbody>{#each rankedSchools.slice((page - 1) * size, page * size) as s}
                    <tr><th scope="row">{s.name}</th><td><strong>{s.rate === null ? 'N/A' : s.rate + '%'}</strong><progress max="100" value={s.rate || 0} aria-label={s.name + ' completion'}></progress><small>{s.submitted} of {s.expected} submitted</small></td><td class:missing={s.missing > 0}>{s.missing}</td><td><button class="row-action" onclick={() => openSchool(s.id)}>View school <ChevronRight size={16} /></button></td></tr>
                {/each}</tbody>
            {:else if tab === 'teachers' && !selectedTeacher}
                <thead><tr><th><button onclick={() => changeSort('name')}>Teacher <ArrowUpDown size={14} /></button></th><th>Submission progress</th><th><button onclick={() => changeSort('missing')}>Overdue <ArrowUpDown size={14} /></button></th><th>Follow-up</th><th></th></tr></thead>
                <tbody>{#each sortedTeachers.slice((page - 1) * size, page * size) as t}
                    <tr><th scope="row">{t.full_name}</th><td><strong>{t.rate === null ? 'N/A' : t.rate + '%'}</strong><progress max="100" value={t.rate || 0} aria-label={t.full_name + ' completion'}></progress><small>{t.submitted} of {t.expected} submitted</small></td><td class:missing={t.missing > 0}>{t.missing}</td><td>{t.risk || (t.pending ? t.pending + ' for checking' : t.expected ? 'No follow-up' : 'No requirements')}</td><td><button class="row-action" onclick={() => { selectedTeacher = t.id; tab = 'requirements'; reset(); }}>View DLLs <ChevronRight size={16} /></button></td></tr>
                {/each}</tbody>
            {:else}
                <thead><tr>{#if !selectedTeacher}<th>Teacher</th>{/if}<th>Subject / Grade</th><th>Term / Week</th><th>Deadline</th><th>Status</th>{#if tab !== 'missing'}<th>Review</th>{/if}</tr></thead>
                <tbody>{#each detailRows.slice((page - 1) * size, page * size) as r}
                    <tr>{#if !selectedTeacher}<th scope="row">{teacherName(r.teacherId)}</th>{/if}<td>{r.load.subject}<small>{r.load.grade_level || ''}</small></td><td>Term {r.calendar.term}<small>Week {r.calendar.week_number}</small></td><td>{new Date(r.calendar.deadline_date).toLocaleDateString('en-PH')}</td><td class:missing={r.status === 'missing'}>{statusLabel(r)}</td>{#if tab !== 'missing'}<td>{reviewLabel(r)}</td>{/if}</tr>
                {/each}</tbody>
            {/if}
        </table>
        {#if rowCount === 0}<p class="empty">{calendar.length === 0 ? 'No active calendar weeks for this school year.' : tab === 'missing' && !search ? 'No overdue DLLs for this period.' : tab === 'reviews' && !search ? 'No reviews need follow-up for this period.' : 'No results match this view.'}</p>{/if}
    </div>
    <footer><span>{rowCount ? (page - 1) * size + 1 : 0}-{Math.min(page * size, rowCount)} of {rowCount}</span><div><button aria-label="Previous page" title="Previous page" disabled={page === 1} onclick={() => page--}><ChevronLeft size={18} /></button><span>{page} / {pages}</span><button aria-label="Next page" title="Next page" disabled={page === pages} onclick={() => page++}><ChevronRight size={18} /></button></div></footer>
    {#if unmatched}<details class="data-note"><summary>{unmatched} DLL(s) need an assignment check</summary><p>These files could not be matched to an active term, week, and teaching load. They are excluded from completion totals.</p></details>{/if}
</div>

<style>
    .compliance-workspace { color: var(--color-text-primary); min-width: 0; }
    .view-heading, .list-tools { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 0; }
    h2 { font-size: 20px; font-weight: 700; overflow-wrap: anywhere; } h3 { font-size: 16px; font-weight: 700; }
    .back { color: var(--color-text-muted); font-size: 13px; margin-bottom: 8px; }
    .filters { display: flex; flex-wrap: wrap; gap: 16px; align-items: end; padding-bottom: 16px; }
    label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; font-weight: 600; min-width: 0; }
    select, .search div { min-width: 0; height: 40px; border: 1px solid var(--color-border-subtle); border-radius: 6px; background: var(--color-surface-white); padding: 8px 12px; font-size: 14px; }
    select { width: 160px; } .period { padding: 10px 0; font-size: 13px; color: var(--color-text-muted); }
    .search { width: 220px; max-width: 100%; } .search div { display: flex; gap: 8px; align-items: center; }
    .search input { width: 100%; min-width: 0; background: transparent; }
    .attention { flex-direction: row; align-items: center; gap: 8px; font-size: 13px; }
    button { display: inline-flex; gap: 6px; align-items: center; justify-content: center; min-height: 40px; cursor: pointer; }
    button:disabled { opacity: .5; cursor: default; }
    .export { padding: 8px 12px; border-radius: 6px; border: 1px solid var(--color-border-subtle); font-size: 14px; }
    .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-block: 1px solid var(--color-border-subtle); padding: 20px 0; gap: 20px; }
    dt { font-size: 13px; color: var(--color-text-muted); } dd { font-size: 28px; font-weight: 700; }
    small { display: block; font-size: 12px; font-weight: 400; color: var(--color-text-muted); margin-top: 4px; }
    .completion { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; padding: 16px 0; font-size: 13px; }
    progress { display: block; width: 140px; max-width: 100%; height: 7px; border: 0; border-radius: 4px; overflow: hidden; margin: 6px 0; background: var(--color-surface-muted); accent-color: var(--color-gov-green); }
    progress::-webkit-progress-bar { background: var(--color-surface-muted); } progress::-webkit-progress-value { background: var(--color-gov-green); }
    .tabs { display: flex; gap: 20px; flex-wrap: wrap; } .tabs button { border-bottom: 3px solid transparent; padding: 8px 0; font-size: 14px; }
    .tabs .active { border-color: var(--color-gov-blue); color: var(--color-gov-blue); font-weight: 700; }
    .table-scroll { overflow-x: auto; border-block: 1px solid var(--color-border-subtle); }
    table { width: 100%; border-collapse: collapse; font-size: 14px; text-align: left; }
    th, td { padding: 16px 12px; border-bottom: 1px solid var(--color-border-subtle); vertical-align: middle; min-width: 90px; }
    thead { background: var(--color-surface-muted); font-size: 12px; } th:first-child { min-width: 160px; }
    .row-action { color: var(--color-gov-blue); white-space: nowrap; font-size: 13px; }
    .missing { color: var(--color-gov-red); font-weight: 700; }
    footer, footer div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-block: 12px; font-size: 13px; }
    footer button { width: 40px; border: 1px solid var(--color-border-subtle); border-radius: 6px; }
    .empty { padding: 32px 12px; text-align: center; color: var(--color-text-muted); } .data-note { font-size: 13px; color: var(--color-text-muted); padding: 12px 0; }
    @media (max-width: 600px) { .stats { gap: 12px; } dd { font-size: 24px; } .list-tools { align-items: stretch; } .search { width: 100%; } .completion span { width: 100%; } }
</style>
