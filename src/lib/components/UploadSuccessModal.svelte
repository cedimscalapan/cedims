<script lang="ts">
    import { fade, scale } from "svelte/transition";
    import { CheckCircle2, X, ArrowRight, Upload } from "lucide-svelte";
    import { onMount } from "svelte";
    import { focusTrap } from "$lib/actions/focusTrap";
    import { config } from "$lib/utils/config";
    import type { PipelineResult } from "$lib/types/pipeline";

    interface Props {
        result: PipelineResult;
        isOnline: boolean;
        docType: string;
        weekNumber?: number;
        onViewArchive: () => void;
        onUploadAnother: () => void;
        onClose: () => void;
    }

    let { result, isOnline, docType, weekNumber, onViewArchive, onUploadAnother, onClose }: Props = $props();

    let qrDataUrl = $state<string | null>(null);

    onMount(async () => {
        try {
            const QRCode = (await import("qrcode")).default;
            const verifyUrl = `${config.APP_URL}/verify/${result.fileHash}`;
            qrDataUrl = await QRCode.toDataURL(verifyUrl, {
                width: 160,
                margin: 1,
                color: { dark: "#1a202c", light: "#ffffff" },
            });
        } catch (err) {
            console.warn("[UploadSuccessModal] QR generation failed:", err);
        }
    });

    function formatSize(bytes: number): string {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }
</script>

<div
    class="fixed inset-0 z-[var(--z-modal)] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
    transition:fade={{ duration: 150 }}
    onclick={onClose}
    onkeydown={(e) => { if (e.key === "Escape") onClose(); }}
    role="presentation"
>
    <div
        class="w-full max-w-md bg-surface-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => { e.stopPropagation(); if (e.key === "Escape") onClose(); }}
        role="dialog"
        aria-modal="true"
        aria-label={isOnline ? "Document archived" : "Saved offline, not yet synced"}
        tabindex="-1"
        use:focusTrap
        transition:scale={{ start: 0.96, duration: 180 }}
    >
        <div class="relative px-6 pt-8 pb-6 text-center border-b border-border-subtle">
            <button
                onclick={onClose}
                class="absolute top-4 right-4 p-1.5 rounded-full text-text-muted hover:bg-surface-muted hover:text-text-primary transition-colors"
                aria-label="Close"
            >
                <X size={18} />
            </button>

            <div class="mx-auto w-16 h-16 rounded-full bg-gov-green/10 flex items-center justify-center mb-4">
                <CheckCircle2 size={32} class="text-gov-green" strokeWidth={2} />
            </div>
            <h2 class="text-xl font-bold text-text-primary">
                {isOnline ? "Document Archived" : "Saved Offline"}
            </h2>
            <p class="text-sm text-text-secondary mt-1">
                {isOnline
                    ? "Your document was uploaded and stamped for verification."
                    : "It will upload automatically once you're back online."}
            </p>
        </div>

        <div class="px-6 py-5 space-y-4">
            <div class="rounded-xl bg-surface-muted p-4 text-sm space-y-2">
                <div class="flex justify-between gap-3">
                    <span class="text-text-muted">File</span>
                    <span class="font-semibold text-text-primary truncate max-w-[60%]" title={result.fileName}>
                        {result.fileName}
                    </span>
                </div>
                <div class="flex justify-between gap-3">
                    <span class="text-text-muted">Type</span>
                    <span class="font-semibold text-text-primary">
                        {docType}{weekNumber ? ` · Week ${weekNumber}` : ""}
                    </span>
                </div>
                <div class="flex justify-between gap-3">
                    <span class="text-text-muted">Size</span>
                    <span class="font-semibold text-text-primary">{formatSize(result.fileSize)}</span>
                </div>
                <div class="pt-2 border-t border-border-subtle">
                    <span class="text-text-muted block mb-1">SHA-256</span>
                    <code class="font-mono text-[11px] text-gov-blue break-all">{result.fileHash}</code>
                </div>
            </div>

            {#if isOnline}
                <div class="flex flex-col items-center gap-2 py-2">
                    {#if qrDataUrl}
                        <img src={qrDataUrl} alt="Verification QR code" class="w-32 h-32 rounded-lg border border-border-subtle" />
                    {:else}
                        <div class="w-32 h-32 rounded-lg border border-border-subtle bg-surface-muted animate-pulse"></div>
                    {/if}
                    <p class="text-[11px] text-text-muted text-center max-w-xs">
                        Scan to verify this document's authenticity at any time.
                    </p>
                </div>
            {/if}
        </div>

        <div class="px-6 pb-6 flex flex-col sm:flex-row gap-3">
            <button
                onclick={onUploadAnother}
                class="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl border border-border-strong text-text-primary text-sm font-bold hover:bg-surface-muted transition-colors"
            >
                <Upload size={16} />
                Upload Another
            </button>
            <button
                onclick={onViewArchive}
                class="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-gov-blue text-white text-sm font-bold hover:bg-gov-blue-dark transition-colors"
            >
                View in Archive
                <ArrowRight size={16} />
            </button>
        </div>
    </div>
</div>
