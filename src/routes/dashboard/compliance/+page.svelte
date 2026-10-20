<script lang="ts">
    import { onMount } from 'svelte';
    import { profile } from '$lib/utils/auth';
    import { supabase } from '$lib/utils/supabase';
    import { getCurrentSchoolYear } from '$lib/utils/schoolYear';
    import { fetchAllRows, fetchRowsForIds, type CalendarSlot, type ComplianceLoad, type ComplianceSubmission, type LeaveRequest } from '$lib/utils/compliance';
    import ComplianceWorkspace from '$lib/components/ComplianceWorkspace.svelte';
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
    let inFlightLoad: Promise<void> | null = null;
    let lastRealtimeRefreshAt = 0;
    const allowed = $derived(['Master Teacher', 'School Head', 'District Supervisor', 'Admin'].includes($profile?.role || ''));
    const yearOptions = $derived(Array.from({ length: 6 }, (_, i) => {
        const start = Number(getCurrentSchoolYear().slice(0, 4)) + 1 - i;
        return `${start}-${start + 1}`;
    }));

    function changeYear(nextYear: string) {
        year = nextYear;
        try { sessionStorage.setItem(`compliance-year:${$profile?.id}`, year); } catch { /* Storage is optional. */ }
        data = null;
        loading = true;
        void load();
    }

    async function load() {
        if (inFlightLoad) return inFlightLoad;
        inFlightLoad = (async () => {
        if (!$profile || !allowed) { loading = false; return; }
        const request = ++run;
        const user = $profile;
        const selectedYear = year;
        refreshing = true;
        error = '';
        // Bump the snapshot version when roster semantics change so an older
        // cached roster (which may contain users deactivated since it was
        // written) cannot reintroduce them as missing compliance rows.
        const cacheKey = makeScopedCacheKey(`compliance_v3_${selectedYear}_${user.school_id}_${user.district_id}`, user.role, user.id);
        try {
            const schools = await fetchAllRows<Snapshot['schools'][number]>(() => {
                let q = supabase.from('schools').select('id, name, district_id').order('id');
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
            const activeSubmissionUsers = submissionUsers.filter(user => user.is_active !== false);
            const teachers = activeSubmissionUsers.filter(user => user.role === 'Teacher' || user.role === 'Master Teacher').map(({ id, full_name, school_id }) => ({ id, full_name, school_id }));
            const ids = teachers.map(t => t.id);
            const submissionUserIds = activeSubmissionUsers.map(t => t.id);
            const [rawLoads, submissions, calendar, leaveRequests] = await Promise.all([
                fetchRowsForIds<ComplianceLoad>(ids, batch => supabase.from('teaching_loads').select('id, user_id, subject, grade_level, is_active').in('user_id', batch).eq('is_active', true).order('id')),
                fetchRowsForIds<ComplianceSubmission>(submissionUserIds, batch => supabase.from('submissions').select('id, user_id, teaching_load_id, school_year, term_number, week_number, calendar_id, file_path, doc_type, compliance_status, created_at, subject').in('user_id', batch).eq('school_year', selectedYear).in('doc_type', ['DLL', 'DLP', 'ISP', 'ISR']).order('id')),
                fetchAllRows<CalendarSlot>(() => supabase.from('academic_calendar').select('id, school_year, term, week_number, deadline_date, district_id, is_active').eq('school_year', selectedYear).order('id')),
                fetchRowsForIds<LeaveRequest>(submissionUserIds, batch => supabase.from('submission_leave_requests').select('*').in('user_id', batch).eq('school_year', selectedYear).order('created_at', { ascending: false })),
            ]);
            const schoolNames = new Map(schools.map(school => [school.id, school.name]));
            const schoolByUser = new Map(activeSubmissionUsers.map(user => [user.id, schoolNames.get(user.school_id) || null]));
            const loads = rawLoads.map(load => ({ ...load, school_name: schoolByUser.get(load.user_id) || null }));
            const reviews: Snapshot['reviews'] = [];
            const reviewBatchSize = 25;
            for (let i = 0; i < submissions.length; i += reviewBatchSize) {
                reviews.push(...await fetchAllRows<Snapshot['reviews'][number]>(() => supabase.from('dll_reviews').select('submission_id, status, reviewer_comment').in('submission_id', submissions.slice(i, i + reviewBatchSize).map(s => s.id)).order('id')));
            }
            if (request !== run) return;
            data = { schools, teachers, submissionUsers: activeSubmissionUsers, loads, submissions, calendar, leaveRequests, reviews, savedAt: new Date().toISOString() };
            cachedAt = '';
            await writeLocalData(cacheKey, data);
        } catch (e) {
            if (request !== run) return;
            const cached = await readLocalData<Snapshot>(cacheKey, Number.POSITIVE_INFINITY);
            if (request !== run) return;
            if (cached?.data) { data = cached.data; cachedAt = cached.data.savedAt; }
            else { data = null; error = 'Unable to load compliance. Check your connection and confirm the submission term migration has been applied.'; }
            logOnce('compliance-load-failed', 'error', '[compliance] Load failed.', e);
        } finally {
            if (request === run) { loading = false; refreshing = false; }
            inFlightLoad = null;
        }
        })();
        return inFlightLoad;
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
        void load();
        let timer: ReturnType<typeof setTimeout>;
        const refresh = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                if (Date.now() - lastRealtimeRefreshAt < 30000) return;
                lastRealtimeRefreshAt = Date.now();
                void load();
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
    {#if data}<p role="status" class="mb-4 text-sm text-text-muted">{offline ? 'Offline. ' : cachedAt ? 'Saved data. Latest refresh unavailable. ' : ''}Updated at {new Date(data.savedAt).toLocaleString('en-PH')}{offline || cachedAt ? '. Recent changes may not be reflected.' : ''}</p>{/if}
    {#if loading}<SkeletonLoader variant="card-grid" count={3} />
    {:else if error}<p role="alert" class="text-gov-red">{error}</p>
    {:else if data}<ComplianceWorkspace {...data} role={$profile?.role || 'School Head'} {year} {yearOptions} onYearChange={changeYear} refreshing={refreshing} onRefresh={() => void load()} />{/if}
{/if}
