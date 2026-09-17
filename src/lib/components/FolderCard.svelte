<script lang="ts">
    import { fly } from "svelte/transition";
    import { Folder, School, User, Calendar, FileText } from "lucide-svelte";

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
    class="gov-card p-5 text-left cursor-pointer group"
    onclick={onclick}
    transition:fly={{ y: 20, duration: 300, delay: transitionDelay }}
>
    <div
        class="w-12 h-12 rounded-xl bg-gradient-to-br {getColor()} flex items-center justify-center mb-3 mx-auto group-hover:scale-110 transition-transform duration-200 overflow-hidden"
    >
        {#if avatar_url}
            <img src={avatar_url} alt={label} class="w-full h-full object-cover" />
        {:else}
            <IconComp size={22} />
        {/if}
    </div>
    <p class="text-sm font-bold text-text-primary text-center truncate">{label}</p>
    <p class="text-xs text-text-muted text-center mt-1">{count} file{count > 1 ? 's' : ''}</p>
</button>

