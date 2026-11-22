<script lang="ts">
    import { onMount } from 'svelte';
    import { profile } from '$lib/utils/auth';
    import { supabase } from '$lib/utils/supabase';
    import { getCurrentSchoolYear } from '$lib/utils/schoolYear';
    import { fetchAllRows, fetchRowsForIds, type CalendarSlot, type ComplianceLoad, type ComplianceSubmission, type LeaveRequest } from '$lib/utils/compliance';
    import PageHeader from '$lib/components/PageHeader.svelte';
    import SkeletonLoader from '$lib/components/SkeletonLoader.svelte';
    import { makeScopedCacheKey, readLocalData, writeLocalData } from '$lib/utils/localDataCache';
    import { logOnce, shouldUseRealtime } from '$lib/utils/noise';

    let year = $state(getCurrentSchoolYear());
    let loading = $state(true);
    let refreshing = $state(false);
    let error = $state('');
    let cachedAt = $state('');
    let offline = $state(false);
    type Counts = { expected: number; submitted: number; missing: number; upcoming: number; onLeave: number; onTime: number; late: number; forChecking: number; checked: number; supplementary: number; rate: number | null };
    type Overview = { year: string; term: string; week: string; savedAt: string; summary: Counts;
        schools: ({ id: string; name: string; district_id: string } & Counts)[];
        teachers: ({ id: string; full_name: string; school_id: string } & Counts)[]; weeks: number[] };
    let overview = $state<Overview | null>(null);
    let overviewTerm = $state('current');
    let overviewWeek = $state('current');
    let detailSchoolId = $state<string | null>(null);
    let detailTeacherId = $state<string | null>(null);
    let showingDetail = $state(false);
    let DetailComponent = $state<any>(null);
    type Snapshot = {
        teachers: { id: string; full_name: string; school_id: string }[];
        submissionUsers: { id: string; full_name: string; school_id: string; role?: string | null; is_active?: boolean | null }[];
        schools: { id: string; name: string; district_id: string }[];
        loads: ComplianceLoad[]; calendar: CalendarSlot[]; submissions: ComplianceSubmission[];
        leaveRequests: LeaveRequest[];
        reviews: { submission_id: string; status?: string | null; reviewer_comment?: string | null }[]; savedAt: string;
    };
    let data = $state<Snapshot | null>(null);
    let run = 0;
    let lastRealtimeRefreshAt = 0;
    const allowed = $derived(['Master Teacher', 'School Head', 'District Supervisor', 'Admin'].includes($profile?.role || ''));
    const yearOptions = $derived(Array.from({ length: 6 }, (_, i) => {
        const start = Number(getCurrentSchoolYear().slice(0, 4)) + 1 - i;
        return `${start}-${start + 1}`;
    }));
    const formatRate = (rate: number | null) => rate === null ? 'N/A' : `${rate}%`;

    function changeYear(nextYear: string) {
        year = nextYear;
        try { sessionStorage.setItem(`compliance-year:${$profile?.id}`, year); } catch { /* Storage is optional. */ }
        data = null;
        overview = null;
        loading = true;
        showingDetail = false;
        overviewTerm = 'current'; overviewWeek = 'current';
        void loadOverview();
    }

    async function loadOverview() {
        if (!$profile || !allowed) { loading = false; return; }
        const request = ++run;
        refreshing = true; error = '';
        const cacheKey = makeScopedCacheKey(`compliance_overview_v1_${year}_${overviewTerm}_${overviewWeek}_${$profile.school_id}_${$profile.district_id}`, $profile.role, $profile.id);
        try {
            if (!overview) {
                const saved = await readLocalData<Overview>(cacheKey, Number.POSITIVE_INFINITY);
                if (request !== run) return;
                if (saved?.data) { overview = saved.data; loading = false; }
            }
            if (!navigator.onLine) {
                if (!overview) error = 'No compliance overview has been saved on this device yet.';
                return;
            }
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) throw new Error('Sign in again.');
            const params = new URLSearchParams({ year, term: overviewTerm, week: overviewWeek });
            const response = await fetch(`/api/compliance/overview?${params}`, {
                headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
            });
            if (!response.ok) throw new Error('Unable to load overview.');
            const result = await response.json() as Overview;
            if (request !== run) return;
            overview = result;
            void writeLocalData(cacheKey, result).catch(cause => console.warn('[compliance] Could not save offline overview', cause));
        } catch (cause) {
            if (request !== run) return;
            console.error('[compliance] Overview unavailable', cause);
            if (!overview) error = 'Unable to load compliance totals. Check your connection and retry.';
        } finally {
            if (request === run) { loading = false; refreshing = false; }
        }
    }

    function openDetail(schoolId: string | null, teacherId: string | null = null) {
        detailSchoolId = schoolId; detailTeacherId = teacherId;
        showingDetail = true; data = null; loading = true;
        void import('$lib/components/ComplianceWorkspace.svelte')
            .then(module => { DetailComponent = module.default; })
            .catch(cause => { console.error('[compliance] Detail view unavailable', cause); error = 'Unable to open detailed view. Please retry.'; loading = false; });
        void load();
    }

    function closeDetail() {
        ++run;
        showingDetail = false; data = null; error = ''; loading = false;
    }

    async function load() {
        return (async () => {
        if (!$profile || !allowed) { loading = false; return; }
        const request = ++run;
        const user = $profile;
        const selectedYear = year;
        refreshing = true;
        error = '';
        try {
            if (!navigator.onLine) {
                error = 'Connect to load detailed records. Your saved overview remains available.';
                return;
            }
            const schools = await fetchAllRows<Snapshot['schools'][number]>(() => {
                let q = supabase.from('schools').select('id, name, district_id').order('id');
                if (detailSchoolId) q = q.eq('id', detailSchoolId);
                if (user.role !== 'District Supervisor' && user.role !== 'Admin') q = q.eq('id', user.school_id || '00000000-0000-0000-0000-000000000000');
                else if (user.district_id) q = q.eq('district_id', user.district_id);
                return q;
            });
            const schoolIds = schools.map(s => s.id);
            const submissionUsers = await fetchRowsForIds<Snapshot['submissionUsers'][number]>(schoolIds, batch => supabase.from('profiles')
                .select('id, full_name, school_id, role, is_active').in('school_id', batch).in('role', ['Teacher', 'Master Teacher', 'School Head']).order('id'));
            // Deactivated accounts stay in Archives, but are no longer part of
            // compliance rosters, deadlines, or review counts. Null remains
            // active for compatibility with older profile rows.
            const activeSubmissionUsers = submissionUsers.filter(person => person.is_active !== false && (!detailTeacherId || person.id === detailTeacherId));
            const teachers = activeSubmissionUsers.filter(user => user.role === 'Teacher' || user.role === 'Master Teacher').map(({ id, full_name, school_id }) => ({ id, full_name, school_id }));
            const ids = teachers.map(t => t.id);
            const submissionUserIds = activeSubmissionUsers.map(t => t.id);
            const [rawLoads, submissions, calendar, leaveRequests] = await Promise.all([
                fetchRowsForIds<ComplianceLoad>(ids, batch => supabase.from('teaching_loads').select('id, user_id, subject, grade_level, is_active').in('user_id', batch).eq('is_active', true).order('id')),
                fetchRowsForIds<ComplianceSubmission>(submissionUserIds, batch => supabase.from('submissions').select('id, user_id, teaching_load_id, school_year, term_number, week_number, calendar_id, file_path, doc_type, compliance_status, created_at, subject').in('user_id', batch).eq('school_year', selectedYear).in('doc_type', ['DLL', 'DLP', 'ISP', 'ISR']).order('id')),
                fetchAllRows<CalendarSlot>(() => supabase.from('academic_calendar').select('id, school_year, term, week_number, deadline_date, district_id, is_active').eq('school_year', selectedYear).eq('is_published', true).order('id')),
                fetchRowsForIds<LeaveRequest>(submissionUserIds, batch => supabase.from('submission_leave_requests').select('*').in('user_id', batch).eq('school_year', selectedYear).order('created_at', { ascending: false })),
            ]);
            const schoolNames = new Map(schools.map(school => [school.id, school.name]));
            const schoolByUser = new Map(activeSubmissionUsers.map(user => [user.id, schoolNames.get(user.school_id) || null]));
            const loads = rawLoads.map(load => ({ ...load, school_name: schoolByUser.get(load.user_id) || null }));
            const reviews = await fetchRowsForIds<Snapshot['reviews'][number]>(submissions.map(s => s.id), batch =>
                supabase.from('dll_reviews').select('submission_id, status, reviewer_comment')
                    .in('submission_id', batch).order('id'));
            if (request !== run) return;
            data = { schools, teachers, submissionUsers: activeSubmissionUsers, loads, submissions, calendar, leaveRequests, reviews, savedAt: new Date().toISOString() };
            cachedAt = '';
        } catch (e) {
            if (request !== run) return;
            data = null; error = 'Unable to load detailed compliance. Check your connection and retry.';
            logOnce('compliance-load-failed', 'error', '[compliance] Load failed.', e);
        } finally {
            if (request === run) { loading = false; refreshing = false; }
        }
        })();
    }
    onMount(() => {
        try {
            const savedYear = sessionStorage.getItem(`compliance-year:${$profile?.id}`);
            if (savedYear && /^\d{4}-\d{4}$/.test(savedYear)) year = savedYear;
        } catch { /* Storage is optional. */ }
        offline = !navigator.onLine;
        const updateConnection = () => { offline = !navigator.onLine; };
        window.addEventListener('offline', updateConnection);
        window.addEventListener('online', updateConnection);
        void loadOverview();
        let timer: ReturnType<typeof setTimeout>;
        const refresh = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                if (Date.now() - lastRealtimeRefreshAt < 30000) return;
                lastRealtimeRefreshAt = Date.now();
                if (showingDetail) void load(); else void loadOverview();
            }, 1500);
        };
        let channel: ReturnType<typeof supabase.channel> | null = null;
        if (shouldUseRealtime()) {
            channel = supabase.channel('compliance-workspace');
            for (const table of ['submissions', 'dll_reviews', 'submission_leave_requests', 'profiles']) {
                channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh);
            }
            channel.subscribe();
        }
        window.addEventListener('online', refresh);
        window.addEventListener('cedims:refresh-visible-route', refresh);
        return () => { run++; clearTimeout(timer); if (channel) void supabase.removeChannel(channel); window.removeEventListener('offline', updateConnection); window.removeEventListener('online', updateConnection); window.removeEventListener('online', refresh); window.removeEventListener('cedims:refresh-visible-route', refresh); };
    });
