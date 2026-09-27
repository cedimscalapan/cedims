<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { currentCompliancePeriod, type CalendarSlot, type ComplianceLoad, type ComplianceSubmission, type Requirement, buildRequirements, scopedCalendar, summarizeRequirements, riskReason, weekMix, overdueByWeek } from '$lib/utils/compliance';
    import { extractFeatures, runKMeansClustering, canCluster, type TeacherFeatureVector } from '$lib/utils/clusterAnalytics';
    import { Download, Search, ArrowUpDown, ArrowLeft, ChevronLeft, ChevronRight, Filter } from 'lucide-svelte';
    import type { Profile } from '$lib/utils/auth';
    let { teachers, schools, loads, calendar, submissions, reviews, year, role }: {
        teachers: { id: string; full_name: string; school_id: string }[];
        schools: { id: string; name: string; district_id: string }[];
        loads: ComplianceLoad[];
        calendar: CalendarSlot[];
        submissions: ComplianceSubmission[];
        reviews: { submission_id: string; status?: string | null; reviewer_comment?: string | null }[];
        year: string;
        role: string;
    } = $props();
    let term = $state('all');
    let week = $state('all');
    let school = $state('all');
    let search = $state('');
    let status = $state('all');
    let clusterFilter = $state('all');
    let selectedTeacher = $state<string | null>(null);
    type NavigationState = { school: string; search: string; status: string; cluster: string; selectedTeacher: string | null; page: number };
    let history = $state<NavigationState[]>([]);
    let initialized = $state(false);
    const stateKey = $derived(`compliance-workspace-v2:${role}:${year}:${schools.map(s => s.id).sort().join(',')}`);
    const isDistrict = $derived(role === 'District Supervisor');
    const districtOverview = $derived(isDistrict && school === 'all');
    const activeTab = $derived(districtOverview ? 'schools' : selectedTeacher ? 'teacher' : 'follow-up');
    onMount(() => {
        const period = currentCompliancePeriod(calendar);
        term = period.term; week = period.week;
        try {
            const saved = JSON.parse(sessionStorage.getItem(stateKey) || 'null');
            if (saved && saved.version === 2 && ['all', '1', '2', '3'].includes(saved.term) && (saved.week === 'all' || /^\d+$/.test(saved.week))) {
                term = saved.term; week = saved.week;
                if (saved.school === 'all' || schools.some(s => s.id === saved.school)) school = saved.school;
                if (['all', 'risk', 'missing', 'for-checking'].includes(saved.status)) status = saved.status;
                if (saved.cluster === 'all' || ['Consistently Meeting Standards', 'Steadily Progressing', 'Building Momentum'].includes(saved.cluster)) clusterFilter = saved.cluster;
                if (saved.selectedTeacher && teachers.some(t => t.id === saved.selectedTeacher)) selectedTeacher = saved.selectedTeacher;
                history = Array.isArray(saved.history) ? saved.history : [];
            }
        } catch { /* Storage may be unavailable in private browsing. */ }
        initialized = true;
    });
    $effect(() => {
        if (!initialized) return;
        try { sessionStorage.setItem(stateKey, JSON.stringify({ version: 2, term, week, school, status, cluster: clusterFilter, selectedTeacher, history })); } catch { /* Navigation still works without storage. */ }
    });
    let page = $state(1);
    let descending = $state(true);
    let sort = $state('missing');
    let exporting = $state(false);
    let exportError = $state('');
    const size = 15;
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
    const scopedTeachers = $derived(teachers.filter(t => school === 'all' || t.school_id === school));
    const scoped = $derived(requirements.filter(r => scopedTeachers.some(t => t.id === r.teacherId) &&
        (term === 'all' || r.calendar.term === Number(term)) && (week === 'all' || r.calendar.week_number === Number(week))));
    const teacherRows = $derived(scopedTeachers.map(t => {
        const rows = scoped.filter(r => r.teacherId === t.id);
        return { ...t, ...summarizeRequirements(rows), risk: riskReason(rows), rows };
    }).filter(t => (districtOverview && school === 'all' || !districtOverview) && (!search.trim() || t.full_name.toLowerCase().includes(search.trim().toLowerCase()))).filter(t => status === 'all' ||
        (status === 'risk' && (!!t.risk || t.missing > 0)) || (status === 'missing' && t.missing > 0) ||
        (status === 'for-checking' && t.forChecking > 0)));
    const schoolRows = $derived(schools.filter(s => school === 'all' || school === s.id).map(s => ({ ...s, ...summarizeRequirements(requirements.filter(r => teachers.find(t => t.id === r.teacherId)?.school_id === s.id && (term === 'all' || r.calendar.term === Number(term)) && (week === 'all' || r.calendar.week_number === Number(week)) )) })));
    const visible = $derived(scoped.filter(r => (districtOverview && !selectedTeacher || !districtOverview) && teacherRows.some(t => t.id === r.teacherId)));
    const summary = $derived(summarizeRequirements(scoped));
    const cluster = $derived.by(() => {
        if (!initialized || !canCluster(teachers.length, submissions.length)) return null;
        const features = extractFeatures(
            teachers.map(t => ({ id: t.id, full_name: t.full_name, school_name: schools.find(s => s.id === t.school_id)?.name || '' })),
            submissions.filter(s => ['compliant', 'on-time', 'late'].includes(s.compliance_status || '')),
            Math.max(...calendar.map(c => c.week_number))
        );
        return runKMeansClustering(features, 3);
    });
    const clusterMap = $derived(cluster ? new Map(cluster.results.map(r => [r.teacher.teacherId, r.clusterId])) : new Map());
    const clusterLabels = $derived(cluster ? cluster.summaries.map(s => ({ id: s.clusterId, label: s.label, color: s.color })) : []);
    const teacherClusters = $derived(cluster ? cluster.results.map(r => ({ teacherId: r.teacher.teacherId, clusterId: r.clusterId, label: r.clusterLabel, color: r.clusterColor })) : []);
    const teacherClusterStats = $derived(cluster ? cluster.summaries.map(s => ({ id: s.clusterId, label: s.label, count: s.count })) : []);
    const schoolClusterStats = $derived(cluster ? cluster.summaries.map(s => ({ id: s.clusterId, label: s.label, count: s.count })) : []);
    const schoolClusters = $derived(cluster ? cluster.summaries.map(s => ({ clusterId: s.clusterId, label: s.label, color: s.color, count: s.count, centroid: s.centroid })) : []);
    const clusterStats = $derived(districtOverview ? schoolClusters : teacherClusters);
    const filteredClusterStats = $derived(clusterStats.filter(c => clusterFilter === 'all' || c.label === clusterFilter));
    const filteredTeacherRows = $derived(teacherRows.filter(t => clusterFilter === 'all' || (clusterMap.has(t.id) && clusterMap.get(t.id) !== null && clusterLabels.some(l => l.id === clusterMap.get(t.id) && l.label === clusterFilter))));
    const sortedTeachers = $derived([...filteredTeacherRows].sort((a, b) => {
        const value = sort === 'name' ? a.full_name.localeCompare(b.full_name) : sort === 'missing' ? a.missing - b.missing : (a.rate ?? -1) - (b.rate ?? -1);
        return descending ? -value : value;
    }));
    const rankedSchools = $derived(schoolRows.filter(s => (!search.trim() || s.name.toLowerCase().includes(search.trim().toLowerCase())) && (status !== 'risk' || s.missing > 0)).sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name)));
    const weekMixData = $derived(weekMix(scoped));
    const overdueByWeekData = $derived(overdueByWeek(scoped));
    const termOverdueBars = $derived(week === 'all' ? overdueByWeekData.map(d => ({ term: d.term, week: d.week, missing: d.missing })) : []);
    const schoolOverdueBars = $derived(schoolRows.sort((a, b) => b.missing - a.missing));
    const selectedTeacherRows = $derived(visible.filter(r => selectedTeacher && r.teacherId === selectedTeacher));
    const selectedTeacherStats = $derived(selectedTeacher ? scopedTeachers.find(t => t.id === selectedTeacher) : null);
    const selectedTeacherCluster = $derived(selectedTeacher && cluster ? cluster.results.find(r => r.teacher.teacherId === selectedTeacher) : null);
    const selectedTeacherOverdue = $derived(scoped.filter(r => r.teacherId === selectedTeacher && r.status === 'missing'));
    const selectedTeacherForChecking = $derived(scoped.filter(r => r.teacherId === selectedTeacher && r.review === 'for-checking'));
    const rowCount = $derived(activeTab === 'schools' ? rankedSchools.length : activeTab === 'teacher' ? selectedTeacherRows.length : sortedTeachers.length);
    const pages = $derived(Math.max(1, Math.ceil(rowCount / size)));
    $effect(() => { if (page > pages) page = pages; });
    function reset() { page = 1; }
    function remember() { history = [...history, { school, search, status, cluster: clusterFilter, selectedTeacher, page }]; }
    function openSchool(id: string, missing = false) { remember(); school = id; search = ''; status = 'all'; clusterFilter = 'all'; selectedTeacher = null; reset(); }
    function openTeacher(id: string, missing = false) { remember(); selectedTeacher = id; clusterFilter = 'all'; search = ''; status = 'all'; reset(); }
    function goBack() {
        const previous = history.at(-1);
        if (previous) { history = history.slice(0, -1); ({ school, search, status, cluster: clusterFilter, selectedTeacher, page } = previous); return; }
        if (selectedTeacher) { selectedTeacher = null; clusterFilter = 'all'; }
        else { school = 'all'; clusterFilter = 'all'; }
        search = ''; status = 'all'; reset();
    }
    function teacherName(id: string) { return teachers.find(t => t.id === id)?.full_name || 'Unknown teacher'; }
    function schoolName(id: string) { return schools.find(s => s.id === id)?.name || 'Unassigned school'; }
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
                ['Upcoming', summary.upcoming], ['Late submitted', summary.late], ['Overdue DLLs', summary.missing],
                ['For checking', summary.forChecking], ['Checked', summary.checked], ['Completion %', summary.rate ?? 'N/A'], ['Formula', 'Submitted / expected requirements x 100; late included'],
            ]);
            const people = book.addWorksheet(districtOverview ? 'Schools' : 'Teachers');
            people.addRow(districtOverview ? ['School', 'Overdue DLLs', 'For checking', 'Checked', 'Submission progress', 'Attention'] : ['Teacher', 'Overdue DLLs', 'For checking', 'Checked', 'Submission progress', 'Attention', 'Cluster']);
            for (const item of districtOverview ? rankedSchools : sortedTeachers) {
                const rows = scoped.filter(r => !districtOverview && item.id === item.id || districtOverview && teachers.find(t => t.id === item.id)?.school_id === item.id);
                const t = summarizeRequirements(rows);
                const clusterLabel = !districtOverview && item.id ? teacherClusters.find(c => c.teacherId === item.id)?.label || '' : '';
                const risk = riskReason(rows);
                people.addRow(districtOverview ? [item.name, t.missing, t.forChecking, t.checked, t.rate ?? 'N/A', risk] : [item.full_name, t.missing, t.forChecking, t.checked, t.rate ?? 'N/A', risk, clusterLabel]);
            }
            const details = book.addWorksheet('Requirements');
            details.addRow(['School year', 'Teacher', 'School', 'Subject', 'Grade', 'Term', 'Week', 'Deadline', 'Submission status', 'Review status', 'Submitted at', 'Submission ID', 'Cluster']);
            for (const r of scoped) {
                const clusterLabel = teacherClusters.find(c => c.teacherId === r.teacherId)?.label || '';
                details.addRow([year, teacherName(r.teacherId), schoolName(teachers.find(t => t.id === r.teacherId)?.school_id || ''), r.load.subject, r.load.grade_level, r.calendar.term, r.calendar.week_number, r.calendar.deadline_date, r.status === 'on-time' ? 'On time' : r.status === 'late' ? 'Late, submitted' : r.status === 'missing' ? 'Missing' : 'Upcoming', r.review === 'none' ? '-' : r.review === 'for-checking' ? 'For checking' : r.review === 'checked' ? 'Checked' : 'None', r.submission?.created_at || '', r.submission?.id || '', clusterLabel]);
            }
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
    function submissionTerm(s: Pick<ComplianceSubmission, 'term_number' | 'file_path'>): number | null {
        if (s.term_number && [1, 2, 3].includes(s.term_number)) return s.term_number;
        const match = s.file_path?.match(/(?:^|\/)Term_([1-3])(?:\/|$)/i);
        return match ? Number(match[1]) : null;
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
    {#if exportError}<p role="alert" class="text-gov-red">{exportError}</p>{/if}
    <dl class="stats">
        <div><dt>Overdue DLLs</dt><dd class:missing={summary.missing > 0}><button class="count-link" onclick={() => { status = 'missing'; reset(); }} aria-label="Show overdue DLLs" disabled={!summary.missing}>{summary.missing}</button><small>for {year}</small></dd></div>
        <div><dt>For checking</dt><dd><button class="count-link" onclick={() => { status = 'for-checking'; reset(); }} aria-label="Show files waiting for remarks" disabled={!summary.forChecking}>{summary.forChecking}</button><small>needs remarks</small></dd></div>
        <div><dt>Submitted this period</dt><dd><span class="count-value">{summary.submitted}</span><small>of {summary.expected} expected DLLs</small></dd></div>
    </dl>
    <div class="completion">
        <strong>Submission completion: {summary.rate === null ? 'N/A' : summary.rate + '%'}</strong>
        <progress max="100" value={summary.rate || 0} aria-label="Overall submission completion"></progress>
        <span>Late uploads count as submitted. Upcoming DLLs are not overdue.</span>
    </div>
    <div class="list-tools">
        <div class="list-header">
            <h3>{districtOverview ? 'Schools' : 'Follow-up list'}</h3>
            <div class="list-controls">
                {#if !districtOverview}<label class="search"><span class="sr-only">Search teachers</span><div><Search size={16} /><input aria-label="Search teachers" placeholder="Search teachers" bind:value={search} oninput={reset} /></div></label>{/if}
                {#if !districtOverview}<label class="cluster-filter"><span class="sr-only">Cluster filter</span><div><Filter size={16} /><select aria-label="Filter by cluster" bind:value={clusterFilter} onchange={reset}><option value="all">All clusters</option>{#each clusterLabels as label}<option value={label.label}>{label.label}</option>{/each}</select></div></label>{/if}
                <label class="attention"><input type="checkbox" checked={status === 'risk'} onchange={(event) => { status = event.currentTarget.checked ? 'risk' : 'all'; reset(); }} />Needs follow-up only</label>
            </div>
        </div>
    </div>
    {#if !districtOverview && weekMixData}
        <div class="charts">
            <div class="chart-card">
                <h4>Week mix</h4>
                <div class="bar-container">
                    <div class="bar-segment" style="width: {weekMixData.onTime ? 100 * weekMixData.onTime / (weekMixData.onTime + weekMixData.late + weekMixData.missing) : 0}%">
                        <span class="bar-label">On time: {weekMixData.onTime}</span>
                    </div>
                    <div class="bar-segment late" style="width: {weekMixData.late ? 100 * weekMixData.late / (weekMixData.onTime + weekMixData.late + weekMixData.missing) : 0}%">
                        <span class="bar-label">Late: {weekMixData.late}</span>
                    </div>
                    <div class="bar-segment missing" style="width: {weekMixData.missing ? 100 * weekMixData.missing / (weekMixData.onTime + weekMixData.late + weekMixData.missing) : 0}%">
                        <span class="bar-label">Missing: {weekMixData.missing}</span>
                    </div>
                </div>
            </div>
        </div>
    {/if}
    {#if termOverdueBars && termOverdueBars.length > 0}
        <div class="charts">
            <div class="chart-card">
                <h4>Term overdue</h4>
                <div class="horizontal-bars">
                    {#each termOverdueBars as bar}
                        <div class="horizontal-bar-item">
                            <div class="bar-label">Term {bar.term} Week {bar.week}</div>
                            <div class="bar-container-small">
                                <div class="bar-fill" style="width: {bar.missing > 0 ? Math.min(bar.missing / 10 * 100, 100) : 0}%"></div>
                            </div>
                            <div class="bar-count">{bar.missing}</div>
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    {/if}
    {#if districtOverview && schoolOverdueBars && schoolOverdueBars.length > 0}
        <div class="charts">
            <div class="chart-card">
                <h4>School overdue</h4>
                <div class="horizontal-bars">
                    {#each schoolOverdueBars as school}
                        <div class="horizontal-bar-item">
                            <div class="bar-label">{school.name}</div>
                            <div class="bar-container-small">
                                <div class="bar-fill overdue" style="width: {school.missing > 0 ? Math.min(school.missing / 5 * 100, 100) : 0}%"></div>
                            </div>
                            <div class="bar-count">{school.missing}</div>
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    {/if}
    <div class="table-scroll" role="region" aria-label="Compliance results">
        <table>
            {#if districtOverview}
                <thead><tr><th>School</th><th>Overdue DLLs</th><th>For checking</th><th>Submission progress</th><th></th></tr></thead>
                <tbody>{#each rankedSchools.slice((page - 1) * size, page * size) as s}
                    <tr><th scope="row">{s.name}</th><td data-label="Overdue DLLs" class:missing={s.missing > 0}><button class="count-link" disabled={!s.missing} aria-label={"Show overdue DLLs for " + s.name} onclick={() => openSchool(s.id, true)}>{s.missing}</button></td><td data-label="For checking"><button class="count-link" disabled={!s.forChecking} aria-label={"Show files for checking for " + s.name} onclick={() => openSchool(s.id, false)}>{s.forChecking}</button></td><td data-label="Submission progress"><strong>{s.rate === null ? 'N/A' : s.rate + '%'}</strong><progress max="100" value={s.rate || 0} aria-label={s.name + ' completion'}></progress><small>{s.submitted} of {s.expected} submitted</small></td><td class="actions"><button class="row-action" onclick={() => openSchool(s.id)}>View school <ChevronRight size={16} /></button></td></tr>
                {/each}</tbody>
            {:else if selectedTeacher}
                <thead><tr><th>Subject / Grade</th><th>Term / Week</th><th>Deadline</th><th>Status</th><th>Review</th><th></th></tr></thead>
                <tbody>{#each selectedTeacherRows.slice((page - 1) * size, page * size) as r}
                    <tr><td data-label="Subject / Grade">{r.load.subject}<small>{r.load.grade_level || ''}</small></td><td data-label="Term / Week">Term {r.calendar.term}<small>Week {r.calendar.week_number}</small></td><td data-label="Deadline">{new Date(r.calendar.deadline_date).toLocaleDateString('en-PH')}</td><td data-label="Submission" class:missing={r.status === 'missing'}>{r.status === 'on-time' ? 'On time' : r.status === 'late' ? 'Late, submitted' : r.status === 'missing' ? 'Missing' : 'Upcoming'}</td><td data-label="Review">{r.review === 'none' ? '-' : r.review === 'for-checking' ? 'For checking' : r.review === 'checked' ? 'Checked' : 'None'}{#if r.submission && (r.review === "for-checking" || r.review === "checked")}<a class="row-action" href={"/dashboard/archive?review=" + encodeURIComponent(r.submission.id)}>Review DLL <ChevronRight size={16} /></a>{/if}</td><td class="actions"><button class="row-action" onclick={() => openTeacher(r.teacherId)}>View teacher <ChevronRight size={16} /></button></td></tr>
                {/each}</tbody>
            {:else}
                <thead><tr><th><button onclick={() => changeSort('name')}>Teacher <ArrowUpDown size={14} /></button></th><th>Overdue DLLs</th><th>For checking</th><th>Submission progress</th><th>Cluster</th><th></th></tr></thead>
                <tbody>{#each sortedTeachers.slice((page - 1) * size, page * size) as t}
                    <tr><th scope="row">{t.full_name}</th><td data-label="Overdue DLLs" class:missing={t.missing > 0}><button class="count-link" disabled={!t.missing} aria-label={"Show overdue DLLs for " + t.full_name} onclick={() => openTeacher(t.id, true)}>{t.missing}</button></td><td data-label="For checking"><button class="count-link" disabled={!t.forChecking} aria-label={"Show files for checking for " + t.full_name} onclick={() => openTeacher(t.id, false)}>{t.forChecking}</button></td><td data-label="Submission progress"><strong>{t.rate === null ? 'N/A' : t.rate + '%'}</strong><progress max="100" value={t.rate || 0} aria-label={t.full_name + ' completion'}></progress><small>{t.submitted} of {t.expected} submitted</small></td><td data-label="Cluster">{clusterFilter === 'all' ? (t.id ? teacherClusters.find(c => c.teacherId === t.id)?.label || '' : '') : ''}</td><td class="actions"><button class="row-action" onclick={() => openTeacher(t.id)}>View DLLs <ChevronRight size={16} /></button></td></tr>
                {/each}</tbody>
            {/if}
        </table>
        {#if rowCount === 0}<p class="empty">{calendar.length === 0 ? 'No active calendar weeks for this school year.' : status === 'missing' && !search ? 'No overdue DLLs for this period.' : status === 'for-checking' && !search ? 'No files waiting for remarks for this period.' : 'No results match this view.'}</p>{/if}
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
    select, .search div, .cluster-filter div { min-width: 0; height: 40px; border: 1px solid var(--color-border-subtle); border-radius: 6px; background: var(--color-surface-white); padding: 8px 12px; font-size: 14px; }
    select { width: 160px; } .period { padding: 10px 0; font-size: 13px; color: var(--color-text-muted); }
    .search, .cluster-filter { width: 220px; max-width: 100%; } .search div, .cluster-filter div { display: flex; gap: 8px; align-items: center; }
    .search input, .cluster-filter select { width: 100%; min-width: 0; background: transparent; }
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
    .list-header { display: flex; justify-content: space-between; align-items: center; width: 100%; }
    .list-controls { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .cluster-filter select { width: 200px; }
    .table-scroll { overflow-x: auto; border-block: 1px solid var(--color-border-subtle); }
    table { width: 100%; border-collapse: collapse; font-size: 14px; text-align: left; }
    th, td { padding: 16px 12px; border-bottom: 1px solid var(--color-border-subtle); vertical-align: middle; min-width: 90px; }
    thead { background: var(--color-surface-muted); font-size: 12px; } th:first-child { min-width: 160px; }
    .row-action { color: var(--color-gov-blue); white-space: nowrap; font-size: 13px; }
    .missing { color: var(--color-gov-red); font-weight: 700; }
    .count-link { color: inherit; font: inherit; text-decoration: underline; text-underline-offset: 4px; min-width: 44px; min-height: 44px; }
    .count-link:disabled { text-decoration: none; opacity: 1; cursor: default; }
    a.row-action { display: flex; align-items: center; min-height: 44px; gap: 6px; }
    .list-header { display: flex; justify-content: space-between; align-items: center; width: 100%; }
    .list-controls { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .cluster-filter select { width: 200px; }
    .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin: 16px 0; }
    .chart-card { background: var(--color-surface-muted); border-radius: 8px; padding: 16px; }
    .chart-card h4 { font-size: 14px; font-weight: 700; color: var(--color-text-muted); margin: 0 0 12px 0; }
    .bar-container { display: flex; height: 32px; border-radius: 4px; overflow: hidden; }
    .bar-segment { display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 13px; }
    .bar-segment .bar-label { white-space: nowrap; }
    .bar-segment.late { background: var(--color-gov-gold); }
    .bar-segment.missing { background: var(--color-gov-red); }
    .horizontal-bars { display: flex; flex-direction: column; gap: 12px; }
    .horizontal-bar-item { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; }
    .bar-container-small { width: 100%; height: 24px; background: var(--color-surface-muted); border-radius: 4px; position: relative; }
    .bar-fill { height: 100%; background: var(--color-gov-red); border-radius: 4px; transition: width 0.3s ease; }
    .bar-fill.overdue { background: var(--color-gov-red); }
    .bar-count { font-weight: 700; font-size: 14px; min-width: 24px; text-align: right; }
    button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--color-gov-blue); outline-offset: 3px; }
    footer, footer div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-block: 12px; font-size: 13px; }
    footer button { width: 40px; border: 1px solid var(--color-border-subtle); border-radius: 6px; }
    .empty { padding: 32px 12px; text-align: center; color: var(--color-text-muted); } .data-note { font-size: 13px; color: var(--color-text-muted); padding: 12px 0; }
    @media (max-width: 600px) { .stats { gap: 12px; } dd { font-size: 24px; } .list-tools { align-items: stretch; } .search, .cluster-filter { width: 100%; } .completion span { width: 100%; } }
    @media (max-width: 700px) {
        .filters label { flex: 1 1 100px; } select { width: 100%; min-height: 44px; font-size: 16px; }
        .search input, .cluster-filter select { font-size: 16px; } .view-heading > div { min-width: 0; }
        .stats { gap: 12px; } .stats small { overflow-wrap: anywhere; }
        .list-header { flex-direction: column; align-items: stretch; gap: 12px; }
        .list-controls { flex-direction: column; align-items: stretch; }
        .cluster-filter { width: 100%; }
        .charts { grid-template-columns: 1fr; }
        .table-scroll { overflow: visible; } table, tbody { display: block; }
        thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
        tbody tr { display: grid; grid-template-columns: minmax(0, 1fr); padding: 16px 0; border-bottom: 1px solid var(--color-border-subtle); }
        tbody th, tbody td { min-width: 0; border: 0; padding: 8px 4px; overflow-wrap: anywhere; }
        tbody th { font-size: 16px; } tbody td[data-label]::before { content: attr(data-label); display: block; font-size: 12px; font-weight: 400; color: var(--color-text-muted); margin-bottom: 5px; }
        .actions button { width: 100%; justify-content: space-between; min-height: 44px; }
        progress { width: 100%; } footer { flex-wrap: wrap; }
    }
</style>