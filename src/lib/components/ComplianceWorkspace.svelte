<script lang="ts">
    import { onMount } from 'svelte';
    import { currentCompliancePeriod, submissionTerm as submissionTermFromPath, type CalendarSlot, type ComplianceLoad, type ComplianceSubmission, type Requirement, buildRequirements, scopedCalendar, summarizeRequirements, riskReason, weekMix, overdueByWeek } from '$lib/utils/compliance';
    import { extractFeatures, runKMeansClustering, canCluster, type ClusterSummary, type ClusterResult } from '$lib/utils/clusterAnalytics';
    import { Download, Search, ArrowLeft, ChevronLeft, ChevronRight, Filter } from 'lucide-svelte';
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
    let status = $state('risk');
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
    let exporting = $state(false);
    let exportError = $state('');
    const size = 15;
    const requirements = $derived(teachers.flatMap(t => buildRequirements(
        loads.filter(l => l.user_id === t.id),
        scopedCalendar(calendar.filter(c => c.school_year === year), schools.find(s => s.id === t.school_id)?.district_id),
        submissions.filter(s => s.user_id === t.id), reviews,
    )));
    const unmatched = $derived.by(() => {
        const key = (s: ComplianceSubmission) => `${s.teaching_load_id}|${s.school_year}|${submissionTermFromPath(s) ?? s.calendar_id}|${s.week_number}`;
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
    const summary = $derived(summarizeRequirements(scoped));
    const termNumber = $derived(term === 'all' ? null : Number(term));
    const clusterSubmissions = $derived(submissions.filter((s): s is ComplianceSubmission & { user_id: string } => {
        if (!s.user_id) return false;
        if (!['compliant', 'on-time', 'late'].includes(s.compliance_status || '')) return false;
        const sTerm = submissionTermFromPath(s);
        return termNumber === null || (sTerm !== null && sTerm <= termNumber);
    }));
    const teacherFeatureVectors = $derived(extractFeatures(
            teachers.map(t => ({ id: t.id, full_name: t.full_name, school_name: schools.find(s => s.id === t.school_id)?.name || '' })),
            clusterSubmissions.map(s => ({ ...s, week_number: s.week_number ?? undefined })),
            Math.max(1, ...calendar.filter(c => termNumber === null || c.term <= termNumber).map(c => c.week_number))
        ));
    const cluster = $derived.by(() => {
        if (!initialized) return null;
        if (districtOverview) {
            const schoolFeatures = schools.map(s => {
                const members = teacherFeatureVectors.filter(t => t.schoolName === s.name);
                const count = Math.max(1, members.length);
                return {
                    teacherId: s.id,
                    teacherName: s.name,
                    schoolName: s.name,
                    punctuality: Math.round(members.reduce((sum, t) => sum + t.punctuality, 0) / count),
                    consistency: Math.round(members.reduce((sum, t) => sum + t.consistency, 0) / count),
                    completeness: Math.round(members.reduce((sum, t) => sum + t.completeness, 0) / count),
                    volume: Math.round(members.reduce((sum, t) => sum + t.volume, 0) / count),
                };
            });
            if (!canCluster(schoolFeatures.length, clusterSubmissions.length)) return null;
            return runKMeansClustering(schoolFeatures, 3);
        }
        const schoolTeacherFeatures = teacherFeatureVectors.filter(t => school === 'all' || teachers.find(teacher => teacher.id === t.teacherId)?.school_id === school);
        if (!canCluster(schoolTeacherFeatures.length, clusterSubmissions.length)) return null;
        return runKMeansClustering(schoolTeacherFeatures, 3);
    });
    function centroidScore(summary: ClusterSummary) { return summary.centroid.reduce((sum: number, value: number) => sum + value, 0); }
    const clusterLabels = $derived(cluster ? [...cluster.summaries].sort((a: ClusterSummary, b: ClusterSummary) => centroidScore(a) - centroidScore(b)).map((s: ClusterSummary) => ({ id: s.clusterId, label: s.label, color: s.color, count: s.count, score: Math.round(centroidScore(s) / s.centroid.length) })) : []);
    const teacherClusters = $derived(cluster ? cluster.results.map((r: ClusterResult) => ({ teacherId: r.teacher.teacherId, clusterId: r.clusterId, label: r.clusterLabel, color: r.clusterColor })) : []);
    const clusterMap = $derived(new Map<string, string>(teacherClusters.map((c: { teacherId: string; label: string }) => [c.teacherId, c.label])));
    const clusterMembers = $derived(new Map(clusterLabels.map(group => [group.label, (districtOverview ? schoolRows : teacherRows)
        .filter(item => clusterMap.get(item.id) === group.label)
        .map(item => 'name' in item ? item.name : item.full_name)
        .sort((a, b) => a.localeCompare(b))])));
    const filteredTeacherRows = $derived(teacherRows.filter(t => clusterFilter === 'all' || clusterMap.get(t.id) === clusterFilter));
    const sortedTeachers = $derived([...filteredTeacherRows].sort((a, b) => b.missing - a.missing || b.forChecking - a.forChecking || a.full_name.localeCompare(b.full_name)));
    const rankedSchools = $derived(schoolRows.filter(s => (!search.trim() || s.name.toLowerCase().includes(search.trim().toLowerCase())) &&
        (status === 'all' || status === 'risk' && s.missing > 0 || status === 'missing' && s.missing > 0 || status === 'for-checking' && s.forChecking > 0) &&
        (clusterFilter === 'all' || clusterMap.get(s.id) === clusterFilter)).sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name)));
    const weekMixData = $derived(weekMix(scoped));
    const termOverdueBars = $derived(overdueByWeek(requirements.filter(r => scopedTeachers.some(t => t.id === r.teacherId) && (term === 'all' || r.calendar.term === Number(term)))));
    const schoolOverdueBars = $derived([...schoolRows].sort((a, b) => b.missing - a.missing));
    const maxTermOverdue = $derived(Math.max(1, ...termOverdueBars.map(b => b.missing)));
    const maxSchoolOverdue = $derived(Math.max(1, ...schoolOverdueBars.map(s => s.missing)));
    const selectedTeacherRows = $derived(scoped.filter(r => selectedTeacher && r.teacherId === selectedTeacher).filter(r => status === 'for-checking' ? r.review === 'for-checking' : status === 'missing' ? r.status === 'missing' : true));
    const rowCount = $derived(activeTab === 'schools' ? rankedSchools.length : activeTab === 'teacher' ? selectedTeacherRows.length : sortedTeachers.length);
    const listTitle = $derived(districtOverview ? 'Schools needing action' : selectedTeacher ? 'DLLs needing action' : 'Teachers needing action');
    const decisionLine = $derived(summary.missing ? `${summary.missing} overdue DLL${summary.missing === 1 ? '' : 's'} need follow-up first.` : summary.forChecking ? `${summary.forChecking} file${summary.forChecking === 1 ? '' : 's'} need Archive remarks.` : 'No immediate follow-up for this period.');
    const pages = $derived(Math.max(1, Math.ceil(rowCount / size)));
    $effect(() => { if (page > pages) page = pages; });
    function reset() { page = 1; }
    function remember() { history = [...history, { school, search, status, cluster: clusterFilter, selectedTeacher, page }]; }
    function openSchool(id: string, missing = false) { remember(); school = id; search = ''; status = missing ? 'missing' : 'all'; clusterFilter = 'all'; selectedTeacher = null; reset(); }
    function openTeacher(id: string, missing = false) { remember(); selectedTeacher = id; clusterFilter = 'all'; search = ''; status = missing ? 'missing' : 'all'; reset(); }
    function goBack() {
        const previous = history.at(-1);
        if (previous) { history = history.slice(0, -1); ({ school, search, status, cluster: clusterFilter, selectedTeacher, page } = previous); return; }
        if (selectedTeacher) { selectedTeacher = null; clusterFilter = 'all'; }
        else { school = 'all'; clusterFilter = 'all'; }
        search = ''; status = 'all'; reset();
    }
    function teacherName(id: string) { return teachers.find(t => t.id === id)?.full_name || 'Unknown teacher'; }
    function schoolName(id: string) { return schools.find(s => s.id === id)?.name || 'Unassigned school'; }
    function clusterLabelFor(id: string) { return clusterMap.get(id) || ''; }
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
            if (districtOverview) {
                for (const item of rankedSchools) {
                    const rows = scoped.filter(r => teachers.find(t => t.id === r.teacherId)?.school_id === item.id);
                    const t = summarizeRequirements(rows);
                    people.addRow([item.name, t.missing, t.forChecking, t.checked, t.rate ?? 'N/A', riskReason(rows)]);
                }
            } else {
                for (const item of sortedTeachers) {
                    const rows = scoped.filter(r => r.teacherId === item.id);
                    const t = summarizeRequirements(rows);
                    people.addRow([item.full_name, t.missing, t.forChecking, t.checked, t.rate ?? 'N/A', riskReason(rows), clusterLabelFor(item.id)]);
                }
            }
            const details = book.addWorksheet('Requirements');
            details.addRow(['School year', 'Teacher', 'School', 'Subject', 'Grade', 'Term', 'Week', 'Deadline', 'Submission status', 'Review status', 'Submitted at', 'Submission ID', 'Cluster']);
            for (const r of scoped) {
                const teacherSchoolId = teachers.find(t => t.id === r.teacherId)?.school_id || '';
                const clusterLabel = districtOverview ? clusterMap.get(teacherSchoolId) || '' : clusterMap.get(r.teacherId) || '';
                details.addRow([year, teacherName(r.teacherId), schoolName(teacherSchoolId), r.load.subject, r.load.grade_level, r.calendar.term, r.calendar.week_number, r.calendar.deadline_date, r.status === 'on-time' ? 'On time' : r.status === 'late' ? 'Late, submitted' : r.status === 'missing' ? 'Missing' : 'Upcoming', r.review === 'none' ? '-' : r.review === 'for-checking' ? 'For checking' : r.review === 'checked' ? 'Checked' : 'None', r.submission?.created_at || '', r.submission?.id || '', clusterLabel]);
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
    const weekMixTotal = $derived(weekMixData.onTime + weekMixData.late + weekMixData.missing);
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
        <div><dt>Overdue</dt><dd class:missing={summary.missing > 0}><button class="count-link" onclick={() => { status = 'missing'; reset(); }} aria-label="Show overdue DLLs" disabled={!summary.missing}>{summary.missing}</button><small>missing DLLs this period</small></dd></div>
        <div><dt>For checking</dt><dd><button class="count-link" onclick={() => { status = 'for-checking'; reset(); }} aria-label="Show files waiting for remarks" disabled={!summary.forChecking}>{summary.forChecking}</button><small>open in Archive for remarks</small></dd></div>
    </dl>
    <div class="decision-strip">
        <strong>{decisionLine}</strong>
        <span>{summary.submitted} of {summary.expected} expected DLLs submitted. Completion: {summary.rate === null ? 'N/A' : summary.rate + '%'}.</span>
        <progress max="100" value={summary.rate || 0} aria-label="Overall submission completion"></progress>
    </div>
    {#if clusterLabels.length}
        <section class="cluster-chips" aria-label={districtOverview ? 'School pattern groups' : 'Teacher pattern groups'}>
            <button class:active={clusterFilter === 'all'} onclick={() => { clusterFilter = 'all'; reset(); }}>
                All {districtOverview ? 'schools' : 'teachers'} <strong>{districtOverview ? schoolRows.length : teacherRows.length}</strong>
            </button>
            {#each clusterLabels as group}
                <button class:active={clusterFilter === group.label} style={"--cluster-color: " + group.color} onclick={() => { clusterFilter = group.label; status = status === 'all' ? 'risk' : status; reset(); }}>
                    <span></span><b>{group.label}</b><strong>{group.count}</strong>
                    <small>{(clusterMembers.get(group.label) || []).slice(0, 4).join(', ')}{(clusterMembers.get(group.label) || []).length > 4 ? '...' : ''}</small>
                </button>
            {/each}
        </section>
        <details class="cluster-note">
            <summary>How grouping works</summary>
            <p>K-means groups {districtOverview ? 'schools' : 'teachers'} by term-to-date submission habits: completeness, punctuality, consistency, and upload volume. Use Building Momentum first for pattern support, then check this week&apos;s overdue list.</p>
        </details>
    {/if}
    <div class="charts">
        {#if weekMixTotal > 0}
            <div class="chart-card mix">
                <h4>This week mix</h4>
                <div class="bar-container" aria-label="This week upload mix">
                    <div class="bar-segment on-time" style="width: {100 * weekMixData.onTime / weekMixTotal}%"><span class="bar-label">On time {weekMixData.onTime}</span></div>
                    <div class="bar-segment late" style="width: {100 * weekMixData.late / weekMixTotal}%"><span class="bar-label">Late {weekMixData.late}</span></div>
                    <div class="bar-segment missing" style="width: {100 * weekMixData.missing / weekMixTotal}%"><span class="bar-label">Missing {weekMixData.missing}</span></div>
                </div>
            </div>
        {/if}
        {#if termOverdueBars.length > 1}
            <div class="chart-card">
                <h4>Weeks in this term</h4>
                <div class="spark-bars" aria-label="Overdue files by week">
                    {#each termOverdueBars as bar}
                        <div>
                            <span style="height: {Math.max(6, 80 * bar.missing / maxTermOverdue)}px"></span>
                            <small>T{bar.term} W{bar.week}</small>
                            <strong>{bar.missing}</strong>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
        {#if districtOverview && schoolOverdueBars.length > 1}
            <div class="chart-card">
                <h4>School overdue bars</h4>
                <div class="horizontal-bars">
                    {#each schoolOverdueBars.slice(0, 8) as item}
                        <button class="horizontal-bar-item" onclick={() => openSchool(item.id, true)}>
                            <span>{item.name}</span>
                            <span class="bar-container-small"><span class="bar-fill overdue" style="width: {100 * item.missing / maxSchoolOverdue}%"></span></span>
                            <strong>{item.missing}</strong>
                        </button>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
    <div class="list-tools">
        <div class="list-header">
            <h3>{listTitle}</h3>
            <div class="list-controls">
                {#if !selectedTeacher}<label class="search"><span class="sr-only">Search {districtOverview ? 'schools' : 'teachers'}</span><div><Search size={16} /><input aria-label={districtOverview ? 'Search schools' : 'Search teachers'} placeholder={districtOverview ? 'Search schools' : 'Search teachers'} bind:value={search} oninput={reset} /></div></label>{/if}
                {#if clusterLabels.length && !selectedTeacher}<label class="cluster-filter"><span class="sr-only">Cluster filter</span><div><Filter size={16} /><select aria-label="Filter by cluster" bind:value={clusterFilter} onchange={reset}><option value="all">All clusters</option>{#each clusterLabels as label}<option value={label.label}>{label.label}</option>{/each}</select></div></label>{/if}
                <label class="attention"><input type="checkbox" checked={status === 'risk'} onchange={(event) => { status = event.currentTarget.checked ? 'risk' : 'all'; reset(); }} />Needs follow-up only</label>
            </div>
        </div>
    </div>
    <div class="action-list" role="region" aria-label="Compliance action list">
        {#if districtOverview}
            {#each rankedSchools.slice((page - 1) * size, page * size) as s}
                <article>
                    <div><h4>{s.name}</h4><p>{s.submitted} of {s.expected} submitted · {s.rate === null ? 'N/A' : s.rate + '%'} complete</p>{#if clusterLabelFor(s.id)}<small>{clusterLabelFor(s.id)}</small>{/if}</div>
                    <div class="action-metrics"><button class="metric missing" disabled={!s.missing} onclick={() => openSchool(s.id, true)}><strong>{s.missing}</strong><span>Overdue</span></button><button class="metric" disabled={!s.forChecking} onclick={() => openSchool(s.id, false)}><strong>{s.forChecking}</strong><span>For checking</span></button></div>
                    <button class="row-action" onclick={() => openSchool(s.id)}>Open school <ChevronRight size={16} /></button>
                </article>
            {/each}
        {:else if selectedTeacher}
            {#each selectedTeacherRows.slice((page - 1) * size, page * size) as r}
                <article>
                    <div><h4>{r.load.subject}</h4><p>{r.load.grade_level || 'No grade'} · Term {r.calendar.term}, Week {r.calendar.week_number}</p><small>Due {new Date(r.calendar.deadline_date).toLocaleDateString('en-PH')}</small></div>
                    <div class="status-pill" class:missing={r.status === 'missing'}>{r.status === 'on-time' ? 'On time' : r.status === 'late' ? 'Late submitted' : r.status === 'missing' ? 'Missing' : 'Upcoming'}</div>
                    {#if r.submission && r.review === "for-checking"}<a class="row-action" href={"/dashboard/archive?review=" + encodeURIComponent(r.submission.id)}>Open Archive <ChevronRight size={16} /></a>{/if}
                </article>
            {/each}
        {:else}
            {#each sortedTeachers.slice((page - 1) * size, page * size) as t}
                <article>
                    <div><h4>{t.full_name}</h4><p>{t.submitted} of {t.expected} submitted · {t.rate === null ? 'N/A' : t.rate + '%'} complete</p>{#if clusterLabelFor(t.id)}<small>{clusterLabelFor(t.id)}</small>{/if}</div>
                    <div class="action-metrics"><button class="metric missing" disabled={!t.missing} onclick={() => openTeacher(t.id, true)}><strong>{t.missing}</strong><span>Overdue</span></button><button class="metric" disabled={!t.forChecking} onclick={() => openTeacher(t.id, false)}><strong>{t.forChecking}</strong><span>For checking</span></button></div>
                    <button class="row-action" onclick={() => openTeacher(t.id)}>Open DLLs <ChevronRight size={16} /></button>
                </article>
            {/each}
        {/if}
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
    .stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-block: 1px solid var(--color-border-subtle); padding: 20px 0; gap: 20px; }
    dt { font-size: 13px; color: var(--color-text-muted); } dd { font-size: 28px; font-weight: 700; }
    small { display: block; font-size: 12px; font-weight: 400; color: var(--color-text-muted); margin-top: 4px; }
    .decision-strip { display: grid; gap: 8px; padding: 16px 0; font-size: 13px; }
    progress { display: block; width: 140px; max-width: 100%; height: 7px; border: 0; border-radius: 4px; overflow: hidden; margin: 6px 0; background: var(--color-surface-muted); accent-color: var(--color-gov-green); }
    progress::-webkit-progress-bar { background: var(--color-surface-muted); } progress::-webkit-progress-value { background: var(--color-gov-green); }
    .cluster-chips { display: flex; flex-wrap: wrap; gap: 10px; padding: 4px 0 10px; }
    .cluster-chips button { min-height: 44px; padding: 8px 12px; border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-white); font-size: 13px; justify-content: flex-start; flex-wrap: wrap; max-width: 320px; }
    .cluster-chips button.active { border-color: var(--color-gov-blue); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-gov-blue) 14%, transparent); }
    .cluster-chips span { width: 10px; height: 10px; border-radius: 999px; background: var(--cluster-color, var(--color-gov-blue)); }
    .cluster-chips strong { margin-left: 2px; color: var(--cluster-color, var(--color-gov-blue)); }
    .cluster-chips small { flex-basis: 100%; margin-left: 18px; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cluster-note { padding: 0 0 12px; color: var(--color-text-muted); font-size: 13px; }
    .cluster-note summary { cursor: pointer; width: fit-content; color: var(--color-gov-blue); font-weight: 700; }
    .cluster-note p { max-width: 820px; margin-top: 8px; }
    .list-header { display: flex; justify-content: space-between; align-items: center; width: 100%; }
    .list-controls { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .cluster-filter select { width: 200px; }
    .row-action { color: var(--color-gov-blue); white-space: nowrap; font-size: 13px; }
    .missing { color: var(--color-gov-red); font-weight: 700; }
    .count-link { color: inherit; font: inherit; text-decoration: underline; text-underline-offset: 4px; min-width: 44px; min-height: 44px; }
    .count-link:disabled { text-decoration: none; opacity: 1; cursor: default; }
    a.row-action { display: flex; align-items: center; min-height: 44px; gap: 6px; }
    .action-list { display: grid; gap: 10px; border-block: 1px solid var(--color-border-subtle); padding: 10px 0; }
    .action-list article { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 14px; align-items: center; padding: 14px 0; border-bottom: 1px solid var(--color-border-subtle); }
    .action-list h4 { font-size: 15px; font-weight: 700; margin: 0; overflow-wrap: anywhere; }
    .action-list p { margin: 4px 0 0; color: var(--color-text-muted); font-size: 13px; }
    .action-list small { color: var(--color-gov-blue); }
    .action-metrics { display: flex; gap: 8px; }
    .metric { display: grid; gap: 1px; min-width: 76px; min-height: 54px; padding: 6px 10px; border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-muted); }
    .metric strong { font-size: 18px; line-height: 1; }
    .metric span { font-size: 11px; color: var(--color-text-muted); }
    .metric.missing strong, .status-pill.missing { color: var(--color-gov-red); }
    .status-pill { justify-self: end; border: 1px solid var(--color-border-subtle); border-radius: 999px; padding: 6px 10px; font-size: 12px; font-weight: 700; }
    .list-header { display: flex; justify-content: space-between; align-items: center; width: 100%; }
    .list-controls { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .cluster-filter select { width: 200px; }
    .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin: 10px 0 16px; }
    .chart-card { background: var(--color-surface-muted); border-radius: 8px; padding: 16px; min-width: 0; }
    .chart-card h4 { font-size: 14px; font-weight: 700; color: var(--color-text-muted); margin: 0 0 12px 0; }
    .bar-container { display: flex; height: 32px; border-radius: 4px; overflow: hidden; }
    .bar-segment { display: flex; align-items: center; justify-content: center; min-width: 0; background: var(--color-gov-green); color: white; font-weight: 600; font-size: 13px; }
    .bar-segment .bar-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 6px; }
    .bar-segment.late { background: var(--color-gov-gold); }
    .bar-segment.missing { background: var(--color-gov-red); }
    .spark-bars { display: grid; grid-template-columns: repeat(auto-fit, minmax(52px, 1fr)); gap: 10px; align-items: end; min-height: 128px; }
    .spark-bars div { display: grid; justify-items: center; align-items: end; gap: 5px; min-width: 0; }
    .spark-bars span { width: 100%; max-width: 30px; min-height: 6px; border-radius: 4px 4px 0 0; background: var(--color-gov-red); }
    .spark-bars small { margin: 0; text-align: center; }
    .spark-bars strong { font-size: 13px; }
    .horizontal-bars { display: flex; flex-direction: column; gap: 12px; }
    .horizontal-bar-item { display: grid; grid-template-columns: minmax(96px, 1fr) minmax(80px, 1.4fr) auto; gap: 12px; align-items: center; width: 100%; text-align: left; }
    button.horizontal-bar-item { min-height: 36px; justify-content: stretch; }
    .bar-container-small { width: 100%; height: 24px; background: var(--color-surface-white); border-radius: 4px; position: relative; overflow: hidden; }
    .bar-fill { height: 100%; background: var(--color-gov-red); border-radius: 4px; transition: width 0.3s ease; }
    .bar-fill.overdue { background: var(--color-gov-red); }
    button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--color-gov-blue); outline-offset: 3px; }
    footer, footer div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-block: 12px; font-size: 13px; }
    footer button { width: 40px; border: 1px solid var(--color-border-subtle); border-radius: 6px; }
    .empty { padding: 32px 12px; text-align: center; color: var(--color-text-muted); } .data-note { font-size: 13px; color: var(--color-text-muted); padding: 12px 0; }
    @media (max-width: 600px) { .stats { gap: 12px; } dd { font-size: 24px; } .list-tools { align-items: stretch; } .search, .cluster-filter { width: 100%; } }
    @media (max-width: 700px) {
        .filters label { flex: 1 1 100px; } select { width: 100%; min-height: 44px; font-size: 16px; }
        .search input, .cluster-filter select { font-size: 16px; } .view-heading > div { min-width: 0; }
        .stats { gap: 12px; } .stats small { overflow-wrap: anywhere; }
        .list-header { flex-direction: column; align-items: stretch; gap: 12px; }
        .list-controls { flex-direction: column; align-items: stretch; }
        .cluster-filter { width: 100%; }
        .charts { grid-template-columns: 1fr; }
        .cluster-chips button { width: 100%; justify-content: space-between; border-radius: 6px; }
        .horizontal-bar-item { grid-template-columns: minmax(0, 1fr); gap: 6px; }
        button.horizontal-bar-item { border-bottom: 1px solid var(--color-border-subtle); padding-bottom: 10px; }
        .action-list article { grid-template-columns: minmax(0, 1fr); align-items: stretch; }
        .action-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .row-action, .action-list .row-action { width: 100%; justify-content: space-between; min-height: 44px; }
        .status-pill { justify-self: stretch; text-align: center; }
        progress { width: 100%; } footer { flex-wrap: wrap; }
    }
</style>
