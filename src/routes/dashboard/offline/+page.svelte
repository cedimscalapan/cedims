<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { profile } from '$lib/utils/auth';
    import { connectivity } from '$lib/stores/connectivity';
    import { getQueueSize, getCachedMetadata } from '$lib/utils/offline';

    let pending = $state(0);
    let loads = $state(0);
    let weeks = $state(0);
    let savedAt = $state('');
    const canUpload = $derived(['Teacher', 'Master Teacher', 'School Head'].includes($profile?.role || ''));
    const { isOnline } = connectivity;

    onMount(() => {
        void connectivity.checkConnection().then(online => { if (online) void goto('/dashboard/upload'); });
        const id = $profile?.id;
        if (!id) return;
        void getQueueSize(id).then(value => pending = value);
        void getCachedMetadata(`teaching_loads_${id}`).then(saved => { loads = Array.isArray(saved?.data) ? saved.data.length : 0; });
        const district = $profile?.district_id;
        if (district) void getCachedMetadata(`calendar_${district}`).then(saved => {
            weeks = Array.isArray(saved?.data) ? saved.data.filter((item: any) => item.is_active).length : 0;
            savedAt = saved?.timestamp ? new Date(saved.timestamp).toLocaleString('en-PH') : '';
        });
    });
</script>

<svelte:head><title>Offline workspace · CEDIMS</title></svelte:head>
<section class="mx-auto max-w-3xl space-y-5">
    <div class="rounded-xl border border-gov-gold/30 bg-gov-gold/10 p-6">
        <h1 class="text-2xl font-bold text-text-primary">Offline workspace</h1>
        <p class="mt-2 text-sm text-text-secondary">CEDIMS cannot reach the server. You can prepare a document using choices saved on this device. A pending document is not in the server archive until it syncs.</p>
    </div>
    {#if canUpload}
        <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-xl border border-border-subtle bg-surface-white p-4"><strong>{loads}</strong><p class="text-sm">Saved teaching loads</p></div>
            <div class="rounded-xl border border-border-subtle bg-surface-white p-4"><strong>{weeks}</strong><p class="text-sm">Saved open weeks</p></div>
            <div class="rounded-xl border border-border-subtle bg-surface-white p-4"><strong>{pending}</strong><p class="text-sm">Files waiting on this device</p></div>
        </div>
        {#if savedAt}<p class="text-xs text-text-muted">Calendar last saved {savedAt}</p>{/if}
        <a href="/dashboard/upload" class="inline-flex min-h-11 items-center rounded-lg bg-gov-blue px-5 py-3 font-bold text-white">Open offline Upload</a>
        {#if !loads && $profile?.role !== 'School Head'}<p class="text-sm text-text-muted">Connect once to save teaching loads before a weekly DLL upload.</p>{/if}
    {:else}
        <p class="rounded-lg border border-border-subtle bg-surface-white p-4">Offline upload is available to Teachers, Master Teachers, and School Heads with a saved session.</p>
    {/if}
    <div class="flex flex-wrap gap-3 text-sm font-semibold">
        <a href="/dashboard" class="text-gov-blue">Saved Tracker</a>
        <a href="/dashboard/archive" class="text-gov-blue">Saved Archives</a>
        {#if $profile?.role !== 'Teacher'}<a href="/dashboard/compliance" class="text-gov-blue">Saved Compliance</a>{/if}
    </div>
</section>
