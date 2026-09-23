<script lang="ts">
    import { ArrowUpDown, Eye, FileText, MessageSquare, X } from "lucide-svelte";
    import { supabase } from "$lib/utils/supabase";
    import { profile } from "$lib/utils/auth";
    import { addToast } from "$lib/stores/toast";
    import { getDocumentLabel } from "$lib/utils/documentLabels";

    export let items: any[] = [];
    export let title = "Review Tracker";
    export let pendingOnly = false;
    export let readOnlyRemarks = false;
    export let formatDate: (date: string) => string = (date) =>
        new Date(date).toLocaleDateString("en-PH", { month: "short", day: "numeric" });

    type FilterStatus = "all" | "forChecking" | "checked";
    type SortField = "date" | "teacher" | "type";

    let filterStatus: FilterStatus = pendingOnly ? "forChecking" : "all";
    let sortField: SortField = "date";
    let sortDir: "asc" | "desc" = "desc";
    let currentPage = 1;
    const pageSize = 5;
    let remarkTarget: any = null;
    let remarkText = "";
    let savingRemark = false;
    let openingId: string | null = null;

    $: filteredItems = items.filter((item) => {
        if (pendingOnly || filterStatus === "forChecking") return !item.reviewer_comment;
        if (filterStatus === "checked") return !!item.reviewer_comment;
        return true;
    });
    $: sortedItems = [...filteredItems].sort((a, b) => {
        let cmp = 0;
        if (sortField === "date") cmp = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        if (sortField === "teacher") cmp = (a.teacher_name || "").localeCompare(b.teacher_name || "");
        if (sortField === "type") cmp = (a.doc_type || "").localeCompare(b.doc_type || "");
        return sortDir === "asc" ? cmp : -cmp;
    });
    $: totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
    $: if (currentPage > totalPages) currentPage = totalPages;
    $: pageItems = sortedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    $: forCheckingCount = items.filter((item) => !item.reviewer_comment).length;

    function setSort(field: SortField) {
        if (sortField === field) sortDir = sortDir === "asc" ? "desc" : "asc";
        else {
            sortField = field;
            sortDir = field === "date" ? "desc" : "asc";
        }
        currentPage = 1;
    }

    async function getSignedUrl(path: string): Promise<string | null> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) return null;
            const res = await fetch("/api/storage/presign", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ key: path, intent: "download" }),
            });
            if (!res.ok) throw new Error("Failed to get preview URL");
            const { url } = await res.json();
            return url;
        } catch (err) {
            console.error("[review-tracker] preview failed", err);
            return null;
        }
    }

    async function viewDocument(item: any) {
        if (openingId) return;
        const previewWindow = window.open("about:blank", "_blank");
        openingId = item.id;
        try {
            const path = item.file_path || `${item.id}/${item.file_name}`;
            const url = await getSignedUrl(path);
            if (!url) throw new Error("No preview URL");
            if (previewWindow && !previewWindow.closed) previewWindow.location.href = url;
            else window.location.href = url;
        } catch (err) {
            previewWindow?.close();
            addToast("error", "Could not open this document.");
        } finally {
            openingId = null;
        }
    }

    function openRemark(item: any) {
        remarkTarget = item;
        remarkText = item.reviewer_comment || "";
    }

    async function saveRemark() {
        if (!remarkTarget || !remarkText.trim() || !$profile?.id) return;
        savingRemark = true;
        const { error } = await supabase.from("dll_reviews").upsert({
            submission_id: remarkTarget.id,
            reviewer_id: $profile.id,
            reviewer_comment: remarkText.trim(),
            status: "needs-check",
        }, { onConflict: "submission_id" });
        savingRemark = false;
        if (error) {
            addToast("error", "Failed to save remark: " + error.message);
            return;
        }
        remarkTarget.reviewer_comment = remarkText.trim();
        remarkTarget.reviewer_name = $profile.full_name || $profile.email || "Checker";
        addToast("success", "Remark saved");
        remarkTarget = null;
        remarkText = "";
    }
</script>

