<script lang="ts">
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { supabase } from "$lib/utils/supabase";
    import StatusBadge from "$lib/components/StatusBadge.svelte";
    import QRScanner from "$lib/components/QRScanner.svelte";
    import { onMount } from "svelte";
    import { lookupOfflineDoc, cacheVerifiedDoc } from "$lib/utils/offline";
    import { profile } from "$lib/utils/auth";
    import { addToast } from "$lib/stores/toast";
    import {
        CheckCircle2,
        ShieldCheck,
        Clock,
        FileText,
        AlertCircle,
        WifiOff,
        Calendar,
        ScanLine,
        Download,
        Eye,
        Lock,
        LogIn,
        Loader2,
    } from "lucide-svelte";

    interface VerifyResult {
        file_name: string;
        file_path: string;
        doc_type: string;
        compliance_status: string | null;
        created_at: string;
        file_size: number;
        week_number: number | null;
        subject: string | null;
        school_year: string | null;
        teacher_name: string | null;
        school_name: string | null;
        teaching_load_subject: string | null;
        teaching_load_grade: string | null;
        uploader_id: string | null;
        uploader_school_id: string | null;
    }

    let result = $state<VerifyResult | null>(null);
    let notFound = $state(false);
    let loading = $state(true);
    let isOfflineData = $state(false);
    let showScanner = $state(false);
    let openingDoc = $state(false);

    let canAccessFile = $derived.by(() => {
        const viewer = $profile;
        if (!viewer || !result) return false;
        if (viewer.role === 'District Supervisor') return true;
        if ((viewer.role === 'School Head' || viewer.role === 'Master Teacher') && result.uploader_school_id) {
            return viewer.school_id === result.uploader_school_id;
        }
        if (viewer.role === 'Teacher' && result.uploader_id) {
            return viewer.id === result.uploader_id;
        }
        return false;
    });

    let isLoggedIn = $derived(!!$profile);

    const hash = $derived($page.params.hash);

    onMount(async () => {
        // 1. Check offline cache first (Phase 20.3)
        const cached = await lookupOfflineDoc(hash as string);
        if (cached) {
            result = cached;
            isOfflineData = true;
            loading = false;
        }

        // 2. Try fetching fresh data from Supabase.
        //
        // This calls a SECURITY DEFINER RPC (verify_submission_by_hash) instead
        // of selecting from `submissions` directly. The table's RLS used to
        // carry a blanket "USING (true)" SELECT policy meant to support this
        // exact page, but a per-row policy can't be scoped to "only when the
        // client filters by hash" — it just made the whole table readable by
        // anyone regardless of what a query actually asked for. The RPC
        // achieves the same public-verification goal without that exposure:
        // it only ever returns the single row matching the exact hash given.
        try {
            const { data, error } = (await supabase
                .rpc("verify_submission_by_hash", { p_hash: hash })
                .maybeSingle()) as { data: VerifyResult | null; error: unknown };

            if (data) {
                const freshResult: VerifyResult = {
                    file_name: data.file_name,
                    file_path: data.file_path,
                    doc_type: data.doc_type,
                    compliance_status: data.compliance_status,
                    created_at: data.created_at,
                    file_size: data.file_size,
                    week_number: data.week_number,
                    subject: data.subject,
                    school_year: data.school_year,
                    teacher_name: data.teacher_name || null,
                    school_name: data.school_name || null,
                    teaching_load_subject: data.teaching_load_subject || null,
                    teaching_load_grade: data.teaching_load_grade || null,
                    uploader_id: data.uploader_id || null,
                    uploader_school_id: data.uploader_school_id || null,
                };

                result = freshResult;
                isOfflineData = false;

                // Update cache for future offline use
                await cacheVerifiedDoc(hash as string, freshResult);
            } else if (!result) {
                notFound = true;
            }
        } catch (err) {
            if (!result) notFound = true;
        } finally {
            loading = false;
        }
    });

    function formatDate(dateStr: string): string {
        const date = new Date(dateStr);
        const dateFormatted = date.toLocaleDateString("en-PH", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
        const timeFormatted = date.toLocaleTimeString("en-PH", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        });
        return `${dateFormatted} at ${timeFormatted}`;
    }

    function handleScanResult(data: string) {
        showScanner = false;
        // Extract hash from verification URL or use raw data
        const hashMatch = data.match(/\/verify\/([a-f0-9]{64})/i);
        const scannedHash = hashMatch ? hashMatch[1] : data;
        if (scannedHash && /^[a-f0-9]{64}$/i.test(scannedHash)) {
            goto(`/verify/${scannedHash}`);
        }
    }

    function openScanner() {
        showScanner = true;
    }

    async function handleOpenDocument() {
        if (!result?.file_path || !canAccessFile) return;
        openingDoc = true;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) {
                addToast('error', 'Please sign in to view this document.');
                return;
            }

            const res = await fetch('/api/storage/presign', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ key: result.file_path, intent: 'download' })
            });

            if (!res.ok) throw new Error('Failed to get download URL');
            const { url } = await res.json();

            if (url) {
                window.open(url, '_blank');
            } else {
                throw new Error('No URL returned');
            }
        } catch (err) {
            console.error('[CEDIMS] Failed to open document:', err);
            addToast('error', 'Unable to open document. Please try again.');
        } finally {
            openingDoc = false;
        }
    }