</script>

<svelte:head><title>Compliance Monitoring: CEDIMS</title></svelte:head>
<PageHeader title={['District Supervisor', 'Admin'].includes($profile?.role || '') ? 'District Compliance' : 'School Compliance'} description={['District Supervisor', 'Admin'].includes($profile?.role || '') ? 'Compare schools, identify district-wide risks, and open a school for details.' : 'Track your school’s submissions, follow up missing DLLs, and manage review work.'} />
{#if !allowed && !loading}
    <p role="alert">Compliance Monitoring is available to school and district reviewers.</p>
{:else}
    {#if overview && !showingDetail}<p role="status" class="mb-4 text-sm text-text-muted">{offline ? 'Offline saved overview. ' : ''}Updated at {new Date(overview.savedAt).toLocaleString('en-PH')}{offline ? '. Recent changes may not be reflected.' : ''}</p>{/if}
    {#if data && showingDetail}<p role="status" class="mb-4 text-sm text-text-muted">Updated at {new Date(data.savedAt).toLocaleString('en-PH')}</p>{/if}
    {#if loading || (showingDetail && !DetailComponent && !error)}<SkeletonLoader variant="card-grid" count={3} />
    {:else if error}<div role="alert" class="rounded-xl border border-red-200 bg-red-50 p-4 text-gov-red">{error}<div class="mt-3 flex gap-2"><button class="rounded-lg border px-3 py-2" onclick={() => showingDetail ? (DetailComponent ? void load() : openDetail(detailSchoolId, detailTeacherId)) : void loadOverview()}>Try again</button>{#if showingDetail}<button class="rounded-lg border px-3 py-2" onclick={closeDetail}>Back to overview</button>{/if}</div></div>
    {:else if showingDetail && data && DetailComponent}<DetailComponent {...data} role={$profile?.role || 'School Head'} {year} {yearOptions} onYearChange={changeYear} refreshing={refreshing} onRefresh={() => void load()} initialSchoolId={detailSchoolId} initialTeacherId={detailTeacherId} initialTerm={overview?.term} initialWeek={overview?.week} onExit={closeDetail} />
    {:else if overview}
        <section class="space-y-4" aria-label="Compliance overview">
            <div class="rounded-xl border border-border-subtle bg-surface-white p-4 sm:p-5">
                <div class="flex flex-wrap items-center justify-between gap-3"><div><p class="text-xs font-bold text-gov-blue">{$profile?.role}</p><h2 class="text-xl font-extrabold text-text-primary">Compliance Monitoring</h2><p class="text-sm text-text-muted">Summary first. Open a school or teacher to load detailed records.</p></div><button class="rounded-lg border border-border-subtle px-4 py-2 text-sm font-bold" disabled={refreshing} onclick={() => void loadOverview()}>{refreshing ? 'Refreshing…' : 'Refresh'}</button></div>
                <div class="mt-4 flex flex-wrap gap-3 border-t border-border-subtle pt-4">
                    <label class="text-sm font-semibold">School year <select class="ml-2 rounded-lg border border-border-subtle bg-surface-white p-2" value={year} onchange={(event) => changeYear(event.currentTarget.value)}>{#each yearOptions as option}<option value={option}>{option}</option>{/each}</select></label>
                    <label class="text-sm font-semibold">Term <select class="ml-2 rounded-lg border border-border-subtle bg-surface-white p-2" value={overviewTerm} onchange={(event) => { overviewTerm = event.currentTarget.value; overviewWeek = 'all'; overview = null; loading = true; void loadOverview(); }}><option value="current">Current term</option><option value="all">All terms</option>{#each [1,2,3] as term}<option value={String(term)}>Term {term}</option>{/each}</select></label>
                    <label class="text-sm font-semibold">Week <select class="ml-2 rounded-lg border border-border-subtle bg-surface-white p-2" value={overviewWeek} onchange={(event) => { overviewWeek = event.currentTarget.value; overview = null; loading = true; void loadOverview(); }}><option value="current">Current week</option><option value="all">All weeks</option>{#each overview.weeks as week}<option value={String(week)}>Week {week}</option>{/each}</select></label>
                </div>
            </div>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div class="rounded-xl border border-red-200 bg-red-50 p-4"><p class="text-sm font-bold">Missing DLLs</p><strong class="text-3xl">{overview.summary.missing}</strong></div>
                <div class="rounded-xl border border-amber-200 bg-amber-50 p-4"><p class="text-sm font-bold">For checking</p><strong class="text-3xl">{overview.summary.forChecking}</strong></div>
                <div class="rounded-xl border border-orange-200 bg-orange-50 p-4"><p class="text-sm font-bold">Late submissions</p><strong class="text-3xl">{overview.summary.late}</strong></div>
                <div class="rounded-xl border border-green-200 bg-green-50 p-4"><p class="text-sm font-bold">Submitted</p><strong class="text-3xl">{overview.summary.submitted}</strong><p class="text-xs">{overview.summary.expected} expected · {formatRate(overview.summary.rate)} complete</p></div>
            </div>
            <div class="rounded-xl border border-border-subtle bg-surface-white p-4"><h3 class="font-bold">Other submission statuses</h3><p class="mt-1 text-sm">{overview.summary.onTime} on time · {overview.summary.checked} checked · {overview.summary.onLeave} on leave · {overview.summary.supplementary} supplementary</p></div>
            {#if $profile?.role === 'District Supervisor' || $profile?.role === 'Admin'}
                <section class="space-y-2"><h3 class="font-bold">Schools</h3>{#each overview.schools as school}<button class="flex w-full items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-white p-4 text-left hover:border-gov-blue" onclick={() => openDetail(school.id)}><span><strong>{school.name}</strong><small class="block text-text-muted">{school.submitted} of {school.expected} submitted · {formatRate(school.rate)} complete</small></span><span class="text-sm font-bold text-gov-blue">{school.missing} missing · Open school →</span></button>{/each}</section>
            {:else}
                <section class="space-y-2"><h3 class="font-bold">Teachers</h3>{#each overview.teachers as teacher}<button class="flex w-full items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-white p-4 text-left hover:border-gov-blue" onclick={() => openDetail(teacher.school_id, teacher.id)}><span><strong>{teacher.full_name}</strong><small class="block text-text-muted">{teacher.submitted} of {teacher.expected} submitted · {formatRate(teacher.rate)} complete</small></span><span class="text-sm font-bold text-gov-blue">{teacher.missing} missing · Open teacher →</span></button>{/each}</section>
            {/if}
            <button class="rounded-lg bg-gov-blue px-4 py-2 font-bold text-white" onclick={() => openDetail(null)}>Open detailed view and reports</button>
        </section>
    {/if}
{/if}
