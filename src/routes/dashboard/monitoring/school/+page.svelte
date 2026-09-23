<script lang="ts">
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";

    onMount(() => {
        goto("/dashboard/compliance", { replaceState: true });
    });
</script>

<svelte:head>
    <title>Compliance Monitoring: CEDIMS</title>
</svelte:head>

<div class="gov-card-static p-8 text-center">
    <p class="font-semibold text-text-primary">Opening Compliance Monitoring...</p>
</div>