</script>

<svelte:head>
    <title>Verify Document — CEDIMS · Powered by Smart E-VISION</title>
</svelte:head>

<!-- QR Scanner Overlay for continuous scanning -->
{#if showScanner}
    <QRScanner
        onScan={handleScanResult}
        onClose={() => (showScanner = false)}
    />
{/if}

<div class="min-h-dvh gradient-mesh flex items-center justify-center p-6">
    <div class="w-full max-w-lg animate-slide-up">
        <!-- Logo -->
        <div class="text-center mb-8">
            <div
                class="w-14 h-14 mx-auto rounded-md bg-gradient-to-br from-gov-blue to-gov-blue-dark flex items-center justify-center text-white text-2xl font-bold shadow-sm mb-3"
            >
                E
            </div>
            <h1 class="text-xl font-bold text-text-primary">CEDIMS</h1>
            <p class="text-sm text-text-muted">Document Verification</p>
        </div>

        {#if loading}
            <div
                class="gov-card-static p-12 text-center"
                role="status"
                aria-label="Loading verification"
            >
                <div
                    class="w-12 h-12 border-4 border-gov-blue/20 border-t-gov-blue rounded-full animate-spin mx-auto mb-4"
                ></div>
                <p
                    class="text-text-muted font-bold uppercase tracking-wide text-xs"
                >
                    Authenticating Hash...
                </p>
            </div>
        {:else if notFound}
            <div
                class="gov-card-static bg-gov-red/5 p-10 text-center animate-shake"
                role="alert"
            >
                <AlertCircle size={48} class="text-gov-red mx-auto mb-4" />
                <h2
                    class="text-xl font-semibold text-gov-red mb-2 uppercase tracking-tight"
                >
                    Invalid Document
                </h2>
                <p class="text-sm text-text-secondary mb-6 font-medium">
                    The scanned hash does not match any official record in our
                    secure registry.
                </p>
                <div
                    class="p-3 bg-gov-red/5 rounded-lg border border-gov-red/10"
                >
                    <code class="text-[10px] text-gov-red font-mono break-all"
                        >{hash}</code
                    >
                </div>
            </div>
        {:else if result}
            <div
                class="gov-card-static overflow-hidden border-t-4 border-gov-green shadow-sm"
                role="region"
                aria-label="Verification result"
            >
                <!-- Header Status -->
                <div
                    class="bg-gov-green/5 p-8 text-center border-b border-gray-100"
                >
                    <div
                        class="w-16 h-16 bg-gov-green rounded-full flex items-center justify-center text-white shadow-lg mx-auto mb-4 animate-bounce-subtle"
                    >
                        <CheckCircle2 size={32} />
                    </div>
                    <h2
                        class="text-2xl font-semibold text-gov-green tracking-tight uppercase"
                    >
                        Verified
                    </h2>
                    <div class="flex items-center justify-center gap-2 mt-2">
                        <ShieldCheck size={14} class="text-gov-green" />
                        <p
                            class="text-xs text-text-muted font-bold uppercase tracking-wide"
                        >
                            Official CEDIMS Record
                        </p>
                    </div>

                    {#if isOfflineData}
                        <div
                            class="inline-flex items-center gap-1.5 px-3 py-1 bg-gov-gold/10 text-gov-gold rounded-full text-[10px] font-semibold uppercase tracking-wide mt-4 border border-gov-gold/20"
                        >
                            <WifiOff size={10} />
                            Offline Mode Verification
                        </div>
                    {/if}
                </div>

                <div class="p-8 space-y-6">
                    <!-- Info Grid -->
                    <div class="grid grid-cols-1 gap-5">
                        <div class="flex items-start gap-4">
                            <div
                                class="p-2.5 rounded-xl bg-gray-50 text-text-muted"
                            >
                                <FileText size={20} />
                            </div>
                            <div class="flex-1 min-w-0">
                                <p
                                    class="text-[10px] text-text-muted font-semibold uppercase tracking-wide mb-1"
                                >
                                    Document Name
                                </p>
                                <p
                                    class="text-sm font-bold text-text-primary truncate"
                                >
                                    {result.file_name}
                                </p>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div class="flex items-start gap-4">
                                <div
                                    class="p-2.5 rounded-xl bg-gray-50 text-text-muted"
                                >
                                    <Clock size={20} />
                                </div>
                                <div>
                                    <p
                                        class="text-[10px] text-text-muted font-semibold uppercase tracking-wide mb-1"
                                    >
                                        Status
                                    </p>
                                    <StatusBadge
                                        status={result.compliance_status ===
                                            "on-time" ||
                                        result.compliance_status === "compliant"
                                            ? "compliant"
                                            : result.compliance_status ===
                                                "late"
                                              ? "late"
                                              : result.compliance_status ===
                                                  "supplementary"
                                                ? "supplementary"
                                                : "missing"}
                                        size="sm"
                                    />
                                </div>
                            </div>
                            <div class="flex items-start gap-4">
                                <div
                                    class="p-2.5 rounded-xl bg-gray-50 text-text-muted"
                                >
                                    <Calendar size={20} />
                                </div>
                                <div>
                                    <p
                                        class="text-[10px] text-text-muted font-semibold uppercase tracking-wide mb-1"
                                    >
                                        Upload Time
                                    </p>
                                    <p
                                        class="text-xs font-bold text-text-primary"
                                    >
                                        {formatDate(result.created_at)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div class="border-t border-gray-50 pt-5 space-y-4">
                            {#if result.teacher_name}
                                <div
                                    class="flex justify-between items-center text-sm"
                                >
                                    <span
                                        class="text-text-muted font-bold uppercase tracking-wide text-[10px]"
                                        >Submitted By</span
                                    >
                                    <span class="text-text-primary font-black"
                                        >{result.teacher_name}</span
                                    >
                                </div>
                            {/if}
                            {#if result.school_name}
                                <div
                                    class="flex justify-between items-center text-sm"
                                >
                                    <span
                                        class="text-text-muted font-bold uppercase tracking-wide text-[10px]"
                                        >Origination</span
                                    >
                                    <span class="text-text-primary font-black"
                                        >{result.school_name}</span
                                    >
                                </div>
                            {/if}
                            {#if result.doc_type}
                                <div
                                    class="flex justify-between items-center text-sm"
                                >
                                    <span
                                        class="text-text-muted font-bold uppercase tracking-wide text-[10px]"
                                        >Category</span
                                    >
                                    <span
                                        class="text-gov-blue font-black uppercase text-[10px] px-2 py-0.5 bg-gov-blue/5 rounded"
                                        >{result.doc_type}</span
                                    >
                                </div>
                            {/if}
                        </div>

                        <div
                            class="p-4 bg-surface-muted/50 rounded-md border border-gray-100"
                        >
                            <p
                                class="text-[10px] text-text-muted font-black uppercase tracking-wide mb-2"
                            >
                                Registry Hash (SHA-256)
                            </p>
                            <code
                                class="text-[11px] font-mono text-gov-blue break-all leading-relaxed block"
                                >{hash}</code
                            >
                        </div>

                        <!-- View Document Button -->
                        <div class="pt-2">
                            {#if !isLoggedIn}
                                <a
                                    href="/login"
                                    class="w-full flex items-center justify-center gap-2 py-3.5 px-6 bg-gray-100 text-text-muted font-bold text-sm uppercase tracking-wide rounded-md border border-gray-200 hover:bg-gray-200 transition-colors min-h-[48px]"
                                >
                                    <LogIn size={18} />
                                    Sign In to View Document
                                </a>
                            {:else if canAccessFile}
                                <button
                                    onclick={handleOpenDocument}
                                    disabled={openingDoc}
                                    class="w-full flex items-center justify-center gap-2 py-3.5 px-6 bg-gradient-to-r from-gov-green to-emerald-600 text-white font-bold text-sm uppercase tracking-wide rounded-md shadow-lg hover:shadow-xl active:scale-[0.98] transition-[color,background-color,border-color,transform] duration-200 ease-out min-h-[48px] disabled:opacity-60 disabled:cursor-wait"
                                >
                                    {#if openingDoc}
                                        <Loader2 size={18} class="animate-spin" />
                                        Opening Document...
                                    {:else}
                                        <Eye size={18} />
                                        View Official Document
                                    {/if}
                                </button>
                            {:else}
                                <div
                                    class="w-full flex items-center justify-center gap-2 py-3.5 px-6 bg-gray-50 text-text-muted font-bold text-[11px] uppercase tracking-wide rounded-md border border-gray-200 min-h-[48px] cursor-not-allowed"
                                >
                                    <Lock size={16} />
                                    Access Restricted — {result?.school_name ? `${result.school_name} personnel only` : 'Owner only'}
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>
            </div>
        {/if}

        <!-- Action Buttons -->
        <div class="flex flex-col gap-3 mt-6">
            <!-- Scan Another Document Button (WBS 13.4 — Continuous Mobile QR) -->
            <button
                onclick={openScanner}
                class="w-full flex items-center justify-center gap-2 py-3.5 px-6 bg-gradient-to-r from-gov-blue to-gov-blue-dark text-white font-bold text-sm uppercase tracking-wide rounded-md shadow-lg hover:shadow-xl active:scale-[0.98] transition-[color,background-color,border-color,transform] duration-200 ease-out min-h-[48px]"
                aria-label="Scan another QR code to verify a different document"
            >
                <ScanLine size={18} />
                Scan Another Document
            </button>

            <a
                href="/dashboard"
                class="block text-center text-sm text-text-muted hover:text-gov-blue transition-colors py-2"
            >
                BACK TO CEDIMS
            </a>
        </div>
    </div>
</div>
