<script lang="ts">
    import { onMount, tick } from 'svelte';
    import BackButton from './BackButton.svelte';
    import { returnToTeacherList } from '$lib/utils/navigationReturn';
    import { effectiveDeadlineForSubject } from '$lib/utils/deadlineRules';
    import { currentCompliancePeriod, submissionTerm as submissionTermFromPath, type CalendarSlot, type ComplianceLoad, type ComplianceSubmission, type Requirement, type LeaveRequest, buildRequirements, isTeacherWideLeave, scopedCalendar, scopeComplianceView, summarizeRequirements, riskReason, overdueByWeek, filterSubmissionsByPeriod, summarizeSubmissionReviews, uploadDayCounts, hasRemarks, isRemarkRequiredSubmission, isWeeklyComplianceDocType } from '$lib/utils/compliance';
    import { uploadsBySchool, uploadsByTeacher } from '$lib/utils/complianceUploadComparison';
    import { savedReviewStatus, summarizeSavedReportRows } from '$lib/utils/submissionReport';
    import { makePieSlices } from '$lib/utils/pieSlices';
    import { supabase } from '$lib/utils/supabase';
    import { addToast } from '$lib/stores/toast';
    import { formatLeaveRange } from '$lib/utils/leaveDates';
    import { profile } from '$lib/utils/auth';
    import PaginationBar from '$lib/components/PaginationBar.svelte';
    import CedimsSelect from '$lib/components/CedimsSelect.svelte';
    import { extractFeatures, runKMeansClustering, canCluster, type ClusterSummary, type ClusterResult } from '$lib/utils/clusterAnalytics';
    import { Download, Search, ArrowLeft, ChevronDown, ChevronRight, ChevronUp, Filter, RefreshCw, AlertTriangle, CheckCircle, Eye, FileText, CalendarX } from 'lucide-svelte';
    let { teachers, submissionUsers, schools, loads, calendar, submissions, leaveRequests, reviews, year, role, yearOptions, onYearChange, refreshing, onRefresh, initialSchoolId, initialTeacherId, initialTerm, initialWeek, onExit }: {
        teachers: { id: string; full_name: string; school_id: string }[];
        submissionUsers?: { id: string; full_name: string; school_id: string; role?: string | null }[];
        schools: { id: string; name: string; district_id: string }[];
        loads: ComplianceLoad[];
        calendar: CalendarSlot[];
        submissions: ComplianceSubmission[];
        leaveRequests?: LeaveRequest[];
        reviews: { submission_id: string; status?: string | null; reviewer_comment?: string | null }[];
        year: string;
        role: string;
        yearOptions?: string[];
        onYearChange?: (year: string) => void;
        refreshing?: boolean;
        onRefresh?: () => void;
        initialSchoolId?: string | null;
        initialTeacherId?: string | null;
        initialTerm?: string;
        initialWeek?: string;
        onExit?: () => void;
    } = $props();
    const schoolPieColors = ['#2447ad', '#087f8c', '#ac5a00', '#7546a3', '#17804f', '#b63e57', '#5b6472', '#6d5e17'];
    let term = $state('all');
    let week = $state('all');
    let openPeriodMenu = $state<'year' | 'term' | 'week' | null>(null);
    let school = $state('all');
    let search = $state('');
    let status = $state('risk');
    let clusterFilter = $state('all');
    let selectedTeacher = $state<string | null>(null);
    let expandedMissingSchoolId = $state<string | null>(null);
    let expandedRiskKey = $state<string | null>(null);
    let selectedPieTeacherId = $state<string | null>(null);
    type NavigationState = { school: string; search: string; status: string; cluster: string; selectedTeacher: string | null; page: number };
    let history = $state<NavigationState[]>([]);
    let initialized = $state(false);
    const stateKey = $derived(`compliance-workspace-v2:${role}:${year}:${schools.map(s => s.id).sort().join(',')}`);
    const isDistrict = $derived(role === 'District Supervisor' || role === 'Admin');
    const districtOverview = $derived(isDistrict && school === 'all');
    const activeTab = $derived(districtOverview ? 'schools' : selectedTeacher ? 'teacher' : 'follow-up');
    onMount(() => {
        const period = currentCompliancePeriod(calendar);
        term = initialTerm || period.term; week = initialWeek || period.week;
        if (initialSchoolId) school = initialSchoolId;
        if (initialTeacherId) selectedTeacher = initialTeacherId;
        try {
            const saved = JSON.parse(sessionStorage.getItem(stateKey) || 'null');
            if (!initialSchoolId && !initialTeacherId && saved && saved.version === 2 && ['all', '1', '2', '3'].includes(saved.term) && (saved.week === 'all' || /^\d+$/.test(saved.week))) {
                term = saved.term; week = saved.week;
                if (saved.school === 'all' || schools.some(s => s.id === saved.school)) school = saved.school;
                if (['all', 'risk', 'missing', 'for-checking'].includes(saved.status)) status = saved.status;
                if (saved.cluster === 'all' || ['Consistently Meeting Standards', 'Steadily Progressing', 'Building Momentum'].includes(saved.cluster)) clusterFilter = saved.cluster;
                if (saved.selectedTeacher && teachers.some(t => t.id === saved.selectedTeacher && (school === 'all' || t.school_id === school))) selectedTeacher = saved.selectedTeacher;
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
        submissions.filter(s => s.user_id === t.id), reviews, Date.now(), (leaveRequests || []).filter(r => r.user_id === t.id),
    )));
    const unmatched = $derived.by(() => {
        const key = (s: ComplianceSubmission) => `${s.teaching_load_id}|${s.school_year}|${submissionTermFromPath(s) ?? s.calendar_id}|${s.week_number}`;
        const matched = new Set(requirements.filter(r => r.submission).map(r => key(r.submission!)));
        return submissions.filter(s => ['compliant', 'late', 'on-time'].includes(s.compliance_status || '') && !matched.has(key(s))).length;
    });
    const weeks = $derived([...new Set(calendar.filter(c => term === 'all' || c.term === Number(term)).map(c => c.week_number))].sort((a, b) => a - b));
    const viewScope = $derived(scopeComplianceView(teachers, submissionUsers?.length ? submissionUsers : teachers,
        requirements, submissions, { school, teacherId: selectedTeacher, year, term, week }));
    const scopedTeachers = $derived(viewScope.scopedTeachers);
    const scopedSubmissionUsers = $derived(viewScope.scopedSubmissionUsers);
    const teacherSchools = $derived(new Map(teachers.map(t => [t.id, t.school_id])));
    const scoped = $derived(viewScope.scopedRequirements);
    const scopedUploads = $derived(viewScope.scopedUploads);
    const scopedReviewSubmissions = $derived(scopedUploads.filter(isRemarkRequiredSubmission));
    const reviewSummary = $derived(summarizeSubmissionReviews(scopedReviewSubmissions, reviews));
    const teacherRows = $derived(scopedTeachers.map(t => {
        const rows = scoped.filter(r => r.teacherId === t.id);
        return { ...t, ...summarizeRequirements(rows), ...summarizeSubmissionReviews(submissionsForTeacher(t.id), reviews), risk: riskReason(rows), rows };
    }).filter(t => (districtOverview && school === 'all' || !districtOverview) && (!search.trim() || t.full_name.toLowerCase().includes(search.trim().toLowerCase()))).filter(t => status === 'all' ||
        (status === 'risk' && (!!t.risk || t.missing > 0 || t.leavePending > 0)) || (status === 'missing' && t.missing > 0) ||
        (status === 'for-checking' && t.forChecking > 0)));
    function rowsForSchool(id: string) {
        return requirements.filter(r => teacherSchools.get(r.teacherId) === id && (term === 'all' || r.calendar.term === Number(term)) && (week === 'all' || r.calendar.week_number === Number(week)));
    }
    function submissionsForTeacher(id: string) {
        return filterSubmissionsByPeriod(submissions.filter(s => s.user_id === id && s.school_year === year && isRemarkRequiredSubmission(s)), term, week);
    }
    function submissionsForSchool(id: string) {
        const userIds = new Set((submissionUsers?.length ? submissionUsers : teachers).filter(t => t.school_id === id).map(t => t.id));
        return filterSubmissionsByPeriod(submissions.filter(s => s.user_id && userIds.has(s.user_id) && s.school_year === year && isRemarkRequiredSubmission(s)), term, week);
    }
    const schoolRows = $derived(schools.filter(s => school === 'all' || school === s.id).map(s => ({ ...s, ...summarizeRequirements(rowsForSchool(s.id)), ...summarizeSubmissionReviews(submissionsForSchool(s.id), reviews) })));
    const summary = $derived({ ...summarizeRequirements(scoped), ...reviewSummary });
    const teacherRiskRows = $derived(scopedTeachers.map(t => ({ ...t, ...summarizeRequirements(scoped.filter(r => r.teacherId === t.id)) })));
    const riskDefinitions: { key: string; label: string; metric: 'missing' | 'late' | 'leavePending'; threshold: number; detail: string }[] = [
        { key: 'missing', label: 'At least 1 missing DLL', metric: 'missing', threshold: 1, detail: 'missing' },
        { key: 'late', label: 'At least 1 late DLL', metric: 'late', threshold: 1, detail: 'late' },
        { key: 'leave', label: 'Pending leave review', metric: 'leavePending', threshold: 1, detail: 'pending' },
    ];
    const riskIndicators = $derived(riskDefinitions.map(indicator => {
        const teachers = teacherRiskRows.filter(teacher => teacher[indicator.metric] >= indicator.threshold)
            .sort((a, b) => b[indicator.metric] - a[indicator.metric] || a.full_name.localeCompare(b.full_name));
        return { ...indicator, count: teachers.length, teachers };
    }));
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
        (status === 'all' || status === 'risk' && (s.missing > 0 || s.leavePending > 0) || status === 'missing' && s.missing > 0 || status === 'for-checking' && s.forChecking > 0) &&
        (clusterFilter === 'all' || clusterMap.get(s.id) === clusterFilter)).sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name)));
    const termOverdueBars = $derived(overdueByWeek(scoped));
    const schoolOverdueBars = $derived([...schoolRows].sort((a, b) => b.missing - a.missing));
    const visibleTermOverdueBars = $derived(termOverdueBars.filter(bar => bar.missing > 0));
    const visibleSchoolOverdueBars = $derived(schoolOverdueBars.filter(item => item.missing > 0).slice(0, 6));
    const maxTermOverdue = $derived(Math.max(1, ...termOverdueBars.map(b => b.missing)));
    const maxSchoolOverdue = $derived(Math.max(1, ...visibleSchoolOverdueBars.map(s => s.missing)));
    const schoolPieData = $derived(uploadsBySchool(scopedUploads, scopedSubmissionUsers, schools).map((item, index) => ({
        ...item,
        color: schoolPieColors[index % schoolPieColors.length],
        completion: schoolRows.find(row => row.id === item.id)?.rate ?? null,
        submitted: schoolRows.find(row => row.id === item.id)?.submitted ?? 0,
        expected: schoolRows.find(row => row.id === item.id)?.expected ?? 0,
        role: null as string | null,
    })));
    const teacherPieData = $derived(uploadsByTeacher(scopedUploads.filter(s => isWeeklyComplianceDocType(s.doc_type)), scopedSubmissionUsers).map((item, index) => ({
        ...item,
        color: `hsl(${Math.round((index * 137.508 + 220) % 360)} 62% 38%)`,
        completion: teacherRiskRows.find(row => row.id === item.id)?.rate ?? null,
        submitted: teacherRiskRows.find(row => row.id === item.id)?.submitted ?? 0,
        expected: teacherRiskRows.find(row => row.id === item.id)?.expected ?? 0,
    })));
    const pieData = $derived(districtOverview ? schoolPieData : teacherPieData);
    const pieTotal = $derived(pieData.reduce((sum, item) => sum + item.value, 0));
    const schoolPieSlices = $derived(makePieSlices(schoolPieData).map(slice => ({
        ...slice,
        school: schoolPieData.find(item => item.id === slice.id)!,
    })));
    const teacherPieSlices = $derived(makePieSlices(teacherPieData).map(slice => ({
        ...slice,
        teacher: teacherPieData.find(item => item.id === slice.id)!,
    })));
    const selectedPieTeacher = $derived(teacherPieData.find(item => item.id === selectedPieTeacherId) ?? null);
    const piePeriod = $derived(`${year} · ${term === 'all' ? 'all terms' : `Term ${term}`} · ${week === 'all' ? 'all weeks' : `Week ${week}`}`);
    const pieAltText = $derived(`Confirmed uploads by school for ${piePeriod}: ${schoolPieSlices.map(slice => `${slice.school.label}, ${slice.percent}% (${slice.school.value} files)`).join('; ')}`);
    const supplementaryUploads = $derived(scopedReviewSubmissions.filter(s => ['supplementary', 'extra'].includes((s.compliance_status || '').toLowerCase())).length);
    const uploadDays = $derived(uploadDayCounts(scopedUploads));
    const maxUploadDay = $derived(Math.max(1, ...uploadDays.map(d => d.total)));
    const selectedTeacherRows = $derived(scoped.filter(r => selectedTeacher && r.teacherId === selectedTeacher).filter(r => status === 'missing' ? r.status === 'missing' : status === 'for-checking' ? false : true));
    const selectedTeacherReviewRows = $derived(selectedTeacher && status === 'for-checking'
        ? submissionsForTeacher(selectedTeacher).filter(s => !hasRemarks(reviewMap.get(s.id)?.reviewer_comment))
        : []);
    const rowCount = $derived(activeTab === 'schools' ? rankedSchools.length : activeTab === 'teacher' ? (status === 'for-checking' ? selectedTeacherReviewRows.length : selectedTeacherRows.length) : sortedTeachers.length);
    const listTitle = $derived(districtOverview ? 'Schools needing action' : selectedTeacher ? 'DLLs needing action' : 'Teachers needing action');
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
    let listControls: HTMLDivElement | undefined = $state();
    async function backToTeachers() {
        if (initialTeacherId && history.length === 0 && onExit) { onExit(); return; }
        const restored = returnToTeacherList({ school, search, status, cluster: clusterFilter, selectedTeacher, page }, history);
        history = restored.history;
        ({ school, search, status, cluster: clusterFilter, selectedTeacher, page } = restored.state);
        await tick();
        listControls?.focus();
    }
    function goBack() {
        const previous = history.at(-1);
        if (previous) { history = history.slice(0, -1); ({ school, search, status, cluster: clusterFilter, selectedTeacher, page } = previous); return; }
        if (onExit) { onExit(); return; }
        if (selectedTeacher) { selectedTeacher = null; clusterFilter = 'all'; }
        else { school = 'all'; clusterFilter = 'all'; }
        search = ''; status = 'all'; reset();
    }
    function teacherName(id: string) { return teachers.find(t => t.id === id)?.full_name || 'Unknown teacher'; }
    function schoolName(id: string) { return schools.find(s => s.id === id)?.name || 'Unassigned school'; }
    function formatRequirementDeadline(requirement: Requirement) {
        return effectiveDeadlineForSubject(requirement.calendar.deadline_date, requirement.load.subject, requirement.load.school_name)
            .toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    function clusterLabelFor(id: string) { return clusterMap.get(id) || ''; }
    function requirementLabel(r: Requirement) {
        if (r.status === 'on-time') return 'On time';
        if (r.status === 'late') return 'Late submitted';
        if (r.status === 'on-leave') return 'On Leave / Excluded';
        if (r.status === 'leave-requested') return 'Leave requested';
        if (r.status === 'leave-rejected') return 'Leave rejected';
        return r.status === 'missing' ? 'Missing' : 'Upcoming';
    }
    async function decideLeave(request: LeaveRequest, status: 'approved' | 'rejected') {
        if (!$profile) return;
        const { data, error } = await supabase.from('submission_leave_requests').update({
            status,
            reviewer_id: $profile.id,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }).eq('id', request.id).eq('status', 'pending').select('id');
        if (error) addToast('error', 'Could not save this decision. Check your connection and try again.');
        else if (!data?.length) addToast('info', 'This leave request was already decided or withdrawn.');
        else if (isTeacherWideLeave(request)) addToast('success', `Decision saved for ${formatLeaveRange(request.start_date, request.end_date)}. It applies to all of this teacher's subjects.`);
        onRefresh?.();
    }
    async function exportReport(format: 'excel' | 'word' = 'excel') {
        exporting = true; exportError = '';
        try {
            const { buildReportWorkbook, triggerDownload } = await import('$lib/utils/excelExport');
            const scopeLabel = selectedTeacher ? teacherName(selectedTeacher) : school === 'all' ? 'All permitted schools' : schoolName(school);
            const uploadPeople = new Map(scopedSubmissionUsers.map(person => [person.id, person]));
            const reviewById = new Map(reviews.map(review => [review.submission_id, review]));
            const savedRows = scopedUploads.map(upload => ({ ...upload, review_status: savedReviewStatus(upload, reviewById.get(upload.id)) }));
            const savedSummary = summarizeSavedReportRows(savedRows);
            const summaryRows: (string | number)[][] = [
                ['Expected requirements', summary.expected], ['Submitted', summary.submitted],
                ['Missing DLLs', summary.missing], ['Upcoming', summary.upcoming],
                ['On leave / excluded', summary.onLeave], ['Leave requests pending review', summary.leavePending],
                ['Late submissions', summary.late], ['For checking', summary.forChecking],
                ['Checked', summary.checked], ['Completion', summary.rate === null ? 'N/A' : `${summary.rate}%`],
                ['Saved files', savedSummary.total], ['Supplementary files', savedSummary.supplementary],
                ['Administrative files', savedSummary.isp + savedSummary.isr],
            ];
            const peopleHeaders = districtOverview
                ? ['School', 'Missing DLLs', 'For checking', 'Checked', 'Completion', 'Attention']
                : ['Teacher', 'Missing DLLs', 'For checking', 'Checked', 'Completion', 'Attention', 'Cluster'];
            const peopleRows = districtOverview ? [...schoolRows].sort((a, b) => a.name.localeCompare(b.name)).map(item => {
                const rows = scoped.filter(r => teachers.find(t => t.id === r.teacherId)?.school_id === item.id);
                const totals = { ...summarizeRequirements(rows), ...summarizeSubmissionReviews(submissionsForSchool(item.id), reviews) };
                return [item.name, totals.missing, totals.forChecking, totals.checked, totals.rate === null ? 'N/A' : `${totals.rate}%`, riskReason(rows)];
            }) : selectedTeacher ? [] : [...scopedTeachers].sort((a, b) => a.full_name.localeCompare(b.full_name)).map(item => {
                const rows = scoped.filter(r => r.teacherId === item.id);
                const totals = { ...summarizeRequirements(rows), ...summarizeSubmissionReviews(submissionsForTeacher(item.id), reviews) };
                return [item.full_name, totals.missing, totals.forChecking, totals.checked, totals.rate === null ? 'N/A' : `${totals.rate}%`, riskReason(rows), clusterLabelFor(item.id)];
            });
            const detailRows = scoped.map(r => {
                const teacherSchoolId = teachers.find(t => t.id === r.teacherId)?.school_id || '';
                const clusterLabel = districtOverview ? clusterMap.get(teacherSchoolId) || '' : clusterMap.get(r.teacherId) || '';
                return [year, teacherName(r.teacherId), schoolName(teacherSchoolId), r.load.subject, r.load.grade_level, r.calendar.term, r.calendar.week_number, formatRequirementDeadline(r), requirementLabel(r), r.review === 'none' ? 'None' : r.review === 'for-checking' ? 'For checking' : 'Checked', r.submission?.created_at || '', clusterLabel];
            });
            const uploadRows = savedRows.map(upload => {
                const uploader = uploadPeople.get(upload.user_id || '');
                const subject = upload.subject || loads.find(load => load.id === upload.teaching_load_id)?.subject || '—';
                const submitted = upload.created_at ? new Date(upload.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '—';
                return [upload.file_path?.split('/').at(-1) || 'Document', uploader?.full_name || 'User', schoolName(uploader?.school_id || ''), subject, upload.doc_type || 'Other', upload.compliance_status || 'Unspecified', upload.review_status, submissionTermFromPath(upload) || '—', upload.week_number || '—', submitted];
            });
            const fileBase = `CEDIMS-compliance-${year}-term-${term}-week-${week}${selectedTeacher ? '-teacher' : school === 'all' ? '' : '-school'}`;
            const fileName = `${fileBase}.${format === 'excel' ? 'xlsx' : 'docx'}`;
            const periodLabel = `${year}, ${term === 'all' ? 'all terms' : `Term ${term}`}, ${week === 'all' ? 'all weeks' : `Week ${week}`}`;
            const paragraphs = [
                `This report covers ${scopeLabel} for ${periodLabel}. It reflects the requirements and submissions available in CEDIMS at the time of export.`,
                `Of ${summary.expected} expected lesson plan submissions, ${summary.submitted} were submitted. The completion rate is ${summary.rate === null ? 'not applicable' : `${summary.rate}%`}.`,
                `${summary.missing} ${summary.missing === 1 ? 'requirement is' : 'requirements are'} missing, ${summary.upcoming} are upcoming, ${summary.onLeave} are excluded by approved leave, and ${summary.late} submissions were late. ${summary.forChecking} submissions await checking and ${summary.checked} have been checked.`,
                `There are ${savedSummary.total} saved files in this scope. Stored file statuses are ${savedSummary.statusRows.map(row => `${row.label}: ${row.count}`).join('; ')}. The deadline-based compliance figures above are recalculated using the current calendar and approved leave, so they can differ from stored file labels. Missing requirements are listed separately from saved files.`,
                `Document types are ${savedSummary.typeRows.map(row => `${row.type}: ${row.count}`).join('; ')}. Among reviewable lesson-plan files, ${savedSummary.checked} are checked and ${savedSummary.forChecking} are for checking.`,
                ...peopleRows.map(row => `${row[0]} has ${row[1]} missing ${row[1] === 1 ? 'DLL' : 'DLLs'}, ${row[2]} submissions awaiting checking, and ${row[3]} checked submissions. Completion is ${row[4]}.`),
            ];
            const options = {
                fileName, title: 'CEDIMS Submissions and Compliance Report',
                subtitle: `${scopeLabel} · ${year} · ${term === 'all' ? 'All terms' : `Term ${term}`} · ${week === 'all' ? 'All weeks' : `Week ${week}`}`,
                meta: [{ label: 'View', value: selectedTeacher ? 'Teacher detail' : districtOverview ? 'District overview' : 'School overview' }, { label: 'Formula', value: 'Submitted / expected requirements × 100; late submissions included' }],
                paragraphs,
                tables: [
                    { title: 'Summary', headers: ['Measure', 'Value'], rows: summaryRows },
                    ...(selectedTeacher ? [] : [{ title: districtOverview ? 'Schools' : 'Teachers', headers: peopleHeaders, rows: peopleRows }]),
                    { title: 'Stored file statuses', headers: ['Status', 'Files'], rows: savedSummary.statusRows.map(row => [row.label, row.count]), totalsRow: ['Total saved', savedSummary.total] },
                    { title: 'Document types', headers: ['Type', 'Files'], rows: savedSummary.typeRows.map(row => [row.type, row.count]), totalsRow: ['Total saved', savedSummary.total] },
                    { title: 'Review statuses', headers: ['Review status', 'Files'], rows: [['Checked', savedSummary.checked], ['For checking', savedSummary.forChecking], ['Not applicable', savedSummary.notApplicable]], totalsRow: ['Total saved', savedSummary.total] },
                    { title: 'Saved upload details', headers: ['File', 'Uploader', 'School', 'Subject', 'Type', 'Submission status', 'Review status', 'Term', 'Week', 'Submitted (Philippines)'], rows: uploadRows },
                    { title: 'Requirements', headers: ['School year', 'Teacher', 'School', 'Subject', 'Grade', 'Term', 'Week', 'Deadline', 'Submission status', 'Review status', 'Submitted at', 'Cluster'], rows: detailRows },
                ],
            };
            if (format === 'excel') {
                const bytes = await buildReportWorkbook(options);
                triggerDownload(bytes, fileName);
            } else {
                const { buildReportDocument, triggerWordDownload } = await import('$lib/utils/wordExport');
                const document = await buildReportDocument({ ...options, tables: [] });
                triggerWordDownload(document, fileName);
            }
        } catch (e) { exportError = 'Export failed. Please try again.'; console.error(e); }
        finally { exporting = false; }
    }
</script>

<div class="compliance-workspace">
    <section class="control-panel">
        <header class="view-heading">
            <div class="heading-main">
            {#if selectedTeacher || (isDistrict && school !== 'all')}<BackButton focusOnMount={true} label={selectedTeacher ? 'Back to teachers' : 'Back to schools'} onBack={() => selectedTeacher ? void backToTeachers() : goBack()} />{/if}
            <span class="scope-label">{role === 'Admin' ? 'Administrator' : role === 'District Supervisor' ? 'District Supervisor' : role === 'Master Teacher' ? 'Master Teacher' : 'School Head'}</span>
            <h2>{selectedTeacher ? teacherName(selectedTeacher) : districtOverview ? 'Compliance Monitoring' : school !== 'all' ? schoolName(school) : schools[0]?.name || 'School compliance'}</h2>
            <p>{districtOverview ? 'District-wide instructional document compliance.' : 'Track submissions, follow up missing DLLs, and manage review work.'}</p>
            <small>{districtOverview ? `${schoolRows.length} schools monitored` : `${scopedTeachers.length} teachers monitored`} · {summary.rate === null ? 'N/A' : summary.rate + '%'} complete</small>
            </div>
            <div class="header-actions">
                {#if onRefresh}<button class="refresh" type="button" disabled={refreshing} onclick={onRefresh}><RefreshCw size={16} />{refreshing ? 'Refreshing...' : 'Refresh'}</button>{/if}
                <button class="export" onclick={() => exportReport('excel')} disabled={exporting}><Download size={16} />{exporting ? 'Exporting...' : 'Excel report'}</button>
                <button class="export" onclick={() => exportReport('word')} disabled={exporting}><FileText size={16} />Word report</button>
            </div>
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
            {#if districtOverview}
                <div class="school-select picker-field"><span>School</span><CedimsSelect bind:value={school} ariaLabel="School" options={[{value:'all',label:'All schools'}, ...schools.map(s=>({value:s.id,label:s.name}))]} onChange={() => { selectedTeacher = null; clusterFilter = 'all'; reset(); }} /></div>
            {/if}
        </div>
    </section>
    {#if exportError}<p role="alert" class="text-gov-red">{exportError}</p>{/if}
    <dl class="stats primary-stats">
        <div class="stat-card is-missing"><dt><FileText size={18} />Missing DLLs</dt><dd><button class="count-link" onclick={() => { status = 'missing'; reset(); }} aria-label="Show missing DLLs" disabled={!summary.missing}>{summary.missing}</button><small>no DLL yet</small></dd></div>
        <div class="stat-card is-review"><dt><Eye size={18} />For checking</dt><dd><button class="count-link" onclick={() => { status = 'for-checking'; reset(); }} aria-label="Show files waiting for remarks" disabled={!summary.forChecking}>{summary.forChecking}</button><small>needs remarks</small></dd></div>
        <div class="stat-card is-late"><dt><AlertTriangle size={18} />Late submissions</dt><dd>{summary.late}<small>after deadline</small></dd></div>
        <div class="stat-card is-good"><dt><CheckCircle size={18} />On-time / Compliant</dt><dd>{summary.onTime}<small>before deadline</small></dd></div>
    </dl>
    <details class="secondary-metrics">
        <summary>More compliance counts <span>{summary.onLeave} on leave · {summary.checked} checked · {supplementaryUploads} supplementary</span></summary>
        <dl class="stats secondary-stats">
        <div class="stat-card is-leave"><dt><CalendarX size={18} />On Leave / Excluded</dt><dd>{summary.onLeave}<small>{summary.leavePending ? `${summary.leavePending} pending review` : 'not counted'}</small></dd></div>
        <div class="stat-card is-good"><dt><CheckCircle size={18} />Checked / With remarks</dt><dd>{summary.checked}<small>review completed</small></dd></div>
        <div class="stat-card"><dt><FileText size={18} />Supplementary uploads</dt><dd>{supplementaryUploads}<small>review only</small></dd></div>
        </dl>
    </details>
    {#if clusterLabels.length && !selectedTeacher}
        <details class="insights-panel">
        <summary>Explore upload patterns <span>K-means groups · {districtOverview ? schoolRows.length : teacherRows.length} {districtOverview ? 'schools' : 'teachers'}</span></summary>
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
        </details>
    {/if}
    {#if !selectedTeacher && (scopedUploads.length > 0 || visibleTermOverdueBars.length > 1 || districtOverview && visibleSchoolOverdueBars.length)}
    <details class="insights-panel">
    <summary>Explore trends <span>Upload comparisons and missing DLLs</span></summary>
    <div class="charts" class:teacher-trends={!districtOverview && pieTotal > 0}>
            <div class="chart-card pie-card">
                <h4>{districtOverview ? 'Uploads by school and lesson-plan completion' : 'DLL/DLP uploads and teacher compliance'}</h4>
                <p class="chart-description">{piePeriod}. {districtOverview ? 'Each slice shows one school’s share of confirmed uploads. Required lesson-plan completion is listed separately.' : 'Pie percentages show each teacher’s share of saved DLL/DLP uploads. Overall compliance shows required lesson plans submitted in this period.'}</p>
                {#if pieTotal > 0}
                <div class="pie-wrap">
                    <div class="pie-visual-column">
                        {#if districtOverview}
                            <svg class="school-pie" viewBox="0 0 240 240" role="img" aria-label={pieAltText}>
                                {#each schoolPieSlices as slice (slice.id)}
                                    <path d={slice.path} fill={slice.school.color} stroke="#fff" stroke-width="1" />
                                    {#if slice.percent >= 3}<text x={slice.labelX} y={slice.labelY} class="slice-percent" text-anchor="middle" dominant-baseline="middle">{slice.percent}%</text>{/if}
                                {/each}
                            </svg>
                        {:else}
                            <svg class="teacher-pie" viewBox="0 0 240 240" role="group" aria-label="Teacher shares of DLL and DLP uploads. Select a slice to see the teacher.">
                                {#each teacherPieSlices as slice (slice.id)}
                                    <path d={slice.path} fill={slice.teacher.color} stroke="#fff" stroke-width={selectedPieTeacherId === slice.id ? 3 : 1} role="button" tabindex="0" aria-pressed={selectedPieTeacherId === slice.id} aria-label={`${slice.percent}% of uploads: ${slice.teacher.label}. Overall compliance ${slice.teacher.completion === null ? 'not available' : `${slice.teacher.completion}%`}`} onclick={() => selectedPieTeacherId = slice.id} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectedPieTeacherId = slice.id; } }} />
                                    {#if slice.percent >= 3}<text x={slice.labelX} y={slice.labelY} class="slice-percent" text-anchor="middle" dominant-baseline="middle">{slice.percent}%</text>{/if}
                                {/each}
                            </svg>
                            <div class="selected-pie-teacher" aria-live="polite">
                                {#if selectedPieTeacher}
                                    <div class="selected-teacher-name"><i style={`background: ${selectedPieTeacher.color}`} aria-hidden="true"></i><strong>{selectedPieTeacher.label}</strong></div>
                                    <span>{selectedPieTeacher.role} · {selectedPieTeacher.value} DLL/DLP files<br />{selectedPieTeacher.completion === null ? 'No required lesson plans' : `Overall compliance ${selectedPieTeacher.completion}% (${selectedPieTeacher.submitted} of ${selectedPieTeacher.expected} required)`}</span>
                                {:else}
                                    <span>Select a colored slice or teacher name to see details.</span>
                                {/if}
                            </div>
                        {/if}
                    </div>
                    <div class="legend">
                        {#each pieData as item}
                            <button type="button" class="pie-legend-row" class:selected={selectedPieTeacherId === item.id && !districtOverview} disabled={districtOverview} aria-pressed={districtOverview ? undefined : selectedPieTeacherId === item.id} onclick={() => selectedPieTeacherId = item.id}>
                                <i style={`background: ${item.color}`} aria-hidden="true"></i>
                                <span class="pie-legend-label">{item.label}<small>{districtOverview ? `${schoolPieSlices.find(slice => slice.id === item.id)?.percent ?? 0}% of school uploads · ${item.completion === null ? 'No required lesson plans' : `${item.completion}% lesson-plan completion`}` : `${item.role} · ${item.completion === null ? 'No required lesson plans' : `Overall compliance ${item.completion}% (${item.submitted} of ${item.expected} required)`}`}</small></span>
                                <strong>{item.value} <span class="legend-unit">files</span></strong>
                            </button>
                        {/each}
                    </div>
                </div>
                <p class="chart-total">{pieTotal} confirmed {pieTotal === 1 ? 'file' : 'files'} in this comparison</p>
                {:else}
                    <p class="chart-empty">No confirmed {districtOverview ? 'school uploads' : 'Teacher or Master Teacher DLL/DLP uploads'} for this period.</p>
                {/if}
            </div>
        <div class="secondary-chart-grid">
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
                        <div class="school-missing-group">
                            <button type="button" class="horizontal-bar-item" aria-label={`${expandedMissingSchoolId === item.id ? 'Hide' : 'Show'} teachers with missing DLLs at ${item.name}`} aria-expanded={expandedMissingSchoolId === item.id} onclick={() => expandedMissingSchoolId = expandedMissingSchoolId === item.id ? null : item.id}>
                                <span>{item.name}</span>
                                <span class="bar-container-small"><span class="bar-fill overdue" style="width: {100 * item.missing / maxSchoolOverdue}%"></span></span>
                                <strong class="bar-count">{item.missing}<span class="toggle-chevron" class:expanded={expandedMissingSchoolId === item.id}><ChevronDown size={16} /></span></strong>
                            </button>
                            {#if expandedMissingSchoolId === item.id}
                                <ul class="detail-list" aria-label={`Teachers with missing DLLs at ${item.name}`}>
                                    {#each teacherRiskRows.filter(t => t.school_id === item.id && t.missing > 0).sort((a, b) => b.missing - a.missing || a.full_name.localeCompare(b.full_name)) as teacher (teacher.id)}
                                        <li><span>{teacher.full_name}</span><strong>{teacher.missing} missing</strong></li>
                                    {/each}
                                </ul>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
            <div class="chart-card risk-card">
                <h4>Risk indicators</h4>
                <p class="risk-description">Teachers affected in the selected period. Each number matches the teacher list below it.</p>
                <div class="risk-indicators">
                    {#each riskIndicators as indicator (indicator.key)}
                        <div class="risk-indicator">
                            <button type="button" class="risk-indicator-toggle" disabled={indicator.count === 0} aria-label={`${expandedRiskKey === indicator.key ? 'Hide' : 'Show'} teachers for ${indicator.label}`} aria-expanded={expandedRiskKey === indicator.key} onclick={() => expandedRiskKey = expandedRiskKey === indicator.key ? null : indicator.key}>
                                <span>{indicator.label}</span><strong>{indicator.count}</strong><span class="toggle-chevron" class:expanded={expandedRiskKey === indicator.key}><ChevronDown size={16} /></span>
                            </button>
                            {#if expandedRiskKey === indicator.key && indicator.count > 0}
                                <ul class="detail-list" aria-label={`Teachers for ${indicator.label}`}>
                                    {#each indicator.teachers as teacher (teacher.id)}
                                        <li><span>{teacher.full_name}{#if districtOverview}<small>{schoolName(teacher.school_id)}</small>{/if}</span><strong>{teacher[indicator.metric]} {indicator.detail}</strong></li>
                                    {/each}
                                </ul>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    </div>
    </details>
    {/if}
    <div class="list-tools" bind:this={listControls} tabindex="-1">
        <div class="list-header">
            <h3>{listTitle}</h3>
            {#if filteredClusterTitle}<p class="selected-cluster">{filteredClusterTitle}</p>{/if}
            <div class="list-controls">
                {#if !selectedTeacher}<label class="search"><span class="sr-only">Search {districtOverview ? 'schools' : 'teachers'}</span><div><Search size={16} /><input aria-label={districtOverview ? 'Search schools' : 'Search teachers'} placeholder={districtOverview ? 'Search schools' : 'Search teachers'} bind:value={search} oninput={reset} /></div></label>{/if}
                {#if clusterLabels.length && !selectedTeacher}<div class="cluster-filter"><span class="sr-only">Cluster filter</span><CedimsSelect bind:value={clusterFilter} ariaLabel="Filter by cluster" compact options={[{value:'all',label:'All clusters'}, ...clusterLabels.map(item=>({value:item.label,label:item.label}))]} onChange={reset} /></div>{/if}
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
                        <div><h4>{r.load.subject}</h4><p>{r.load.grade_level || 'No grade'} · Term {r.calendar.term}, Week {r.calendar.week_number}</p><small>Due {formatRequirementDeadline(r)}</small>{#if r.leaveRequest && isTeacherWideLeave(r.leaveRequest)}<small>Leave: {formatLeaveRange(r.leaveRequest.start_date, r.leaveRequest.end_date)}</small>{/if}</div>
                        <div class="status-pill" class:missing={r.status === 'missing'} class:leave={r.status === 'on-leave' || r.status === 'leave-requested'}>{requirementLabel(r)}</div>
                        {#if r.leaveRequest?.status === 'pending' && r.teacherId !== $profile?.id && ['Master Teacher', 'School Head', 'District Supervisor'].includes($profile?.role || '')}
                            <a href={`/dashboard/leave?id=${encodeURIComponent(r.leaveRequest.id)}`}>Review leave request</a>
                        {/if}
                    </article>
                {/each}
            {/if}
        {:else}
            {#each sortedTeachers.slice((page - 1) * size, page * size) as t}
                <article>
                    <div><h4>{t.full_name}</h4><p>{t.submitted} of {t.expected} submitted · {t.rate === null ? 'N/A' : t.rate + '%'} complete{t.onLeave ? ` · ${t.onLeave} on leave excluded` : ''}</p>{#if t.leavePending}<small>{t.leavePending} leave request{t.leavePending === 1 ? '' : 's'} pending</small>{:else if clusterLabelFor(t.id)}<small>{clusterLabelFor(t.id)}</small>{/if}</div>
                    <div class="action-metrics"><button class="metric missing" disabled={!t.missing} onclick={() => openTeacher(t.id, 'missing')}><strong>{t.missing}</strong><span>Missing</span></button><button class="metric" disabled={!t.forChecking} onclick={() => openTeacher(t.id, 'for-checking')}><strong>{t.forChecking}</strong><span>For checking</span></button></div>
                    <button class="row-action" onclick={() => openTeacher(t.id)}>Open DLLs <ChevronRight size={16} /></button>
                </article>
            {/each}
        {/if}
        {#if rowCount === 0}<p class="empty">{calendar.length === 0 ? 'No active calendar weeks for this school year.' : status === 'missing' && !search ? 'No missing DLLs for this period.' : status === 'for-checking' && !search ? 'No files waiting for remarks for this period.' : 'No results match this view.'}</p>{/if}
    </div>
    <PaginationBar bind:page pages={pages} total={rowCount} pageSize={size} itemLabel={districtOverview ? 'schools' : 'teachers'} />
</div>

<style>
    .compliance-workspace { color: var(--color-text-primary); min-width: 0; display: grid; gap: 14px; }
    .control-panel { display: grid; gap: 12px; padding: 14px 16px 16px; border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-white); box-shadow: 0 8px 18px rgba(15, 23, 42, .05); }
    .view-heading { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 14px; }
    .heading-main { min-width: 0; display: grid; gap: 4px; }
    .heading-main p { margin: 0; color: var(--color-text-primary); font-size: 16px; line-height: 1.45; }
    .scope-label { width: fit-content; border-radius: 999px; padding: 4px 10px; background: #eef4ff; color: var(--color-gov-blue); font-size: 14px; font-weight: 850; }
    .header-actions { display: flex; flex-wrap: wrap; justify-content: end; gap: 10px; }
    .list-tools { padding: 4px 0; }
    h2 { font-size: 28px; font-weight: 800; overflow-wrap: anywhere; line-height: 1.15; } h3 { font-size: 20px; font-weight: 800; }
    .filters { display: grid; grid-template-columns: repeat(3, minmax(150px, 210px)) minmax(160px, 220px); gap: 10px; align-items: end; padding-top: 4px; border-top: 1px solid color-mix(in srgb, var(--color-border-subtle) 70%, transparent); }
    label, .picker-field { display: flex; flex-direction: column; gap: 5px; font-size: 15px; font-weight: 800; min-width: 0; color: var(--color-text-primary); }
    .picker { position: relative; min-width: 0; }
    .picker-trigger {
        width: 100%;
        min-height: 46px;
        justify-content: space-between;
        padding: 0 12px;
        border: 1px solid var(--color-border-subtle);
        border-radius: 8px;
        background: var(--color-surface-white);
        color: var(--color-gov-blue);
        font-size: 18px;
        font-weight: 800;
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
        min-height: 46px;
        padding: 0 16px;
        color: var(--color-text-primary);
        font-size: 17px;
        font-weight: 800;
        text-align: left;
    }
    .picker-menu button.active { background: var(--color-surface-muted); color: var(--color-gov-blue); }
    .picker-menu button:hover { background: var(--color-surface-muted); }
    .search div { min-width: 0; height: 42px; border: 1px solid var(--color-border-subtle); border-radius: 6px; background: var(--color-surface-white); padding: 7px 10px; font-size: 16px; }
    .search, .cluster-filter { width: 220px; max-width: 100%; } .search div { display: flex; gap: 8px; align-items: center; }
    .search input { width: 100%; min-width: 0; background: transparent; }
    .attention { flex-direction: row; align-items: center; gap: 8px; font-size: 16px; color: var(--color-text-primary); }
    button { display: inline-flex; gap: 6px; align-items: center; justify-content: center; min-height: 40px; cursor: pointer; }
    button:disabled { opacity: .5; cursor: default; }
    .export, .refresh { align-self: start; min-width: 140px; padding: 10px 14px; border-radius: 6px; border: 1px solid var(--color-border-subtle); background: var(--color-surface-white); font-size: 16px; font-weight: 800; color: var(--color-text-primary); }
    .export { min-width: 150px; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; align-items: stretch; }
    .secondary-metrics, .insights-panel { border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-white); overflow: hidden; }
    .secondary-metrics > summary, .insights-panel > summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; padding: 10px 14px; color: var(--color-gov-blue); font-size: 15px; font-weight: 800; cursor: pointer; list-style: none; }
    .secondary-metrics > summary::-webkit-details-marker, .insights-panel > summary::-webkit-details-marker { display: none; }
    .secondary-metrics > summary::after, .insights-panel > summary::after { content: '+'; flex: 0 0 auto; font-size: 20px; line-height: 1; }
    .secondary-metrics[open] > summary::after, .insights-panel[open] > summary::after { content: '−'; }
    .secondary-metrics > summary span, .insights-panel > summary span { margin-left: auto; color: var(--color-text-muted); font-size: 13px; font-weight: 600; text-align: right; }
    .secondary-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 0 12px 12px; }
    .insights-panel .cluster-panel, .insights-panel .charts { margin: 0 12px 12px; }
    .stat-card { display: grid; align-content: start; min-height: 112px; border: 1px solid var(--color-border-subtle); border-radius: 8px; padding: 14px 16px; background: var(--color-surface-white); box-shadow: 0 8px 18px rgba(15, 23, 42, .05); }
    .stat-card.is-missing { background: #fff1f2; border-color: #f4a3aa; }
    .stat-card.is-review { background: #fff7ed; border-color: #f2c48d; }
    .stat-card.is-late { background: #fff7ed; border-color: #f2c48d; }
    .stat-card.is-good { background: #ecfdf5; border-color: #8bd7b0; }
    .stat-card.is-leave { background: #eef4ff; border-color: #aac3eb; }
    dt { display: flex; align-items: center; gap: 8px; font-size: 15px; color: var(--color-text-primary); line-height: 1.3; font-weight: 750; } dd { font-size: 34px; font-weight: 850; line-height: 1.05; }
    small { display: block; font-size: 14px; line-height: 1.35; font-weight: 500; color: var(--color-text-primary); margin-top: 6px; }
    .cluster-panel { border: 1px solid var(--color-border-subtle); border-radius: 8px; padding: 14px; background: var(--color-surface-white); }
    .cluster-head { display: flex; justify-content: space-between; align-items: start; gap: 12px; margin-bottom: 12px; }
    .cluster-head h3 { margin: 0; }
    .cluster-head p { margin: 4px 0 0; color: var(--color-text-primary); font-size: 15px; line-height: 1.4; }
    .cluster-head button { min-width: 128px; padding: 8px 12px; border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-muted); font-size: 15px; font-weight: 750; }
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
    .cluster-grid em { grid-column: 1 / -1; min-height: 18px; color: var(--color-text-primary); font-size: 14px; font-style: normal; line-height: 1.35; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .list-header { display: grid; grid-template-columns: minmax(220px, 1fr) minmax(360px, auto); align-items: center; gap: 12px; width: 100%; padding: 10px 14px; border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-white); }
    .list-header h3 { margin: 0; }
    .list-controls { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; justify-content: end; }
    .row-action { min-width: 128px; min-height: 44px; padding: 0 12px; border: 1px solid #b8c7ee; border-radius: 8px; background: #eef4ff; color: var(--color-gov-blue); white-space: nowrap; font-size: 16px; font-weight: 850; }
    .row-action:hover { background: var(--color-gov-blue); color: white; }
    .missing { color: var(--color-gov-red); font-weight: 700; }
    .count-link { color: inherit; font: inherit; text-decoration: underline; text-underline-offset: 4px; min-width: 44px; min-height: 44px; }
    .count-link:disabled { text-decoration: none; opacity: 1; cursor: default; }
    a.row-action { display: flex; align-items: center; justify-content: center; gap: 6px; }
    .selected-cluster { grid-column: 1 / 2; margin: 2px 0 0; color: var(--color-text-primary); font-size: 15px; overflow-wrap: anywhere; }
    .action-list { display: grid; gap: 8px; }
    .action-list article { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 14px; align-items: center; padding: 16px 18px; border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-white); }
    .action-list h4 { font-size: 18px; font-weight: 850; margin: 0; overflow-wrap: anywhere; }
    .action-list p { margin: 4px 0 0; color: var(--color-text-primary); font-size: 16px; line-height: 1.4; }
    .action-list small { color: var(--color-gov-blue); }
    .action-metrics { display: flex; gap: 8px; }
    .metric { display: grid; gap: 1px; min-width: 82px; min-height: 54px; padding: 6px 10px; border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-muted); }
    .metric strong { font-size: 24px; line-height: 1; font-weight: 850; }
    .metric span { font-size: 14px; color: var(--color-text-primary); font-weight: 700; }
    .metric:disabled { opacity: .42; background: color-mix(in srgb, var(--color-surface-muted) 60%, var(--color-surface-white)); }
    .metric:disabled strong { color: var(--color-text-muted); }
    .metric.missing strong, .status-pill.missing { color: var(--color-gov-red); }
    .status-pill { justify-self: end; border: 1px solid var(--color-border-subtle); border-radius: 999px; padding: 7px 12px; font-size: 15px; font-weight: 800; }
    .status-pill.leave { color: var(--color-gov-blue); background: #eef4ff; border-color: #aac3eb; }
    .list-tools .list-controls { justify-self: end; }
    .list-controls .attention { min-height: 38px; padding-inline: 2px; }
    .charts { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
    .charts.teacher-trends { grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr); align-items: stretch; }
    .secondary-chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; min-width: 0; }
    .teacher-trends .secondary-chart-grid { grid-template-columns: minmax(0, 1fr); }
    .chart-card { background: var(--color-surface-white); border: 1px solid var(--color-border-subtle); border-radius: 8px; padding: 14px; min-width: 0; }
    .chart-card h4 { font-size: 14px; font-weight: 700; color: var(--color-text-muted); margin: 0 0 12px 0; }
    .risk-description { margin: -4px 0 12px; color: var(--color-text-muted); font-size: 13px; line-height: 1.4; }
    .risk-indicator { border-top: 1px solid var(--color-border-subtle); }
    .risk-indicator-toggle { display: grid; grid-template-columns: minmax(0, 1fr) auto 16px; align-items: center; gap: 10px; width: 100%; min-height: 50px; padding: 8px 0; text-align: left; color: var(--color-text-primary); font-size: 14px; font-weight: 600; }
    .risk-indicator-toggle:disabled { opacity: .6; cursor: default; }
    .risk-indicator-toggle:not(:disabled):hover, .horizontal-bar-item:hover { color: var(--color-gov-blue); }
    .risk-indicator-toggle strong { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
    .toggle-chevron { display: inline-flex; transition: transform .2s ease; }
    .toggle-chevron.expanded { transform: rotate(180deg); }
    .detail-list { max-height: 240px; overflow-y: auto; margin: 0 0 8px; padding: 4px 10px; border-radius: 6px; background: var(--color-surface-muted); list-style: none; }
    .detail-list li { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; padding: 8px 0; color: var(--color-text-primary); font-size: 13px; line-height: 1.35; }
    .detail-list li + li { border-top: 1px solid var(--color-border-subtle); }
    .detail-list li span { min-width: 0; overflow-wrap: anywhere; }
    .detail-list li small { display: block; margin-top: 2px; color: var(--color-text-muted); }
    .detail-list li strong { flex: 0 0 auto; font-size: 13px; font-variant-numeric: tabular-nums; }
    .pie-card { min-width: 0; }
    .chart-description { margin: -4px 0 14px; color: var(--color-text-muted); font-size: 14px; line-height: 1.45; }
    .chart-total { margin: 12px 0 0; color: var(--color-text-primary); font-size: 14px; font-weight: 700; }
    .chart-empty { margin: 20px 0 4px; color: var(--color-text-muted); font-size: 15px; }
    .spark-bars { display: grid; grid-template-columns: repeat(auto-fit, minmax(52px, 1fr)); gap: 10px; align-items: end; min-height: 92px; }
    .spark-bars div { display: grid; justify-items: center; align-items: end; gap: 5px; min-width: 0; }
    .spark-bars span { width: 100%; max-width: 30px; min-height: 6px; border-radius: 4px 4px 0 0; background: var(--color-gov-red); }
    .spark-bars small { margin: 0; text-align: center; }
    .spark-bars strong { font-size: 15px; }
    .horizontal-bars { display: flex; flex-direction: column; gap: 12px; }
    .horizontal-bar-item { display: grid; grid-template-columns: minmax(96px, 1fr) minmax(80px, 1.4fr) auto; gap: 12px; align-items: center; width: 100%; text-align: left; }
    button.horizontal-bar-item { min-height: 36px; justify-content: stretch; }
    .bar-count { display: flex; align-items: center; gap: 4px; font-variant-numeric: tabular-nums; }
    .bar-container-small { width: 100%; height: 24px; background: var(--color-surface-white); border-radius: 4px; position: relative; overflow: hidden; }
    .bar-fill { height: 100%; background: var(--color-gov-red); border-radius: 4px; transition: width 0.3s ease; }
    .bar-fill.overdue { background: var(--color-gov-red); }
    .pie-wrap { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 20px; align-items: center; }
    .teacher-trends .pie-wrap { align-items: start; }
    .pie-visual-column { display: flex; flex-direction: column; align-items: center; min-width: 0; }
    .school-pie, .teacher-pie { width: 240px; max-width: 100%; aspect-ratio: 1; border-radius: 50%; box-shadow: 0 0 0 1px var(--color-border-subtle); }
    .teacher-pie path { cursor: pointer; }
    .teacher-pie path:focus-visible { outline: none; stroke: var(--color-gov-blue); stroke-width: 4px; }
    .slice-percent { fill: #111827; stroke: #fff; stroke-width: 3px; paint-order: stroke; font-size: 12px; font-weight: 800; pointer-events: none; }
    .legend { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; min-width: 0; }
    .teacher-trends .legend { grid-template-columns: minmax(0, 1fr); gap: 3px; }
    .pie-legend-row { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; gap: 9px; align-items: start; width: 100%; min-width: 0; padding: 4px; border: 1px solid transparent; border-radius: 6px; background: transparent; text-align: left; color: var(--color-text-primary); font-size: 15px; }
    .pie-legend-row:disabled { opacity: 1; cursor: default; }
    .pie-legend-row:not(:disabled):hover .pie-legend-label { text-decoration: underline; }
    .pie-legend-row.selected .pie-legend-label { color: var(--color-gov-blue); }
    .pie-legend-row i { width: 14px; height: 14px; border-radius: 3px; margin-top: 3px; }
    .pie-legend-row strong { color: var(--color-text-primary); font-size: 16px; white-space: nowrap; }
    .legend-unit { font-size: 12px; font-weight: 500; }
    .pie-legend-label { min-width: 0; font-weight: 700; overflow-wrap: anywhere; }
    .pie-legend-label small { display: block; margin-top: 2px; color: var(--color-text-muted); font-size: 13px; font-weight: 500; line-height: 1.35; }
    .selected-pie-teacher { width: 100%; min-height: 48px; margin-top: 12px; color: var(--color-text-primary); font-size: 14px; line-height: 1.4; overflow-wrap: anywhere; }
    .selected-teacher-name { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; }
    .selected-teacher-name i { width: 14px; height: 14px; flex: 0 0 auto; border-radius: 50%; }
    .selected-pie-teacher strong, .selected-pie-teacher span { display: block; }
    .upload-bars { display: grid; grid-template-columns: repeat(7, minmax(28px, 1fr)); gap: 10px; align-items: end; min-height: 144px; }
    .upload-bars div { display: grid; justify-items: center; align-items: end; gap: 5px; min-width: 0; }
    .upload-bars .stack { display: flex; flex-direction: column-reverse; width: 100%; max-width: 34px; min-height: 6px; border-radius: 5px 5px 0 0; overflow: hidden; background: var(--color-surface-muted); }
    .upload-bars b { display: block; width: 100%; min-height: 3px; }
    .upload-bars .dlp { background: var(--color-gov-blue); }
    .upload-bars .isp { background: var(--color-gov-green); }
    .upload-bars .isr { background: var(--color-gov-gold); }
    .upload-bars small { margin: 0; }
    .upload-bars strong { font-size: 15px; }
    button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid var(--color-gov-blue); outline-offset: 3px; }
    .empty { padding: 32px 12px; text-align: center; color: var(--color-text-muted); }
    @media (max-width: 980px) {
        .charts.teacher-trends { grid-template-columns: minmax(0, 1fr); }
        .teacher-trends .secondary-chart-grid { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    }
    @media (max-width: 920px) {
        .view-heading { grid-template-columns: 1fr; align-items: stretch; }
        .export { width: 100%; min-width: 0; justify-content: center; }
        .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 600px) { .stats { grid-template-columns: 1fr; gap: 10px; } .secondary-stats { grid-template-columns: 1fr; } .secondary-metrics > summary, .insights-panel > summary { align-items: flex-start; flex-wrap: wrap; } .secondary-metrics > summary span, .insights-panel > summary span { flex-basis: 100%; margin-left: 0; text-align: left; } dd { font-size: 24px; } .list-tools { align-items: stretch; } .search, .cluster-filter { width: 100%; } .pie-wrap, .teacher-trends .pie-wrap { grid-template-columns: 1fr; justify-items: center; } .legend { width: 100%; } }
    @media (max-width: 700px) {
        .control-panel { padding: 12px; }
        .filters { grid-template-columns: 1fr; gap: 12px; }
        .picker-trigger { min-height: 54px; font-size: 16px; }
        .picker-menu { position: static; margin-top: 6px; max-height: 240px; }
        .refresh { width: 100%; }
        .search input { font-size: 16px; } .view-heading > div { min-width: 0; }
        .stats { gap: 12px; } .stats small { overflow-wrap: anywhere; }
        .list-header { grid-template-columns: 1fr; align-items: stretch; gap: 10px; }
        .selected-cluster { grid-column: auto; }
        .list-tools .list-controls { justify-self: stretch; }
        .list-controls { grid-template-columns: 1fr; justify-content: stretch; }
        .list-controls .attention { grid-column: auto; }
        .cluster-filter { width: 100%; }
        .charts, .charts.teacher-trends, .secondary-chart-grid, .teacher-trends .secondary-chart-grid { grid-template-columns: 1fr; }
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
    }
</style>
