<script lang="ts">
    import {
        CheckCircle2,
        Clock,
        AlertCircle,
        Search,
        Loader2,
        Copy,
        type Icon,
    } from "lucide-svelte";

    interface Props {
        status: string;
        size?: "sm" | "md";
    }

    let { status, size = "md" }: Props = $props();

    const config: Record<
        string,
        {
            bg: string;
            text: string;
            border: string;
            label: string;
            icon: any;
        }
    > = {
        compliant: {
            bg: "bg-gov-green/15",
            text: "text-gov-green",
            border: "border-gov-green/40",
            label: "Compliant",
            icon: CheckCircle2,
        },
        late: {
            bg: "bg-gov-gold/15",
            text: "text-gov-gold-dark",
            border: "border-gov-gold/50",
            label: "Late",
            icon: Clock,
        },
        missing: {
            bg: "bg-gov-red/15",
            text: "text-gov-red",
            border: "border-gov-red/40",
            label: "Missing",
            icon: AlertCircle,
        },
        pending: {
            bg: "bg-surface-muted/50",
            text: "text-text-secondary",
            border: "border-border-strong/30",
            label: "Pending",
            icon: Loader2,
        },
        supplementary: {
            bg: "bg-gov-blue/10",
            text: "text-gov-blue",
            border: "border-gov-blue/30",
            label: "Supplementary",
            icon: Copy,
        },
        review: {
            bg: "bg-gov-blue/15",
            text: "text-gov-blue",
            border: "border-gov-blue/40",
            label: "Under Review",
            icon: Search,
        },
    };

    // Normalize input to handle different casings
    const normalizedStatus = $derived(() => {
        if (!status) return "pending";
        const s = status.toLowerCase();
        if (s === "compliant" || s === "on-time") return "compliant";
        if (s === "late") return "late";
        if (s === "non-compliant" || s === "non compliant" || s === "missing")
            return "missing";
        if (s === "pending") return "pending";
        if (s === "review" || s === "under review") return "review";
        return s; // Fallback to lowercase
    });

    const c = $derived(config[normalizedStatus()] || config.pending);
    const IconComponent = $derived(c.icon);
    const sizeClass = $derived(
        size === "sm" ? "text-[11px] px-2 py-1 gap-1" : "text-sm px-3 py-1.5 gap-1.5",
    );
</script>

<span
    class="inline-flex items-center rounded-lg border-1.5 font-bold {c.bg} {c.text} {c.border} {sizeClass} transition-colors duration-200"
>
    <IconComponent size={size === "sm" ? 12 : 16} strokeWidth={2} />
    {c.label}
</span>
