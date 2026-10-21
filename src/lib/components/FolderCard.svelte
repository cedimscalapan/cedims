<script lang="ts">
    import { fly } from "svelte/transition";
    import { Folder, School, User, Calendar, FileText, ChevronRight } from "lucide-svelte";

    interface Props {
        label: string;
        count: number;
        type: string;
        avatar_url?: string | null;
        onclick: () => void;
        transitionDelay?: number;
    }

    let { label, count, type, avatar_url = null, onclick, transitionDelay = 0 }: Props = $props();

    function getColor(): string {
        switch (type) {
            case "docType": return "from-gov-blue/15 to-gov-blue/5 text-gov-blue";
            case "school": return "from-gov-green/15 to-gov-green/5 text-gov-green";
            case "teacher": return "from-gov-gold/15 to-gov-gold/5 text-gov-gold-dark";
            case "subject": return "from-purple-100 to-purple-50 text-purple-600";
            case "week": return "from-indigo-100 to-indigo-50 text-indigo-600";
            default: return "from-surface-muted to-surface-muted text-text-secondary";
        }
    }

    function getIcon() {
        switch (type) {
            case "school": return School;
            case "teacher": return User;
            case "subject": return FileText;
            case "week": return Calendar;
            default: return Folder;
        }
    }

    const IconComp = getIcon();
</script>

<button
    class="gov-card group flex min-h-[6.5rem] w-full items-center gap-4 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-gov-blue/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-blue focus-visible:ring-offset-2"
    onclick={onclick}
    transition:fly={{ y: 20, duration: 300, delay: transitionDelay }}
>
    <div
        class="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br {getColor()} flex items-center justify-center transition-transform duration-200 group-hover:scale-105"
    >
        {#if avatar_url}
            <img src={avatar_url} alt={label} class="w-full h-full object-cover" />
        {:else}
            <IconComp size={22} />
        {/if}
    </div>
    <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-bold text-text-primary">{label}</span>
        <span class="mt-1 block text-xs text-text-muted">{count} {count === 1 ? 'file' : 'files'}</span>
    </span>
    <ChevronRight size={18} class="shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-gov-blue" aria-hidden="true" />
</button>

