<script lang="ts">
    import { Download, Search, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-svelte';
    import { extractFeatures, runKMeansClustering } from '$lib/utils/clusterAnalytics';
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
    let tab = $state(role === 'District Supervisor' ? 'schools' : 'teachers');
    let page = $state(1);
    let descending = $state(false);
    let sort = $state('name');
    let exporting = $state(false);
    let exportError = $state('');
    const size = 15;
    const isDistrict = $derived(role === 'District Supervisor');
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
    const scopedTeachers = $derived(teachers.filter(t => (school === 'all' || t.school_id === school) &&
        (!search.trim() || `${t.full_name} ${schools.find(s => s.id === t.school_id)?.name || ''}`.toLowerCase().includes(search.trim().toLowerCase()))));
    const scoped = $derived(requirements.filter(r => scopedTeachers.some(t => t.id === r.teacherId) &&
        (term === 'all' || r.calendar.term === Number(term)) && (week === 'all' || r.calendar.week_number === Number(week)) &&
        (subject === 'all' || r.load.subject === subject)));
    const teacherRows = $derived(scopedTeachers.map(t => {
        const rows = scoped.filter(r => r.teacherId === t.id);
        return { ...t, ...summarizeRequirements(rows), risk: riskReason(rows), rows };
    }).filter(t => subject === 'all' || t.rows.length > 0).filter(t => status === 'all' ||
        (status === 'risk' && !!t.risk) || (status === 'complete' && t.expected > 0 && t.submitted === t.expected) ||
        (status === 'missing' && t.missing > 0) || (status === 'late' && t.late > 0) ||
        (status === 'pending' && t.pending > 0) || (status === 'returned' && t.returned > 0) || (status === 'approved' && t.approved > 0)));
    const visible = $derived(scoped.filter(r => teacherRows.some(t => t.id === r.teacherId)));
    const summary = $derived(summarizeRequirements(visible));
    const clusters = $derived.by(() => {
        const vectors = teacherRows.filter(t => t.expected > 0).map(t => {
            const weeks = new Set(t.rows.map(r => `${r.calendar.term}|${r.calendar.week_number}`)).size;
            const source = t.rows.filter(r => r.submission).map(r => ({ ...r.submission!, user_id: t.id, week_number: r.calendar.term * 100 + r.calendar.week_number }));
            const vector = extractFeatures([{ id: t.id, full_name: t.full_name, school_name: schoolName(t.school_id) }], source, weeks)[0];
            return { ...vector, completeness: t.rate || 0, punctuality: t.rate || 0 };
        });
        return vectors.length >= 2 ? runKMeansClustering(vectors, Math.min(3, vectors.length)).summaries : [];
    });
    const schoolRows = $derived(schools.filter(s => school === 'all' || school === s.id).map(s => ({ ...s, ...summarizeRequirements(requirements.filter(r => teachers.find(t => t.id === r.teacherId)?.school_id === s.id && (term === 'all' || r.calendar.term === Number(term)) && (week === 'all' || r.calendar.week_number === Number(week)) && (subject === 'all' || r.load.subject === subject))) })));
    const sortedTeachers = $derived([...teacherRows].sort((a, b) => {
        const value = sort === 'name' ? a.full_name.localeCompare(b.full_name) : sort === 'missing' ? a.missing - b.missing : (a.rate ?? -1) - (b.rate ?? -1);
        return descending ? -value : value;
    }));
    const subjectRows = $derived([...new Set(visible.map(r => `${r.load.subject}|${r.load.grade_level || ''}`))].sort().map(key => {
        const rows = visible.filter(r => `${r.load.subject}|${r.load.grade_level || ''}` === key);
        return { key, label: [rows[0].load.subject, rows[0].load.grade_level].filter(Boolean).join(' / '), ...summarizeRequirements(rows) };
    }));
    const detailRows = $derived(visible.filter(r => tab !== 'missing' || r.status === 'missing').sort((a, b) => a.calendar.term - b.calendar.term || a.calendar.week_number - b.calendar.week_number || teacherName(a.teacherId).localeCompare(teacherName(b.teacherId))));
    const matrixWeeks = $derived([...new Set(visible.map(r => `${r.calendar.term}|${r.calendar.week_number}`))].sort((a, b) => Number(a.split('|')[0]) - Number(b.split('|')[0]) || Number(a.split('|')[1]) - Number(b.split('|')[1])));
    const matrixRows = $derived([...new Set(detailRows.map(r => r.load.id))].map(id => {
        const rows = visible.filter(r => r.load.id === id);
        return { id, teacherId: rows[0].teacherId, load: rows[0].load, cells: new Map(rows.map(r => [`${r.calendar.term}|${r.calendar.week_number}`, r])) };
    }));
    const rowCount = $derived(tab === 'teachers' ? sortedTeachers.length : tab === 'schools' ? schoolRows.length : tab === 'subjects' ? subjectRows.length : tab === 'missing' ? matrixRows.length : detailRows.length);
    const pages = $derived(Math.max(1, Math.ceil(rowCount / size)));
    $effect(() => { if (page > pages) page = pages; });
    function reset() { page = 1; }
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
                ['Subject', subject], ['Teacher search', search], ['Status filter', status],
                ['Expected', summary.expected], ['Submitted', summary.submitted], ['Missing overdue', summary.missing],
                ['Upcoming', summary.upcoming], ['Late submitted', summary.late], ['Approved', summary.approved],
                ['Returned', summary.returned], ['For checking', summary.pending],
                ['Completion %', summary.rate ?? 'N/A'], ['Formula', 'Submitted / expected requirements x 100; late included'],
            ]);
            const people = book.addWorksheet('Teachers');
            people.addRow(['Teacher', 'School', 'Expected', 'Submitted', 'Missing', 'Upcoming', 'Late', 'For checking', 'Approved', 'Returned', 'Completion %', 'Attention']);
            for (const t of sortedTeachers) people.addRow([t.full_name, schoolName(t.school_id), t.expected, t.submitted, t.missing, t.upcoming, t.late, t.pending, t.approved, t.returned, t.rate ?? 'N/A', t.risk]);
            const subjectsSheet = book.addWorksheet('Subjects');
            subjectsSheet.addRow(['Subject / Grade', 'Expected', 'Submitted', 'Missing', 'Upcoming', 'Late', 'Completion %']);
            for (const s of subjectRows) subjectsSheet.addRow([s.label, s.expected, s.submitted, s.missing, s.upcoming, s.late, s.rate ?? 'N/A']);
            const details = book.addWorksheet('Requirements');
            details.addRow(['School year', 'Teacher', 'School', 'Subject', 'Grade', 'Term', 'Week', 'Deadline', 'Submission status', 'Review status', 'Submitted at', 'Submission ID']);
            for (const r of visible) details.addRow([year, teacherName(r.teacherId), schoolName(teachers.find(t => t.id === r.teacherId)?.school_id || ''), r.load.subject, r.load.grade_level, r.calendar.term, r.calendar.week_number, r.calendar.deadline_date, statusLabel(r), reviewLabel(r), r.submission?.created_at || '', r.submission?.id || '']);
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
    <div class="filters">
        <label>Term<select bind:value={term} onchange={() => { week = 'all'; reset(); }}><option value="all">All terms</option>{#each [1, 2, 3] as t}<option value={String(t)}>Term {t}</option>{/each}</select></label>
        <label>Week<select bind:value={week} onchange={reset}><option value="all">All weeks</option>{#each weeks as w}<option value={String(w)}>Week {w}</option>{/each}</select></label>
        {#if isDistrict}<label>School<select bind:value={school} onchange={reset}><option value="all">All schools</option>{#each schools as s}<option value={s.id}>{s.name}</option>{/each}</select></label>{/if}
        <label>Subject<select bind:value={subject} onchange={reset}><option value="all">All subjects</option>{#each subjects as s}<option>{s}</option>{/each}</select></label>
        <label>Teacher status<select bind:value={status} onchange={reset}><option value="all">All teachers</option><option value="risk">Needs attention</option><option value="complete">Complete</option><option value="missing">Missing</option><option value="late">Late submissions</option><option value="pending">For checking</option><option value="returned">Returned</option><option value="approved">Approved</option></select></label>
        <label class="search">Search<div><Search size={16} /><input aria-label="Search teachers or schools" placeholder="Teacher or school" bind:value={search} oninput={reset} /></div></label>
        <button class="export" onclick={exportReport} disabled={exporting || !visible.length}><Download size={16} />{exporting ? 'Exporting...' : 'Export Excel'}</button>
    </div>
    {#if exportError}<p role="alert">{exportError}</p>{/if}
    {#if unmatched}<p role="status" class="completion">{unmatched} uploaded DLL(s) could not be matched to an active requirement. Check their term, teaching load, and calendar assignment.</p>{/if}
    <dl class="stats" aria-live="polite">
        {#each [['Expected', summary.expected], ['Submitted', summary.submitted], ['Missing', summary.missing], ['Upcoming', summary.upcoming], ['Late, submitted', summary.late], ['Needs attention', teacherRows.filter(t => t.risk).length]] as stat}
            <div><dt>{stat[0]}</dt><dd>{stat[1]}</dd></div>
        {/each}
    </dl>
    <div class="completion"><strong>Completion: {summary.rate === null ? 'N/A' : `${summary.rate}%`}</strong><span>{summary.submitted} submitted / {summary.expected} expected &times; 100. Late submissions included.</span><span>Due requirements fulfilled: {summary.dueRate === null ? 'N/A' : `${summary.dueRate}%`}</span></div>
    <div class="review-summary"><span>For checking <strong>{summary.pending}</strong></span><span>Approved <strong>{summary.approved}</strong></span><span>Returned <strong>{summary.returned}</strong></span></div>
    {#if clusters.length}<details><summary>Compliance groups</summary><div class="review-summary">{#each clusters as cluster}<span>{cluster.label}: <strong>{cluster.count}</strong> teachers, {cluster.avgCompleteness}% completion</span>{/each}</div></details>{/if}
    <nav class="tabs" aria-label="Compliance views">{#each (isDistrict ? [['schools', 'Schools'], ['teachers', 'Teachers'], ['subjects', 'Subjects'], ['missing', 'Missing matrix'], ['requirements', 'All requirements']] : [['teachers', 'Teachers'], ['subjects', 'Subjects'], ['missing', 'Missing matrix'], ['requirements', 'All requirements']]) as option}<button aria-current={tab === option[0] ? 'page' : undefined} class:active={tab === option[0]} onclick={() => { tab = option[0]; reset(); }}>{option[1]}</button>{/each}</nav>
    <div class="table-scroll" role="region" aria-label="Compliance results">
        <table>
            {#if tab === 'teachers'}
                <thead><tr><th><button onclick={() => changeSort('name')}>Teacher <ArrowUpDown size={14} /></button></th><th>Expected</th><th>Submitted</th><th><button onclick={() => changeSort('missing')}>Missing <ArrowUpDown size={14} /></button></th><th>Upcoming</th><th>Late</th><th>For checking</th><th>Approved</th><th>Returned</th><th><button onclick={() => changeSort('rate')}>Completion <ArrowUpDown size={14} /></button></th><th>Attention</th></tr></thead>
                <tbody>{#each sortedTeachers.slice((page - 1) * size, page * size) as t}<tr><th scope="row">{t.full_name}<small>{schoolName(t.school_id)}</small></th><td>{t.expected}</td><td>{t.submitted}</td><td class:missing={t.missing > 0}>{t.missing}</td><td>{t.upcoming}</td><td>{t.late}</td><td>{t.pending}</td><td>{t.approved}</td><td>{t.returned}</td><td>{t.rate === null ? 'N/A' : `${t.rate}%`}</td><td>{t.risk || (t.expected ? '-' : 'No requirements')}</td></tr>{/each}</tbody>
            {:else if tab === 'missing'}
                <thead><tr><th>Teacher / Subject</th>{#each matrixWeeks as key}<th>Term {key.split('|')[0]}<small>Week {key.split('|')[1]}</small></th>{/each}</tr></thead>
                <tbody>{#each matrixRows.slice((page - 1) * size, page * size) as row}<tr><th scope="row">{teacherName(row.teacherId)}<small>{row.load.subject} / {row.load.grade_level}</small></th>{#each matrixWeeks as key}{@const cell = row.cells.get(key)}<td class:missing={cell?.status === 'missing'}>{cell ? statusLabel(cell) : '-'}</td>{/each}</tr>{/each}</tbody>
            {:else if tab === 'schools'}
                <thead><tr><th>School</th><th>Expected</th><th>Submitted</th><th>Missing</th><th>Upcoming</th><th>Completion</th></tr></thead>
                <tbody>{#each schoolRows.slice((page - 1) * size, page * size) as s}<tr><th scope="row"><button onclick={() => { school = s.id; tab = 'teachers'; reset(); }}>{s.name}</button></th><td>{s.expected}</td><td>{s.submitted}</td><td class:missing={s.missing > 0}>{s.missing}</td><td>{s.upcoming}</td><td>{s.rate === null ? 'N/A' : `${s.rate}%`}</td></tr>{/each}</tbody>
            {:else if tab === 'subjects'}
                <thead><tr><th>Subject / Grade</th><th>Expected</th><th>Submitted</th><th>Missing</th><th>Upcoming</th><th>Late</th><th>Completion</th></tr></thead>
                <tbody>{#each subjectRows.slice((page - 1) * size, page * size) as s}<tr><th scope="row">{s.label}</th><td>{s.expected}</td><td>{s.submitted}</td><td class:missing={s.missing > 0}>{s.missing}</td><td>{s.upcoming}</td><td>{s.late}</td><td>{s.rate === null ? 'N/A' : `${s.rate}%`}</td></tr>{/each}</tbody>
            {:else}
                <thead><tr><th>Teacher</th><th>Subject / Grade</th><th>Term</th><th>Week</th><th>Deadline</th><th>Submission</th><th>Review</th></tr></thead>
                <tbody>{#each detailRows.slice((page - 1) * size, page * size) as r}<tr><th scope="row">{teacherName(r.teacherId)}<small>{schoolName(teachers.find(t => t.id === r.teacherId)?.school_id || '')}</small></th><td>{r.load.subject}<small>{r.load.grade_level || ''}</small></td><td>{r.calendar.term}</td><td>{r.calendar.week_number}</td><td>{new Date(r.calendar.deadline_date).toLocaleString('en-PH')}</td><td class:missing={r.status === 'missing'}>{statusLabel(r)}</td><td>{reviewLabel(r)}</td></tr>{/each}</tbody>
            {/if}
        </table>
        {#if rowCount === 0}<p class="empty">{calendar.length === 0 ? 'No active calendar weeks for this school year.' : 'No results match these filters.'}</p>{/if}
    </div>
    <footer><span>{rowCount ? (page - 1) * size + 1 : 0}-{Math.min(page * size, rowCount)} of {rowCount}</span><div><button aria-label="Previous page" title="Previous page" disabled={page === 1} onclick={() => page--}><ChevronLeft size={18} /></button><span>{page} / {pages}</span><button aria-label="Next page" title="Next page" disabled={page === pages} onclick={() => page++}><ChevronRight size={18} /></button></div></footer>
</div>

<style>
    .compliance-workspace { color: var(--color-text-primary); min-width: 0; }
    .filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; padding-bottom: 20px; }
    label { display: flex; flex: 1 1 135px; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; min-width: 0; }
    select, .search div { width: 100%; min-width: 0; height: 40px; border: 1px solid var(--color-border-subtle); border-radius: 6px; background: var(--color-surface-white); padding: 8px; font-size: 14px; }
    .search div { display: flex; gap: 8px; align-items: center; }
    input { width: 100%; min-width: 0; background: transparent; }
    button { display: inline-flex; gap: 6px; align-items: center; justify-content: center; min-height: 36px; cursor: pointer; }
    button:disabled { opacity: .5; cursor: default; }
    .export { padding: 8px 12px; border-radius: 6px; background: var(--color-gov-blue); color: white; min-height: 40px; }
    .stats { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); border-block: 1px solid var(--color-border-subtle); padding: 18px 0; gap: 16px; }
    dt { font-size: 12px; color: var(--color-text-muted); } dd { font-size: 26px; font-weight: 700; }
    .completion, .review-summary { display: flex; flex-wrap: wrap; gap: 12px 24px; padding: 14px 0; font-size: 13px; }
    .review-summary { border-bottom: 1px solid var(--color-border-subtle); }
    .tabs { display: flex; gap: 16px; flex-wrap: wrap; padding-top: 14px; }
    .tabs button { border-bottom: 3px solid transparent; padding: 8px 0; font-size: 14px; }
    .tabs .active { border-color: var(--color-gov-blue); color: var(--color-gov-blue); font-weight: 700; }
    .table-scroll { overflow-x: auto; border-block: 1px solid var(--color-border-subtle); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; }
    th, td { padding: 12px; border-bottom: 1px solid var(--color-border-subtle); vertical-align: top; min-width: 85px; }
    thead { background: var(--color-surface-muted); } th:first-child { min-width: 180px; }
    small { display: block; font-size: 11px; font-weight: 400; color: var(--color-text-muted); }
    .missing { color: var(--color-gov-red); font-weight: 700; }
    footer, footer div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-block: 12px; font-size: 13px; }
    footer button { width: 36px; border: 1px solid var(--color-border-subtle); border-radius: 6px; }
    .empty { padding: 32px 12px; text-align: center; color: var(--color-text-muted); }
    @media (max-width: 700px) { .stats { grid-template-columns: repeat(3, minmax(0, 1fr)); } .export { width: 100%; } }
</style>
