<script lang="ts">
    import { ChevronUp, ChevronDown, Search } from "lucide-svelte";
    import StatusBadge from "./StatusBadge.svelte";

    interface Submission {
        id: string;
        file_name: string;
        doc_type: string;
        compliance_status: string;
        created_at: string;
        week_number?: number;
        [key: string]: any;
    }

    interface Props {
        submissions: Submission[];
        title?: string;
        onRowClick?: (submission: Submission) => void;
        sortField?: string;
        sortDir?: 'asc' | 'desc';
        onSortChange?: (field: string) => void;
        searchQuery?: string;
        onSearchChange?: (query: string) => void;
        itemsPerPage?: number;
    }

    let {
        submissions = [],
        title = 'Submissions',
        onRowClick,
        sortField = 'created_at',
        sortDir = 'desc',
        onSortChange,
        searchQuery = '',
        onSearchChange,
        itemsPerPage = 10
    } = $props<Props>();

    let currentPage = $state(1);

    const filteredSubmissions = $derived.by(() => {
        let filtered = [...submissions];

        // Search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(s =>
                s.file_name.toLowerCase().includes(query) ||
                s.doc_type.toLowerCase().includes(query)
            );
        }

        // Sorting
        filtered.sort((a, b) => {
            let aVal = a[sortField];
            let bVal = b[sortField];

            if (aVal === null) aVal = '';
            if (bVal === null) bVal = '';

            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = (bVal as string).toLowerCase();
            }

            const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            return sortDir === 'asc' ? comparison : -comparison;
        });

        return filtered;
    });

    const paginatedSubmissions = $derived(
        filteredSubmissions.slice(
            (currentPage - 1) * itemsPerPage,
            currentPage * itemsPerPage
        )
    );

    const totalPages = $derived(Math.ceil(filteredSubmissions.length / itemsPerPage));

    function handleSort(field: string) {
        if (sortField === field) {
            sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            sortField = field;
            sortDir = 'desc';
        }
        onSortChange?.(field);
    }

    function formatDate(dateStr: string): string {
        return new Date(dateStr).toLocaleDateString('en-PH', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
</script>

<div class="gov-card-static p-6 space-y-4">
    <div class="flex items-center justify-between gap-4">
        <h3 class="text-lg font-bold text-text-primary">{title}</h3>
        <div class="relative flex-1 max-w-xs">
            <Search size={16} class="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted" />
            <input
                type="text"
                placeholder="Search submissions..."
                value={searchQuery}
                onchange={(e) => {
                    onSearchChange?.(e.currentTarget.value);
                    currentPage = 1;
                }}
                class="w-full pl-10 pr-4 py-2 border border-border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gov-blue/30"
            />
        </div>
    </div>

    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead>
                <tr class="border-b border-border-subtle">
                    <th class="text-left py-3 px-4 font-semibold text-text-secondary uppercase tracking-wide text-xs">
                        <button
                            onclick={() => handleSort('file_name')}
                            class="flex items-center gap-2 hover:text-text-primary transition-colors"
                        >
                            File Name
                            {#if sortField === 'file_name'}
                                {#if sortDir === 'asc'}
                                    <ChevronUp size={14} />
                                {:else}
                                    <ChevronDown size={14} />
                                {/if}
                            {/if}
                        </button>
                    </th>
                    <th class="text-left py-3 px-4 font-semibold text-text-secondary uppercase tracking-wide text-xs">
                        <button
                            onclick={() => handleSort('doc_type')}
                            class="flex items-center gap-2 hover:text-text-primary transition-colors"
                        >
                            Type
                            {#if sortField === 'doc_type'}
                                {#if sortDir === 'asc'}
                                    <ChevronUp size={14} />
                                {:else}
                                    <ChevronDown size={14} />
                                {/if}
                            {/if}
                        </button>
                    </th>
                    <th class="text-left py-3 px-4 font-semibold text-text-secondary uppercase tracking-wide text-xs">
                        <button
                            onclick={() => handleSort('compliance_status')}
                            class="flex items-center gap-2 hover:text-text-primary transition-colors"
                        >
                            Status
                            {#if sortField === 'compliance_status'}
                                {#if sortDir === 'asc'}
                                    <ChevronUp size={14} />
                                {:else}
                                    <ChevronDown size={14} />
                                {/if}
                            {/if}
                        </button>
                    </th>
                    <th class="text-left py-3 px-4 font-semibold text-text-secondary uppercase tracking-wide text-xs">
                        <button
                            onclick={() => handleSort('created_at')}
                            class="flex items-center gap-2 hover:text-text-primary transition-colors"
                        >
                            Date
                            {#if sortField === 'created_at'}
                                {#if sortDir === 'asc'}
                                    <ChevronUp size={14} />
                                {:else}
                                    <ChevronDown size={14} />
                                {/if}
                            {/if}
                        </button>
                    </th>
                </tr>
            </thead>
            <tbody>
                {#each paginatedSubmissions as submission (submission.id)}
                    <tr
                        class="border-b border-border-subtle hover:bg-surface-muted/50 transition-colors {onRowClick ? 'cursor-pointer' : ''}"
                        onclick={() => onRowClick?.(submission)}
                    >
                        <td class="py-4 px-4">
                            <p class="font-medium text-text-primary truncate">{submission.file_name}</p>
                            {#if submission.week_number}
                                <p class="text-xs text-text-muted">Week {submission.week_number}</p>
                            {/if}
                        </td>
                        <td class="py-4 px-4">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gov-blue/10 text-gov-blue">
                                {submission.doc_type}
                            </span>
                        </td>
                        <td class="py-4 px-4">
                            <StatusBadge status={submission.compliance_status} />
                        </td>
                        <td class="py-4 px-4 text-text-secondary text-xs">
                            {formatDate(submission.created_at)}
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>

    {#if filteredSubmissions.length === 0}
        <div class="text-center py-8">
            <p class="text-text-muted">No submissions found</p>
        </div>
    {/if}

    {#if totalPages > 1}
        <div class="flex items-center justify-between mt-6">
            <p class="text-sm text-text-muted">
                Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredSubmissions.length)} of {filteredSubmissions.length}
            </p>
            <div class="flex items-center gap-2">
                <button
                    onclick={() => currentPage = Math.max(1, currentPage - 1)}
                    disabled={currentPage === 1}
                    class="px-3 py-2 text-sm font-semibold rounded-lg border border-border-subtle hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    Previous
                </button>
                <span class="px-3 py-2 text-sm font-semibold text-gov-blue bg-gov-blue/5 rounded-lg">
                    {currentPage} / {totalPages}
                </span>
                <button
                    onclick={() => currentPage = Math.min(totalPages, currentPage + 1)}
                    disabled={currentPage === totalPages}
                    class="px-3 py-2 text-sm font-semibold rounded-lg border border-border-subtle hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    Next
                </button>
            </div>
        </div>
    {/if}
</div>
