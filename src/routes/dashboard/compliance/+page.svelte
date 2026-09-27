<script lang="ts">
    import { onMount } from 'svelte';
    import { profile } from '$lib/utils/auth';
    import { supabase } from '$lib/utils/supabase';
    import { getCurrentSchoolYear } from '$lib/utils/schoolYear';
    import { fetchAllRows, fetchRowsForIds, type CalendarSlot, type ComplianceLoad, type ComplianceSubmission } from '$lib/utils/compliance';
    import ComplianceWorkspace from '$lib/components/ComplianceWorkspace.svelte';
    import PageHeader from '$lib/components/PageHeader.svelte';
    import SkeletonLoader from '$lib/components/SkeletonLoader.svelte';
    import { makeScopedCacheKey, readLocalData, writeLocalData } from '$lib/utils/localDataCache';
    import { RefreshCw } from 'lucide-svelte';

    let year = $state(getCurrentSchoolYear());
    let loading = $state(true);
    let refreshing = $state(false);
    let error = $state('');
    let cachedAt = $state('');
    type Snapshot = {
        teachers: { id: string; full_name: string; school_id: string }[];
        schools: { id: string; name: string; district_id: string }[];
        loads: ComplianceLoad[]; calendar: CalendarSlot[]; submissions: ComplianceSubmission[];
        reviews: { submission_id: string; status: string }[]; savedAt: string;
    };
    let data = $state<Snapshot | null>(null);
    let run = 0;
    const allowed = $derived(['Master Teacher', 'School Head', 'District Supervisor'].includes($profile?.role || ''));

    async function load() {
        if (!$profile || !allowed) { loading = false; return; }
        const request = ++run;
        const user = $profile;
        const selectedYear = year;
        refreshing = true;
        error = '';
        const cacheKey = makeScopedCacheKey(`compliance_v2_${selectedYear}_${user.school_id}_${user.district_id}`, user.role, user.id);
        try {
            const schools = await fetchAllRows<Snapshot['schools'][number]>(() => {
                let q = supabase.from('schools').select('id, name, district_id').order('id');
                if (user.role !== 'District Supervisor') q = q.eq('id', user.school_id || '00000000-0000-0000-0000-000000000000');
                else if (user.district_id) q = q.eq('district_id', user.district_id);
                return q;
            });
            const schoolIds = schools.map(s => s.id);
            const teachers = await fetchRowsForIds<Snapshot['teachers'][number]>(schoolIds, batch => supabase.from('profiles')
                .select('id, full_name, school_id').in('school_id', batch).in('role', ['Teacher', 'Master Teacher']).order('id'));
            const ids = teachers.map(t => t.id);
            const [loads, submissions, calendar] = await Promise.all([
                fetchRowsForIds<ComplianceLoad>(ids, batch => supabase.from('teaching_loads').select('id, user_id, subject, grade_level, is_active').in('user_id', batch).eq('is_active', true).order('id')),
                fetchRowsForIds<ComplianceSubmission>(ids, batch => supabase.from('submissions').select('id, user_id, teaching_load_id, school_year, term_number, week_number, calendar_id, file_path, doc_type, compliance_status, created_at').in('user_id', batch).eq('school_year', selectedYear).eq('doc_type', 'DLL').order('id')),
                fetchAllRows<CalendarSlot>(() => supabase.from('academic_calendar').select('id, school_year, term, week_number, deadline_date, district_id, is_active').eq('school_year', selectedYear).eq('is_active', true).order('id')),
            ]);
            const reviews: Snapshot['reviews'] = [];
            for (let i = 0; i < submissions.length; i += 100) {
                reviews.push(...await fetchAllRows<Snapshot['reviews'][number]>(() => supabase.from('dll_reviews').select('submission_id, status').in('submission_id', submissions.slice(i, i + 100).map(s => s.id)).order('id')));
            }
            if (request !== run) return;
            data = { schools, teachers, loads, submissions, calendar, reviews, savedAt: new Date().toISOString() };
            cachedAt = '';
            await writeLocalData(cacheKey, data);
        } catch (e) {
            if (request !== run) return;
            const cached = await readLocalData<Snapshot>(cacheKey, Number.POSITIVE_INFINITY);
            if (request !== run) return;
            if (cached?.data) { data = cached.data; cachedAt = cached.data.savedAt; }
            else { data = null; error = 'Unable to load compliance. Check your connection and confirm the submission term migration has been applied.'; }
            console.error('[compliance]', e);
        } finally {
            if (request === run) { loading = false; refreshing = false; }
        }
    }
    onMount(() => {
        void load();
        let timer: ReturnType<typeof setTimeout>;
        const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void load(), 400); };
        const channel = supabase.channel('compliance-workspace');
        for (const table of ['submissions', 'dll_reviews', 'teaching_loads', 'academic_calendar', 'profiles', 'schools']) {
            channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh);
        }
        channel.subscribe();
        window.addEventListener('online', refresh);
        window.addEventListener('cedims:refresh-visible-route', refresh);
        return () => { run++; clearTimeout(timer); void supabase.removeChannel(channel); window.removeEventListener('online', refresh); window.removeEventListener('cedims:refresh-visible-route', refresh); };
    });
</script>

<svelte:head><title>Compliance Monitoring: CEDIMS</title></svelte:head>
<PageHeader title={$profile?.role === 'District Supervisor' ? 'District Compliance' : 'School Compliance'} description={$profile?.role === 'District Supervisor' ? 'Compare schools, identify district-wide risks, and open a school for details.' : 'Track your school’s submissions, follow up missing DLLs, and manage review work.'} />
{#if !allowed && !loading}
    <p role="alert">Compliance Monitoring is available to supervisors.</p>
{:else}
    <div class="mb-4 flex flex-wrap items-end gap-3">
        <label class="text-sm font-semibold">School year
            <select class="ml-2 rounded border border-border-subtle bg-surface-white p-2" bind:value={year} onchange={() => { data = null; loading = true; void load(); }}>
                {#each Array.from({ length: 6 }, (_, i) => Number(getCurrentSchoolYear().slice(0, 4)) + 1 - i) as start}
                    <option value={`${start}-${start + 1}`}>{start}-{start + 1}</option>
                {/each}
            </select>
        </label>
        <button class="gov-btn-secondary" disabled={refreshing} onclick={() => void load()}><RefreshCw size={16} />{refreshing ? 'Refreshing...' : 'Refresh'}</button>
    </div>
    {#if cachedAt}<p role="status" class="mb-4 text-sm text-gov-gold-dark">Offline snapshot from {new Date(cachedAt).toLocaleString()}. Changes may not be reflected.</p>{/if}
    {#if loading}<SkeletonLoader variant="card-grid" count={3} />
    {:else if error}<p role="alert" class="text-gov-red">{error}</p>
    {:else if data}<ComplianceWorkspace {...data} role={$profile?.role || 'School Head'} {year} />{/if}
{/if}
