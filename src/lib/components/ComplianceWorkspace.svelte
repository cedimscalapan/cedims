<script lang="ts">
    import { onMount } from 'svelte';
    import { currentCompliancePeriod, submissionTerm as submissionTermFromPath, type CalendarSlot, type ComplianceLoad, type ComplianceSubmission, type Requirement, buildRequirements, scopedCalendar, summarizeRequirements, riskReason, overdueByWeek, filterSubmissionsByPeriod, summarizeSubmissionReviews, documentTypeCounts, uploadDayCounts, isRemarkRequiredSubmission, isUploadSubmission } from '$lib/utils/compliance';
    import { extractFeatures, runKMeansClustering, canCluster, type ClusterSummary, type ClusterResult } from '$lib/utils/clusterAnalytics';
    import { Download, Search, ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Filter, RefreshCw } from 'lucide-svelte';
    let { teachers, submissionUsers, schools, loads, calendar, submissions, reviews, year, role, yearOptions, onYearChange, refreshing, onRefresh }: {
        teachers: { id: string; full_name: string; school_id: string }[];
        submissionUsers?: { id: string; full_name: string; school_id: string; role?: string | null }[];
        schools: { id: string; name: string; district_id: string }[];
        loads: ComplianceLoad[];
        calendar: CalendarSlot[];
        submissions: ComplianceSubmission[];
        reviews: { submission_id: string; status?: string | null; reviewer_comment?: string | null }[];
        year: string;
        role: string;
        yearOptions?: string[];
        onYearChange?: (year: string) => void;
        refreshing?: boolean;
        onRefresh?: () => void;
    } = $props();
    let term = $state('all');
    let week = $state('all');
    let openPeriodMenu = $state<'year' | 'term' | 'week' | null>(null);
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
    const resolvedYearOptions = $derived(yearOptions?.length ? yearOptions : [year]);
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
    const scopedSubmissionUsers = $derived((submissionUsers?.length ? submissionUsers : teachers).filter(t => school === 'all' || t.school_id === school));
    const scoped = $derived(requirements.filter(r => scopedTeachers.some(t => t.id === r.teacherId) &&
        (term === 'all' || r.calendar.term === Number(term)) && (week === 'all' || r.calendar.week_number === Number(week))));
    const countOpenAsMissing = $derived(week !== 'all');
    const scopedSubmissionUserIds = $derived(new Set(scopedSubmissionUsers.map(t => t.id)));
    const scopedUploadTotals = $derived(submissions.filter(s => s.user_id && scopedSubmissionUserIds.has(s.user_id) && s.school_year === year && isUploadSubmission(s)));
    const scopedUploads = $derived(filterSubmissionsByPeriod(submissions.filter(s => s.user_id && scopedSubmissionUserIds.has(s.user_id) && isUploadSubmission(s)), term, week));
    const scopedReviewSubmissions = $derived(scopedUploads.filter(isRemarkRequiredSubmission));
    const reviewSummary = $derived(summarizeSubmissionReviews(scopedReviewSubmissions, reviews));
    const teacherRows = $derived(scopedTeachers.map(t => {
        const rows = scoped.filter(r => r.teacherId === t.id);
        return { ...t, ...summarizeRequirements(rows, Date.now(), countOpenAsMissing), ...summarizeSubmissionReviews(submissionsForTeacher(t.id), reviews), risk: riskReason(rows), rows };
    }).filter(t => (districtOverview && school === 'all' || !districtOverview) && (!search.trim() || t.full_name.toLowerCase().includes(search.trim().toLowerCase()))).filter(t => status === 'all' ||
        (status === 'risk' && (!!t.risk || t.missing > 0)) || (status === 'missing' && t.missing > 0) ||
        (status === 'for-checking' && t.forChecking > 0)));
    function rowsForSchool(id: string) {
        return requirements.filter(r => teachers.find(t => t.id === r.teacherId)?.school_id === id && (term === 'all' || r.calendar.term === Number(term)) && (week === 'all' || r.calendar.week_number === Number(week)));
    }
    function submissionsForTeacher(id: string) {
        return filterSubmissionsByPeriod(submissions.filter(s => s.user_id === id && isRemarkRequiredSubmission(s)), term, week);
    }
    function submissionsForSchool(id: string) {
        const userIds = new Set((submissionUsers?.length ? submissionUsers : teachers).filter(t => t.school_id === id).map(t => t.id));
        return filterSubmissionsByPeriod(submissions.filter(s => s.user_id && userIds.has(s.user_id) && isRemarkRequiredSubmission(s)), term, week);
    }
    const schoolRows = $derived(schools.filter(s => school === 'all' || school === s.id).map(s => ({ ...s, ...summarizeRequirements(rowsForSchool(s.id), Date.now(), countOpenAsMissing), ...summarizeSubmissionReviews(submissionsForSchool(s.id), reviews) })));
    const summary = $derived({ ...summarizeRequirements(scoped, Date.now(), countOpenAsMissing), ...reviewSummary });
    const reviewMap = $derived(new Map(reviews.map(r => [r.submission_id, r])));
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
    const clusterLabels = $derived(cluster ? [...cluster.summaries].sort((a: ClusterSummary, b: ClusterSummary) => centroidScore(a) - centroidScore(b)).map((s: ClusterSummary, index: number) => ({ id: s.clusterId, label: s.label, color: s.color, count: s.count, score: Math.round(centroidScore(s) / s.centroid.length), priority: index === 0 ? 'Visit first' : index === 1 ? 'Monitor' : 'Maintain' })) : []);
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
    const termOverdueBars = $derived(overdueByWeek(requirements.filter(r => scopedTeachers.some(t => t.id === r.teacherId) && (term === 'all' || r.calendar.term === Number(term)))));
    const schoolOverdueBars = $derived([...schoolRows].sort((a, b) => b.missing - a.missing));
    const visibleTermOverdueBars = $derived(termOverdueBars.filter(bar => bar.missing > 0));
    const visibleSchoolOverdueBars = $derived(schoolOverdueBars.filter(item => item.missing > 0).slice(0, 6));
    const maxTermOverdue = $derived(Math.max(1, ...termOverdueBars.map(b => b.missing)));
    const maxSchoolOverdue = $derived(Math.max(1, ...visibleSchoolOverdueBars.map(s => s.missing)));
    const docTypeData = $derived(documentTypeCounts(scopedUploadTotals));
    const docTypeTotal = $derived(docTypeData.reduce((sum, item) => sum + item.value, 0));
    const supplementaryUploads = $derived(scopedReviewSubmissions.filter(s => ['supplementary', 'extra'].includes((s.compliance_status || '').toLowerCase())).length);
    const uploadDays = $derived(uploadDayCounts(scopedUploads, calendar.filter(c => c.school_year === year), term, week));
    const maxUploadDay = $derived(Math.max(1, ...uploadDays.map(d => d.total)));
    const selectedTeacherRows = $derived(scoped.filter(r => selectedTeacher && r.teacherId === selectedTeacher).filter(r => status === 'missing' ? r.status === 'missing' || (countOpenAsMissing && !r.submission) : status === 'for-checking' ? false : true));
    const selectedTeacherReviewRows = $derived(selectedTeacher && status === 'for-checking'
        ? submissionsForTeacher(selectedTeacher).filter(s => !reviewMap.get(s.id)?.reviewer_comment)
        : []);
    const rowCount = $derived(activeTab === 'schools' ? rankedSchools.length : activeTab === 'teacher' ? (status === 'for-checking' ? selectedTeacherReviewRows.length : selectedTeacherRows.length) : sortedTeachers.length);
    const listTitle = $derived(districtOverview ? 'Schools needing action' : selectedTeacher ? 'DLLs needing action' : 'Teachers needing action');
    const decisionLine = $derived(summary.missing ? `${summary.missing} missing DLL${summary.missing === 1 ? '' : 's'} need follow-up first.` : summary.forChecking ? `${summary.forChecking} file${summary.forChecking === 1 ? ' needs' : 's need'} Archive remarks.` : 'No immediate follow-up for this period.');
    const reviewUploadLine = $derived(`${summary.forChecking + summary.checked} review upload${summary.forChecking + summary.checked === 1 ? '' : 's'}${supplementaryUploads ? ` · ${supplementaryUploads} supplementary` : ''}`);
    const filteredClusterTitle = $derived(clusterFilter === 'all' ? '' : `${clusterFilter}: ${(clusterMembers.get(clusterFilter) || []).join(', ')}`);
    const pages = $derived(Math.max(1, Math.ceil(rowCount / size)));
    $effect(() => { if (page > pages) page = pages; });
    function reset() { page = 1; }
    function selectYear(nextYear: string) { openPeriodMenu = null; if (nextYear !== year) onYearChange?.(nextYear); }
    function selectTerm(nextTerm: string) { term = nextTerm; week = 'all'; openPeriodMenu = null; reset(); }
    function selectWeek(nextWeek: string) { week = nextWeek; openPeriodMenu = null; reset(); }
    function togglePeriodMenu(menu: 'year' | 'term' | 'week') { openPeriodMenu = openPeriodMenu === menu ? null : menu; }
    function remember() { history = [...history, { school, search, status, cluster: clusterFilter, selectedTeacher, page }]; }
    function openSchool(id: string, nextStatus = 'all') { remember(); school = id; search = ''; status = nextStatus; clusterFilter = 'all'; selectedTeacher = null; reset(); }
    function openTeacher(id: string, nextStatus = 'all') { remember(); selectedTeacher = id; clusterFilter = 'all'; search = ''; status = nextStatus; reset(); }
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
    function docColor(label: string) { return label === 'DLP' ? 'var(--color-gov-blue)' : label === 'ISP' ? 'var(--color-gov-green)' : 'var(--color-gov-gold)'; }
    function pieStyle(items: { label: string; value: number }[]) {
        if (!docTypeTotal) return 'background: var(--color-surface-muted)';
        let cursor = 0;
        const stops = items.filter(item => item.value > 0).map(item => {
            const start = cursor;
            cursor += item.value / docTypeTotal * 100;
            return `${docColor(item.label)} ${start}% ${cursor}%`;
        });
        return `background: conic-gradient(${stops.join(', ')})`;
    }
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
                ['Expected', summary.expected], ['Submitted', summary.submitted], ['Missing', summary.missing],
                ['Upcoming', summary.upcoming], ['Late submitted', summary.late],
                ['For checking', summary.forChecking], ['Checked', summary.checked], ['Completion %', summary.rate ?? 'N/A'], ['Formula', 'Submitted / expected requirements x 100; late included'],
            ]);
            const people = book.addWorksheet(districtOverview ? 'Schools' : 'Teachers');
            people.addRow(districtOverview ? ['School', 'Missing DLLs', 'For checking', 'Checked', 'Submission progress', 'Attention'] : ['Teacher', 'Missing DLLs', 'For checking', 'Checked', 'Submission progress', 'Attention', 'Cluster']);
            if (districtOverview) {
                for (const item of rankedSchools) {
                    const rows = scoped.filter(r => teachers.find(t => t.id === r.teacherId)?.school_id === item.id);
                    const t = { ...summarizeRequirements(rows, Date.now(), countOpenAsMissing), ...summarizeSubmissionReviews(submissionsForSchool(item.id), reviews) };
                    people.addRow([item.name, t.missing, t.forChecking, t.checked, t.rate ?? 'N/A', riskReason(rows)]);
                }
            } else {
                for (const item of sortedTeachers) {
                    const rows = scoped.filter(r => r.teacherId === item.id);
                    const t = { ...summarizeRequirements(rows, Date.now(), countOpenAsMissing), ...summarizeSubmissionReviews(submissionsForTeacher(item.id), reviews) };
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
</script>

<div class="compliance-workspace">
    <section class="control-panel">
        <header class="view-heading">
            <div class="heading-main">
            {#if selectedTeacher || (isDistrict && school !== 'all')}<button class="back" onclick={goBack}><ArrowLeft size={16} />{selectedTeacher ? 'Back to teachers' : 'Back to district'}</button>{/if}
            <h2>{selectedTeacher ? teacherName(selectedTeacher) : districtOverview ? 'District compliance' : school !== 'all' ? schoolName(school) : schools[0]?.name || 'School compliance'}</h2>
            </div>
            <button class="export" onclick={exportReport} disabled={exporting || !scoped.length}><Download size={16} />{exporting ? 'Exporting...' : 'Export period report'}</button>
        </header>
        <div class="filters">
            <div class="picker-field">
                <span>School year</span>
                <div class="picker">
                    <button type="button" class="picker-trigger" aria-haspopup="listbox" aria-expanded={openPeriodMenu === 'year'} onclick={() => togglePeriodMenu('year')}>
                        <strong>{year}</strong>{#if openPeriodMenu === 'year'}<ChevronUp size={18} />{:else}<ChevronDown size={18} />{/if}
                    </button>
                    {#if openPeriodMenu === 'year'}
                        <div class="picker-menu" role="listbox" aria-label="School year">
                            {#each resolvedYearOptions as option}
                                <button type="button" role="option" aria-selected={option === year} class:active={option === year} onclick={() => selectYear(option)}>{option}</button>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
            <div class="picker-field">
                <span>Term</span>
                <div class="picker">
                    <button type="button" class="picker-trigger" aria-haspopup="listbox" aria-expanded={openPeriodMenu === 'term'} onclick={() => togglePeriodMenu('term')}>
                        <strong>{term === 'all' ? 'All terms' : `Term ${term}`}</strong>{#if openPeriodMenu === 'term'}<ChevronUp size={18} />{:else}<ChevronDown size={18} />{/if}
                    </button>
                    {#if openPeriodMenu === 'term'}
                        <div class="picker-menu" role="listbox" aria-label="Term">
                            <button type="button" role="option" aria-selected={term === 'all'} class:active={term === 'all'} onclick={() => selectTerm('all')}>All terms</button>
                            {#each [1, 2, 3] as t}
                                <button type="button" role="option" aria-selected={term === String(t)} class:active={term === String(t)} onclick={() => selectTerm(String(t))}>Term {t}</button>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
            <div class="picker-field">
                <span>Week</span>
                <div class="picker">
                    <button type="button" class="picker-trigger" aria-haspopup="listbox" aria-expanded={openPeriodMenu === 'week'} onclick={() => togglePeriodMenu('week')}>
                        <strong>{week === 'all' ? 'All weeks' : `Week ${week}`}</strong>{#if openPeriodMenu === 'week'}<ChevronUp size={18} />{:else}<ChevronDown size={18} />{/if}
                    </button>
                    {#if openPeriodMenu === 'week'}
                        <div class="picker-menu" role="listbox" aria-label="Week">
                            <button type="button" role="option" aria-selected={week === 'all'} class:active={week === 'all'} onclick={() => selectWeek('all')}>All weeks</button>
                            {#each weeks as w}
                                <button type="button" role="option" aria-selected={week === String(w)} class:active={week === String(w)} onclick={() => selectWeek(String(w))}>Week {w}</button>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
            {#if onRefresh}<button class="refresh" type="button" disabled={refreshing} onclick={onRefresh}><RefreshCw size={16} />{refreshing ? 'Refreshing...' : 'Refresh'}</button>{/if}
        </div>
    </section>
    {#if exportError}<p role="alert" class="text-gov-red">{exportError}</p>{/if}
    <section class="summary-panel">
        <div class="decision-strip">
            <strong>{decisionLine}</strong>
            <span>DLL compliance: {summary.submitted} of {summary.expected} expected submitted · {summary.rate === null ? 'N/A' : summary.rate + '%'} complete.</span>
            <small>{reviewUploadLine}</small>
            <progress max="100" value={summary.rate || 0} aria-label="Overall submission completion"></progress>
        </div>
        <dl class="stats">
            <div><dt>On time</dt><dd>{summary.onTime}<small>before deadline</small></dd></div>
            <div><dt>Late</dt><dd>{summary.late}<small>after deadline</small></dd></div>
            <div><dt>Missing</dt><dd class:missing={summary.missing > 0}><button class="count-link" onclick={() => { status = 'missing'; reset(); }} aria-label="Show missing DLLs" disabled={!summary.missing}>{summary.missing}</button><small>no DLL yet</small></dd></div>
            <div><dt>For checking</dt><dd><button class="count-link" onclick={() => { status = 'for-checking'; reset(); }} aria-label="Show files waiting for remarks" disabled={!summary.forChecking}>{summary.forChecking}</button><small>needs remarks</small></dd></div>
            <div><dt>Checked</dt><dd>{summary.checked}<small>with remarks</small></dd></div>
            <div><dt>Supplementary</dt><dd>{supplementaryUploads}<small>review only</small></dd></div>
        </dl>
    </section>
    {#if clusterLabels.length && !selectedTeacher}
        <section class="cluster-panel" aria-label={districtOverview ? 'School pattern groups' : 'Teacher pattern groups'}>
            <div class="cluster-head">
                <div>
                    <h3>K-means pattern groups</h3>
                    <p>{districtOverview ? 'Schools' : 'Teachers'} are grouped by term-to-date upload habits. Select a group to narrow the action list.</p>
                </div>
                <button class:active={clusterFilter === 'all'} onclick={() => { clusterFilter = 'all'; reset(); }}>
                    All {districtOverview ? 'schools' : 'teachers'} <strong>{districtOverview ? schoolRows.length : teacherRows.length}</strong>
                </button>
            </div>
            <div class="cluster-grid">
            {#each clusterLabels as group}
                <button class:active={clusterFilter === group.label} style={"--cluster-color: " + group.color} onclick={() => { clusterFilter = group.label; status = status === 'all' ? 'risk' : status; reset(); }}>
                    <span class="cluster-dot"></span>
                    <span class="cluster-copy"><b>{group.label}</b><small>{group.priority}</small></span>
                    <strong>{group.count}</strong>
                    <span class="cluster-score"><span style={"width: " + group.score + "%"}></span></span>
                    <em>{(clusterMembers.get(group.label) || []).slice(0, 5).join(', ')}{(clusterMembers.get(group.label) || []).length > 5 ? '...' : ''}</em>
                </button>
            {/each}
            </div>
        </section>
    {/if}
    {#if !selectedTeacher && (docTypeTotal > 0 || scopedUploads.length > 0 || visibleTermOverdueBars.length > 1 || districtOverview && visibleSchoolOverdueBars.length)}
    <div class="charts">
        {#if docTypeTotal > 0}
            <div class="chart-card pie-card">
                <h4>Upload totals this school year</h4>
                <div class="pie-wrap">
                    <div class="pie" style={pieStyle(docTypeData)} aria-label="Document type pie chart"></div>
                    <div class="legend">
                        {#each docTypeData as item}
                            <span><i style={"background: " + docColor(item.label)}></i>{item.label}<strong>{item.value}</strong></span>
                        {/each}
                    </div>
                </div>
            </div>
        {/if}
        {#if scopedUploads.length > 0}
            <div class="chart-card">
                <h4>Uploads from Monday to Sunday</h4>
                <div class="upload-bars" aria-label="Uploads by day">
                    {#each uploadDays as day}
                        <div>
                            <span class="stack" style="height: {Math.max(6, 100 * day.total / maxUploadDay)}px">
                                {#if day.DLP}<b class="dlp" style="height: {100 * day.DLP / Math.max(1, day.total)}%"></b>{/if}
                                {#if day.ISP}<b class="isp" style="height: {100 * day.ISP / Math.max(1, day.total)}%"></b>{/if}
                                {#if day.ISR}<b class="isr" style="height: {100 * day.ISR / Math.max(1, day.total)}%"></b>{/if}
                            </span>
                            <small>{day.day}</small>
                            <strong>{day.total}</strong>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
        {#if visibleTermOverdueBars.length > 1}
            <div class="chart-card">
                <h4>Missing DLLs by week</h4>
                <div class="spark-bars" aria-label="Missing files by week">
                    {#each visibleTermOverdueBars as bar}
                        <div>
                            <span style="height: {Math.max(6, 80 * bar.missing / maxTermOverdue)}px"></span>
                            <small>T{bar.term} W{bar.week}</small>
                            <strong>{bar.missing}</strong>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
        {#if districtOverview && visibleSchoolOverdueBars.length}
            <div class="chart-card">
                <h4>Schools with missing DLLs</h4>
                <div class="horizontal-bars">
                    {#each visibleSchoolOverdueBars as item}
                        <button class="horizontal-bar-item" onclick={() => openSchool(item.id, 'missing')}>
                            <span>{item.name}</span>
                            <span class="bar-container-small"><span class="bar-fill overdue" style="width: {100 * item.missing / maxSchoolOverdue}%"></span></span>
                            <strong>{item.missing}</strong>
                        </button>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
    {/if}
    <div class="list-tools">
        <div class="list-header">
            <h3>{listTitle}</h3>
            {#if filteredClusterTitle}<p class="selected-cluster">{filteredClusterTitle}</p>{/if}
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
                    <div class="action-metrics"><button class="metric missing" disabled={!s.missing} onclick={() => openSchool(s.id, 'missing')}><strong>{s.missing}</strong><span>Missing</span></button><button class="metric" disabled={!s.forChecking} onclick={() => openSchool(s.id, 'for-checking')}><strong>{s.forChecking}</strong><span>For checking</span></button></div>
                    <button class="row-action" onclick={() => openSchool(s.id)}>Open school <ChevronRight size={16} /></button>
                </article>
            {/each}
        {:else if selectedTeacher}
            {#if status === 'for-checking'}
                {#each selectedTeacherReviewRows.slice((page - 1) * size, page * size) as s}
                    <article>
                        <div><h4>{s.subject || s.doc_type || 'Uploaded file'}</h4><p>{(s.doc_type || 'DLL').toUpperCase() === 'DLL' ? 'DLP' : s.doc_type} · Term {submissionTermFromPath(s) || '—'}, Week {s.week_number || '—'}</p><small>{s.compliance_status === 'supplementary' ? 'Supplementary upload' : 'Needs Archive remarks'}</small></div>
                        <div class="status-pill">For checking</div>
                        <a class="row-action" href={"/dashboard/archive?review=" + encodeURIComponent(s.id)}>Open Archive <ChevronRight size={16} /></a>
                    </article>
                {/each}
            {:else}
                {#each selectedTeacherRows.slice((page - 1) * size, page * size) as r}
                    <article>
                        <div><h4>{r.load.subject}</h4><p>{r.load.grade_level || 'No grade'} · Term {r.calendar.term}, Week {r.calendar.week_number}</p><small>Due {new Date(r.calendar.deadline_date).toLocaleDateString('en-PH')}</small></div>
                        <div class="status-pill" class:missing={r.status === 'missing' || (countOpenAsMissing && !r.submission)}>{r.status === 'on-time' ? 'On time' : r.status === 'late' ? 'Late submitted' : r.status === 'missing' || (countOpenAsMissing && !r.submission) ? 'Missing' : 'Upcoming'}</div>
                    </article>
                {/each}
            {/if}
        {:else}
            {#each sortedTeachers.slice((page - 1) * size, page * size) as t}
                <article>
                    <div><h4>{t.full_name}</h4><p>{t.submitted} of {t.expected} submitted · {t.rate === null ? 'N/A' : t.rate + '%'} complete</p>{#if clusterLabelFor(t.id)}<small>{clusterLabelFor(t.id)}</small>{/if}</div>
                    <div class="action-metrics"><button class="metric missing" disabled={!t.missing} onclick={() => openTeacher(t.id, 'missing')}><strong>{t.missing}</strong><span>Missing</span></button><button class="metric" disabled={!t.forChecking} onclick={() => openTeacher(t.id, 'for-checking')}><strong>{t.forChecking}</strong><span>For checking</span></button></div>
                    <button class="row-action" onclick={() => openTeacher(t.id)}>Open DLLs <ChevronRight size={16} /></button>
                </article>
            {/each}
        {/if}
        {#if rowCount === 0}<p class="empty">{calendar.length === 0 ? 'No active calendar weeks for this school year.' : status === 'missing' && !search ? 'No missing DLLs for this period.' : status === 'for-checking' && !search ? 'No files waiting for remarks for this period.' : 'No results match this view.'}</p>{/if}
    </div>
    <footer><span>{rowCount ? (page - 1) * size + 1 : 0}-{Math.min(page * size, rowCount)} of {rowCount}</span><div><button aria-label="Previous page" title="Previous page" disabled={page === 1} onclick={() => page--}><ChevronLeft size={18} /></button><span>{page} / {pages}</span><button aria-label="Next page" title="Next page" disabled={page === pages} onclick={() => page++}><ChevronRight size={18} /></button></div></footer>
    {#if unmatched}<details class="data-note"><summary>{unmatched} DLL(s) need an assignment check</summary><p>These files could not be matched to an active term, week, and teaching load. They are excluded from completion totals.</p></details>{/if}
</div>

<style>
    .compliance-workspace { color: var(--color-text-primary); min-width: 0; display: grid; gap: 14px; }
    .control-panel { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-white); }
    .view-heading { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 16px; }
    .heading-main { min-width: 0; display: grid; gap: 6px; }
    .list-tools { padding: 4px 0; }
    h2 { font-size: 22px; font-weight: 750; overflow-wrap: anywhere; line-height: 1.15; } h3 { font-size: 16px; font-weight: 700; }
    .back { width: fit-content; color: var(--color-text-muted); font-size: 13px; min-height: 32px; }
    .filters { display: grid; grid-template-columns: repeat(3, minmax(160px, 230px)) auto; gap: 14px; align-items: end; }
    label, .picker-field { display: flex; flex-direction: column; gap: 8px; font-size: 13px; font-weight: 700; min-width: 0; }
    .picker { position: relative; min-width: 0; }
    .picker-trigger {
        width: 100%;
        min-height: 56px;
        justify-content: space-between;
        padding: 0 16px;
        border: 1px solid var(--color-border-subtle);
        border-radius: 8px;
        background: var(--color-surface-white);
        color: var(--color-gov-blue);
        font-size: 17px;
        text-align: left;
    }
    .picker-trigger strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .picker-menu {
        position: absolute;
        z-index: 20;
        inset-inline: 0;
        top: calc(100% + 6px);
        max-height: 280px;
        overflow: auto;
        border: 1px solid var(--color-border-subtle);
        border-radius: 8px;
        background: var(--color-surface-white);
        box-shadow: 0 18px 36px rgba(15, 23, 42, .16);
    }
    .picker-menu button {
        width: 100%;
        justify-content: flex-start;
        min-height: 56px;
        padding: 0 16px;
        color: var(--color-text-primary);
        font-size: 16px;
        font-weight: 750;
        text-align: left;
    }
    .picker-menu button.active { background: var(--color-surface-muted); color: var(--color-gov-blue); }
    .picker-menu button:hover { background: var(--color-surface-muted); }
    .search div, .cluster-filter div { min-width: 0; height: 38px; border: 1px solid var(--color-border-subtle); border-radius: 6px; background: var(--color-surface-white); padding: 7px 10px; font-size: 14px; }
    .search, .cluster-filter { width: 220px; max-width: 100%; } .search div, .cluster-filter div { display: flex; gap: 8px; align-items: center; }
    .search input, .cluster-filter select { width: 100%; min-width: 0; background: transparent; }
    .attention { flex-direction: row; align-items: center; gap: 8px; font-size: 13px; }
    button { display: inline-flex; gap: 6px; align-items: center; justify-content: center; min-height: 40px; cursor: pointer; }
    button:disabled { opacity: .5; cursor: default; }
    .export, .refresh { align-self: start; min-width: 170px; padding: 9px 12px; border-radius: 6px; border: 1px solid var(--color-border-subtle); background: var(--color-surface-white); font-size: 14px; }
    .export { min-width: 210px; }
    .summary-panel { display: grid; grid-template-columns: minmax(300px, .82fr) minmax(0, 1.35fr); gap: 12px; align-items: start; }
    .stats { display: grid; grid-template-columns: repeat(3, minmax(130px, 1fr)); gap: 10px; align-items: stretch; }
    .stats div { display: grid; align-content: start; min-height: 94px; border: 1px solid var(--color-border-subtle); border-radius: 8px; padding: 12px 14px; background: var(--color-surface-white); }
    dt { font-size: 12px; color: var(--color-text-muted); line-height: 1.25; } dd { font-size: 25px; font-weight: 750; line-height: 1.05; }
    small { display: block; font-size: 11px; line-height: 1.3; font-weight: 400; color: var(--color-text-muted); margin-top: 6px; }
    .decision-strip { display: grid; align-content: start; gap: 7px; min-height: 94px; padding: 14px 16px; border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-white); font-size: 12px; }
    .decision-strip strong { font-size: 15px; line-height: 1.25; }
    .decision-strip span { color: var(--color-text-primary); }
    progress { display: block; width: 160px; max-width: 100%; height: 6px; border: 0; border-radius: 4px; overflow: hidden; margin: 3px 0 0; background: var(--color-surface-muted); accent-color: var(--color-gov-green); }
    progress::-webkit-progress-bar { background: var(--color-surface-muted); } progress::-webkit-progress-value { background: var(--color-gov-green); }
    .cluster-panel { border: 1px solid var(--color-border-subtle); border-radius: 8px; padding: 14px; background: var(--color-surface-white); }
    .cluster-head { display: flex; justify-content: space-between; align-items: start; gap: 12px; margin-bottom: 12px; }
    .cluster-head h3 { margin: 0; }
    .cluster-head p { margin: 4px 0 0; color: var(--color-text-muted); font-size: 13px; }
    .cluster-head button { min-width: 128px; padding: 8px 12px; border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-muted); font-size: 13px; }
    .cluster-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .cluster-grid button { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 92px; padding: 11px; border: 1px solid color-mix(in srgb, var(--cluster-color, var(--color-gov-blue)) 25%, var(--color-border-subtle)); border-radius: 8px; background: color-mix(in srgb, var(--cluster-color, var(--color-gov-blue)) 5%, var(--color-surface-white)); text-align: left; }
    .cluster-grid button.active, .cluster-head button.active { border-color: var(--color-gov-blue); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-gov-blue) 14%, transparent); }
    .cluster-dot { width: 12px; height: 12px; border-radius: 999px; background: var(--cluster-color, var(--color-gov-blue)); }
    .cluster-copy { min-width: 0; }
    .cluster-copy b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cluster-copy small { color: var(--cluster-color, var(--color-gov-blue)); font-weight: 700; }
    .cluster-grid strong { color: var(--cluster-color, var(--color-gov-blue)); font-size: 22px; }
    .cluster-score { grid-column: 1 / -1; height: 7px; border-radius: 999px; background: var(--color-surface-muted); overflow: hidden; }
    .cluster-score span { display: block; height: 100%; background: var(--cluster-color, var(--color-gov-blue)); }
    .cluster-grid em { grid-column: 1 / -1; min-height: 18px; color: var(--color-text-muted); font-size: 12px; font-style: normal; line-height: 1.35; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .list-header { display: grid; grid-template-columns: minmax(220px, 1fr) minmax(360px, auto); align-items: start; gap: 12px; width: 100%; padding: 14px 16px; border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-white); }
    .list-controls { display: grid; grid-template-columns: minmax(220px, 360px) minmax(170px, 260px); gap: 10px 12px; align-items: center; justify-content: end; }
    .cluster-filter select { width: 200px; }
    .row-action { color: var(--color-gov-blue); white-space: nowrap; font-size: 13px; }
    .missing { color: var(--color-gov-red); font-weight: 700; }
    .count-link { color: inherit; font: inherit; text-decoration: underline; text-underline-offset: 4px; min-width: 44px; min-height: 44px; }
    .count-link:disabled { text-decoration: none; opacity: 1; cursor: default; }
    a.row-action { display: flex; align-items: center; min-height: 44px; gap: 6px; }
    .selected-cluster { grid-column: 1 / 2; margin: 2px 0 0; color: var(--color-text-muted); font-size: 13px; overflow-wrap: anywhere; }
    .action-list { display: grid; gap: 8px; }
    .action-list article { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 14px; align-items: center; padding: 14px 16px; border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-white); }
    .action-list h4 { font-size: 15px; font-weight: 700; margin: 0; overflow-wrap: anywhere; }
    .action-list p { margin: 4px 0 0; color: var(--color-text-muted); font-size: 13px; }
    .action-list small { color: var(--color-gov-blue); }
    .action-metrics { display: flex; gap: 8px; }
    .metric { display: grid; gap: 1px; min-width: 76px; min-height: 54px; padding: 6px 10px; border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-muted); }
    .metric strong { font-size: 18px; line-height: 1; }
    .metric span { font-size: 11px; color: var(--color-text-muted); }
    .metric.missing strong, .status-pill.missing { color: var(--color-gov-red); }
    .status-pill { justify-self: end; border: 1px solid var(--color-border-subtle); border-radius: 999px; padding: 6px 10px; font-size: 12px; font-weight: 700; }
    .list-tools .list-controls { justify-self: end; }
    .list-controls .attention { grid-column: 1 / -1; justify-self: start; }
    .cluster-filter select { width: 200px; }
    .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
    .chart-card { background: var(--color-surface-white); border: 1px solid var(--color-border-subtle); border-radius: 8px; padding: 14px; min-width: 0; }
    .chart-card h4 { font-size: 14px; font-weight: 700; color: var(--color-text-muted); margin: 0 0 12px 0; }
    .spark-bars { display: grid; grid-template-columns: repeat(auto-fit, minmax(52px, 1fr)); gap: 10px; align-items: end; min-height: 92px; }
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
    .pie-wrap { display: grid; grid-template-columns: 132px minmax(0, 1fr); gap: 16px; align-items: center; }
    .pie { width: 132px; height: 132px; border-radius: 50%; border: 10px solid var(--color-surface-white); box-shadow: inset 0 0 0 1px var(--color-border-subtle), 0 0 0 1px var(--color-border-subtle); }
    .legend { display: grid; gap: 8px; }
    .legend span { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; gap: 8px; align-items: center; color: var(--color-text-muted); font-size: 13px; }
    .legend i { width: 12px; height: 12px; border-radius: 3px; }
    .legend strong { color: var(--color-text-primary); }
    .upload-bars { display: grid; grid-template-columns: repeat(7, minmax(28px, 1fr)); gap: 10px; align-items: end; min-height: 144px; }
    .upload-bars div { display: grid; justify-items: center; align-items: end; gap: 5px; min-width: 0; }
    .upload-bars .stack { display: flex; flex-direction: column-reverse; width: 100%; max-width: 34px; min-height: 6px; border-radius: 5px 5px 0 0; overflow: hidden; background: var(--color-surface-muted); }
    .upload-bars b { display: block; width: 100%; min-height: 3px; }
    .upload-bars .dlp { background: var(--color-gov-blue); }
    .upload-bars .isp { background: var(--color-gov-green); }
    .upload-bars .isr { background: var(--color-gov-gold); }
    .upload-bars small { margin: 0; }
    .upload-bars strong { font-size: 13px; }
    button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--color-gov-blue); outline-offset: 3px; }
    footer, footer div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-block: 12px; font-size: 13px; }
    footer button { width: 40px; border: 1px solid var(--color-border-subtle); border-radius: 6px; }
    .empty { padding: 32px 12px; text-align: center; color: var(--color-text-muted); } .data-note { font-size: 13px; color: var(--color-text-muted); padding: 12px 0; }
    @media (max-width: 920px) {
        .view-heading { grid-template-columns: 1fr; align-items: stretch; }
        .export { width: 100%; min-width: 0; justify-content: center; }
        .summary-panel { grid-template-columns: 1fr; }
        .stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (max-width: 600px) { .stats { grid-template-columns: 1fr; gap: 10px; } dd { font-size: 24px; } .list-tools { align-items: stretch; } .search, .cluster-filter { width: 100%; } .pie-wrap { grid-template-columns: 1fr; justify-items: center; } }
    @media (max-width: 700px) {
        .control-panel { padding: 12px; }
        .filters { grid-template-columns: 1fr; gap: 12px; }
        .picker-trigger { min-height: 54px; font-size: 16px; }
        .picker-menu { position: static; margin-top: 6px; max-height: 240px; }
        .refresh { width: 100%; }
        .search input, .cluster-filter select { font-size: 16px; } .view-heading > div { min-width: 0; }
        .stats { gap: 12px; } .stats small { overflow-wrap: anywhere; }
        .list-header { grid-template-columns: 1fr; align-items: stretch; gap: 10px; }
        .selected-cluster { grid-column: auto; }
        .list-tools .list-controls { justify-self: stretch; }
        .list-controls { grid-template-columns: 1fr; justify-content: stretch; }
        .list-controls .attention { grid-column: auto; }
        .cluster-filter { width: 100%; }
        .charts { grid-template-columns: 1fr; }
        .cluster-head { display: grid; }
        .cluster-head button { width: 100%; justify-content: space-between; }
        .cluster-grid { grid-template-columns: 1fr; }
        .cluster-grid button { min-height: 96px; }
        .horizontal-bar-item { grid-template-columns: minmax(0, 1fr); gap: 6px; }
        button.horizontal-bar-item { border-bottom: 1px solid var(--color-border-subtle); padding-bottom: 10px; }
        .action-list article { grid-template-columns: minmax(0, 1fr); align-items: stretch; }
        .action-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .row-action, .action-list .row-action { width: 100%; justify-content: space-between; min-height: 44px; }
        .status-pill { justify-self: stretch; text-align: center; }
        progress { width: 100%; } footer { flex-wrap: wrap; }
    }
</style>