<div class="gov-card-static overflow-hidden">
    <div class="px-4 py-3 border-b border-border-subtle bg-surface-white flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-3">
            <div class="w-1.5 h-5 bg-gov-gold rounded-full"></div>
            <h3 class="text-sm font-bold text-text-primary uppercase tracking-normal">{title}</h3>
        </div>
        <p class="text-xs font-bold text-text-muted uppercase tracking-normal">{forCheckingCount} for checking</p>
    </div>

    <div class="px-4 py-3 bg-surface-muted border-b border-border-subtle">
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div class="rounded-lg bg-surface-white border border-border-subtle px-3 py-2">
                <p class="text-xs font-bold text-text-muted uppercase tracking-tight">Total</p>
                <p class="text-xl font-bold text-text-primary">{items.length}</p>
            </div>
            <div class="rounded-lg bg-surface-white border border-border-subtle px-3 py-2">
                <p class="text-xs font-bold text-gov-gold uppercase tracking-tight">For Checking</p>
                <p class="text-xl font-bold text-gov-gold">{forCheckingCount}</p>
            </div>
            <div class="rounded-lg bg-surface-white border border-border-subtle px-3 py-2">
                <p class="text-xs font-bold text-gov-green uppercase tracking-tight">Checked</p>
                <p class="text-xl font-bold text-gov-green">{Math.max(0, items.length - forCheckingCount)}</p>
            </div>
        </div>
    </div>

    <div class="px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle">
        <div class="flex items-center gap-2 flex-wrap">
            {#if !pendingOnly}
            <button onclick={() => { filterStatus = "all"; currentPage = 1; }} class="rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-normal {filterStatus === 'all' ? 'border-gov-blue bg-gov-blue text-white' : 'border-border-subtle bg-surface-muted text-text-muted'}">All</button>
            {/if}
            <button onclick={() => { filterStatus = "forChecking"; currentPage = 1; }} class="rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-normal {filterStatus === 'forChecking' ? 'border-gov-gold bg-gov-gold text-white' : 'border-border-subtle bg-surface-muted text-text-muted'}">For Checking</button>
            {#if !pendingOnly}
                <button onclick={() => { filterStatus = "checked"; currentPage = 1; }} class="rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-normal {filterStatus === 'checked' ? 'border-gov-green bg-gov-green text-white' : 'border-border-subtle bg-surface-muted text-text-muted'}">Checked</button>
            {/if}
            {#each [{ field: "date", label: "Date" }, { field: "teacher", label: "Teacher" }, { field: "type", label: "Type" }] as option}
                <button onclick={() => setSort(option.field as SortField)} class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-normal {sortField === option.field ? 'border-gov-blue bg-gov-blue/10 text-gov-blue' : 'border-border-subtle bg-surface-muted text-text-muted'}">
                    {option.label}
                    <ArrowUpDown size={12} class={sortField === option.field && sortDir === 'desc' ? 'scale-y-[-1]' : ''} />
                </button>
            {/each}
        </div>
        <p class="text-xs font-semibold text-text-muted">
            Showing {sortedItems.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, sortedItems.length)} of {sortedItems.length}
        </p>
    </div>

    {#if pageItems.length === 0}
        <div class="p-8 text-center text-text-muted">
            <p>No documents match this view.</p>
        </div>
    {:else}
        <div class="divide-y divide-border-subtle">
            {#each pageItems as item}
                <div class="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-gov-blue/5 transition-colors">
                    <div class="w-12 h-12 rounded-lg bg-gov-blue/10 text-gov-blue flex items-center justify-center">
                        <FileText size={18} />
                    </div>
                    <div class="min-w-0">
                        <p class="text-sm font-bold text-text-primary truncate" title={item.file_name}>{item.file_name}</p>
                        <p class="text-xs text-text-muted font-medium truncate">{item.teacher_name || "Unknown teacher"} · {getDocumentLabel(item.doc_type || "DLL")} · {item.subject || "Unassigned"} {item.week_number ? `· Week ${item.week_number}` : ""} · {formatDate(item.created_at)}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick={() => viewDocument(item)} disabled={openingId !== null} class="inline-flex items-center gap-1 rounded-lg bg-surface-muted px-3 py-2 text-xs font-bold text-text-primary hover:bg-gov-blue/10 hover:text-gov-blue transition-colors">
                            <Eye size={13} />
                            View
                        </button>
                        <button onclick={() => openRemark(item)} class="inline-flex items-center gap-1 rounded-lg bg-gov-blue px-3 py-2 text-xs font-bold text-white hover:bg-gov-blue-dark transition-colors">
                            <MessageSquare size={13} />
                            {readOnlyRemarks ? "Remarks" : "Remark"}
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}

    <div class="px-4 py-3 flex items-center justify-between border-t border-border-subtle bg-surface-muted">
        <button type="button" onclick={() => currentPage = Math.max(1, currentPage - 1)} disabled={currentPage <= 1} class="px-3 py-2 text-xs font-bold rounded-lg {currentPage <= 1 ? 'text-text-muted/50 cursor-not-allowed' : 'text-gov-blue hover:bg-gov-blue/10'}">Previous</button>
        <span class="text-xs font-bold text-text-muted">Page {currentPage} of {totalPages}</span>
        <button type="button" onclick={() => currentPage = Math.min(totalPages, currentPage + 1)} disabled={currentPage >= totalPages} class="px-3 py-2 text-xs font-bold rounded-lg {currentPage >= totalPages ? 'text-text-muted/50 cursor-not-allowed' : 'text-gov-blue hover:bg-gov-blue/10'}">Next</button>
    </div>
</div>

{#if remarkTarget}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onclick={() => (remarkTarget = null)}>
        <div
            class="w-full max-w-lg rounded-2xl bg-surface-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            tabindex="-1"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
        >
            <div class="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
                <div class="min-w-0">
                    <h3 class="text-lg font-bold text-text-primary">{readOnlyRemarks ? "Remarks" : "Create Remark"}</h3>
                    <p class="mt-1 truncate text-xs text-text-muted">{remarkTarget.file_name}</p>
                </div>
                <button class="rounded-lg p-2 text-text-muted hover:bg-surface-muted hover:text-text-primary" onclick={() => (remarkTarget = null)} aria-label="Close">
                    <X size={16} />
                </button>
            </div>
            <div class="p-5">
                {#if readOnlyRemarks}
                    {#if remarkTarget.reviewer_comment}
                        <div class="rounded-xl border border-gov-green/30 bg-gov-green/10 p-4">
                            <p class="text-xs font-bold uppercase tracking-normal text-gov-green">Checked</p>
                            <p class="mt-2 text-sm leading-relaxed text-text-primary">{remarkTarget.reviewer_comment}</p>
                            <p class="mt-3 text-xs font-semibold text-text-muted">Checked by {remarkTarget.reviewer_name || "Checker"}</p>
                        </div>
                    {:else}
                        <div class="rounded-xl border border-border-subtle bg-surface-muted p-4">
                            <p class="text-xs font-bold uppercase tracking-normal text-text-muted">For Checking</p>
                            <p class="mt-2 text-sm text-text-muted">No remarks have been added for this submission yet.</p>
                        </div>
                    {/if}
                    <div class="mt-4 flex justify-end">
                        <button class="rounded-lg bg-surface-muted px-4 py-2 text-sm font-semibold text-text-primary hover:bg-border-subtle" onclick={() => (remarkTarget = null)}>Close</button>
                    </div>
                {:else}
                    <textarea
                        bind:value={remarkText}
                        rows="5"
                        placeholder="Write your remark for this document..."
                        class="w-full resize-none rounded-xl border border-border-subtle bg-surface-muted p-3 text-sm outline-none focus:border-gov-blue focus:ring-2 focus:ring-gov-blue/20"
                    ></textarea>
                    <div class="mt-4 flex justify-end gap-2">
                        <button class="rounded-lg px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface-muted" onclick={() => (remarkTarget = null)}>Cancel</button>
                        <button class="rounded-lg bg-gov-blue px-5 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={!remarkText.trim() || savingRemark} onclick={saveRemark}>
                            {savingRemark ? "Saving..." : "Save Remark"}
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}
