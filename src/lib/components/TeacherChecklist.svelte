<script lang="ts">
    import { CheckCircle, XCircle, Clock, ArrowUpDown, Upload } from "lucide-svelte";
    import { goto } from "$app/navigation";
    
    // Props
    export let submissions: any[] = [];
    export let teachingLoads: any[] = [];
    export let calendarWeeks: any[] = []; // { week_number, start_date, end_date }
    export let title = "Submission Tracker";
    
    // Status type definition
    type ExpectationStatus = 'missing' | 'compliant' | 'late';
    type SortField = 'week' | 'subject' | 'status';
    type FilterStatus = 'all' | 'missing';
    
    interface Expectation {
        week: number;
        subject: string;
        status: ExpectationStatus;
        submission?: any;
        isExpected: boolean;
        dateLabel: string;
    }

    let sortField: SortField = 'week';
    let sortDir: 'asc' | 'desc' = 'asc';
    let filterStatus: FilterStatus = 'all';
    let currentPage = 1;
    const pageSize = 5;
    
    // Pre-process submissions for quick lookup
    let submissionMap = new Map<string, any>();
    $: {
        submissionMap.clear();
        submissions.forEach(sub => {
            const week = sub.week_number;
            const tl = Array.isArray(sub.teaching_loads) ? sub.teaching_loads[0] : sub.teaching_loads;
            const subject = tl?.subject || sub.subject || "Unknown";
            
            const key = `${week}_${subject}`;
            if (!submissionMap.has(key)) {
                submissionMap.set(key, sub);
            }
        });
    }
    
    // Get unique subjects from teaching loads
    $: subjects = teachingLoads.map(load => load.subject);
    $: uniqueSubjects = [...new Set(subjects)];
    
    // Calculate expectations based on weeks Ã— teaching loads
    $: expectations = calendarWeeks.flatMap(week => 
        uniqueSubjects.map(subject => {
            const submission = submissionMap.get(`${week.week_number}_${subject}`);
            
            let status: ExpectationStatus = 'missing';
            
            if (submission) {
                const complianceStatus = (submission.compliance_status || 'compliant').toLowerCase();
                if (complianceStatus === 'late') {
                    status = 'late';
                } else {
                    status = 'compliant';
                }
            } else {
                // No submission = missing expectation
                status = 'missing';
            }
            
            return {
                week: week.week_number,
                subject,
                status,
                submission,
                isExpected: true,
                dateLabel: week.start_date && week.end_date
                    ? `${new Date(week.start_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} - ${new Date(week.end_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`
                    : ''
            } as Expectation;
        })
    );

    const statusOrder: Record<ExpectationStatus, number> = {
        missing: 0,
        late: 1,
        compliant: 2,
    };

    $: filteredExpectations = expectations.filter((item) =>
        filterStatus === 'missing' ? item.status === 'missing' : true,
    );

    $: sortedExpectations = [...filteredExpectations].sort((a, b) => {
        let cmp = 0;
        if (sortField === 'week') cmp = a.week - b.week || a.subject.localeCompare(b.subject);
        if (sortField === 'subject') cmp = a.subject.localeCompare(b.subject) || a.week - b.week;
        if (sortField === 'status') cmp = statusOrder[a.status] - statusOrder[b.status] || a.week - b.week;
        return sortDir === 'asc' ? cmp : -cmp;
    });

    $: totalPages = Math.max(1, Math.ceil(sortedExpectations.length / pageSize));
    $: if (currentPage > totalPages) currentPage = totalPages;
    $: paginatedExpectations = sortedExpectations.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    
    // Calculate summary statistics
    $: statistics = {
        total: expectations.length,
        compliant: expectations.filter(e => e.status === 'compliant').length,
        late: expectations.filter(e => e.status === 'late').length,
        missing: expectations.filter(e => e.status === 'missing').length,
    };
    
    $: complianceRate = statistics.total > 0 
        ? Math.round((statistics.compliant / statistics.total) * 100)
        : 0;
    
    function setSort(field: SortField) {
        if (sortField === field) {
            sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            sortField = field;
            sortDir = field === 'status' ? 'asc' : 'asc';
        }
        currentPage = 1;
    }

    function setFilter(status: FilterStatus) {
        filterStatus = status;
        currentPage = 1;
    }
    
    function getStatusColor(status: ExpectationStatus): string {
        const colors: Record<ExpectationStatus, string> = {
            'compliant': 'bg-gov-green/10 border-gov-green/30 text-gov-green',
            'late': 'bg-gov-gold/10 border-gov-gold/30 text-gov-gold-dark',
            'missing': 'bg-gov-red/10 border-gov-red/30 text-gov-red',
        };
        return colors[status] || colors['missing'];
    }
    
    function getStatusLabel(status: ExpectationStatus): string {
        const labels: Record<ExpectationStatus, string> = {
            'compliant': 'Compliant',
            'late': 'Late',
            'missing': 'Missing',
        };
        return labels[status];
    }
    
    function getStatusIcon(status: ExpectationStatus) {
        const icons: Record<ExpectationStatus, any> = {
            'compliant': CheckCircle,
            'late': Clock,
            'missing': XCircle,
        };
        return icons[status];
    }
    
    function getBadgeType(status: ExpectationStatus): 'compliant' | 'late' | 'missing' {
        const mapping: Record<ExpectationStatus, 'compliant' | 'late' | 'missing'> = {
            'compliant': 'compliant',
            'late': 'late',
            'missing': 'missing',
        };
        return mapping[status];
    }
</script>
<div class="gov-card-static overflow-hidden">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-border-subtle bg-surface-white flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-3">
            <div class="w-1.5 h-5 bg-gov-blue rounded-full"></div>
            <h3 class="text-sm font-bold text-text-primary uppercase tracking-normal">
                {title}
            </h3>
        </div>
        <div class="flex gap-3 text-xs font-medium text-text-muted flex-wrap">
            <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-gov-green"></span> Compliant
            </div>
            <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-gov-gold"></span> Late
            </div>
            <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-gov-red"></span> Missing
            </div>
        </div>
    </div>

    <!-- Summary Statistics -->
    {#if statistics.total > 0}
        <div class="px-4 py-3 bg-surface-muted border-b border-border-subtle">
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div class="rounded-lg bg-surface-white border border-border-subtle px-3 py-2">
                    <p class="text-xs font-bold text-text-muted uppercase tracking-tight">Total Expected</p>
                    <p class="text-xl font-bold text-text-primary">{statistics.total}</p>
                </div>
                <div class="rounded-lg bg-surface-white border border-border-subtle px-3 py-2">
                    <p class="text-xs font-bold text-gov-green uppercase tracking-tight">Compliant</p>
                    <p class="text-xl font-bold text-gov-green">{statistics.compliant}</p>
                </div>
                <div class="rounded-lg bg-surface-white border border-border-subtle px-3 py-2">
                    <p class="text-xs font-bold text-gov-gold uppercase tracking-tight">Late</p>
                    <p class="text-xl font-bold text-gov-gold">{statistics.late}</p>
                </div>
                <div class="rounded-lg bg-surface-white border border-border-subtle px-3 py-2">
                    <p class="text-xs font-bold text-gov-red uppercase tracking-tight">Missing</p>
                    <p class="text-xl font-bold text-gov-red">{statistics.missing}</p>
                </div>
                <div class="rounded-lg bg-surface-white border border-border-subtle px-3 py-2">
                    <p class="text-xs font-bold text-text-muted uppercase tracking-tight">Compliance Rate</p>
                    <p class="text-xl font-bold {complianceRate >= 80 ? 'text-gov-green' : complianceRate >= 50 ? 'text-gov-gold' : 'text-gov-red'}">{complianceRate}%</p>
                </div>
            </div>
        </div>
    {/if}

    {#if calendarWeeks.length === 0 || uniqueSubjects.length === 0}
        <div class="p-8 text-center text-text-muted">
            <p>No active schedule or teaching loads found.</p>
        </div>
    {:else}
        <div class="px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle">
            <div class="flex items-center gap-2 flex-wrap">
                <button
                    type="button"
                    onclick={() => setFilter('all')}
                    class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-normal transition-colors {filterStatus === 'all' ? 'border-gov-blue bg-gov-blue text-white' : 'border-border-subtle bg-surface-muted text-text-muted hover:text-text-primary'}"
                >
                    All
                </button>
                <button
                    type="button"
                    onclick={() => setFilter('missing')}
                    class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-normal transition-colors {filterStatus === 'missing' ? 'border-gov-red bg-gov-red text-white' : 'border-border-subtle bg-surface-muted text-text-muted hover:text-gov-red'}"
                >
                    Missing
                </button>
                {#each [
                    { field: 'week', label: 'Week' },
                    { field: 'subject', label: 'Subject' },
                    { field: 'status', label: 'Status' }
                ] as option}
                    <button
                        type="button"
                        onclick={() => setSort(option.field as SortField)}
                        class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-normal transition-colors {sortField === option.field ? 'border-gov-blue bg-gov-blue/10 text-gov-blue' : 'border-border-subtle bg-surface-muted text-text-muted hover:text-text-primary'}"
                    >
                        {option.label}
                        <ArrowUpDown size={12} class={sortField === option.field && sortDir === 'desc' ? 'scale-y-[-1]' : ''} />
                    </button>
                {/each}
            </div>
            <p class="text-xs font-semibold text-text-muted">
                Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, sortedExpectations.length)} of {sortedExpectations.length}
            </p>
        </div>

        <div class="divide-y divide-border-subtle">
            {#each paginatedExpectations as item}
                {@const Icon = getStatusIcon(item.status)}
                <div class="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-gov-blue/5 transition-colors">
                    <div class="w-12 text-center rounded-lg bg-surface-muted border border-border-subtle px-2 py-1">
                        <p class="text-xs font-bold text-text-muted uppercase">Week</p>
                        <p class="text-sm font-bold text-text-primary">{item.week}</p>
                    </div>
                    <div class="min-w-0">
                        <p class="text-sm font-bold text-text-primary truncate" title={item.subject}>{item.subject}</p>
                        {#if item.dateLabel}
                            <p class="text-xs text-text-muted font-medium">{item.dateLabel}</p>
                        {/if}
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full border {getStatusColor(item.status)} whitespace-nowrap">
                            <Icon size={12} strokeWidth={2.5} />
                            <span class="text-xs font-bold uppercase tracking-normal">{getStatusLabel(item.status)}</span>
                        </div>
                        {#if item.status === 'missing'}
                            <button
                                type="button"
                                onclick={() => goto('/dashboard/upload')}
                                class="inline-flex items-center gap-1 rounded-lg bg-gov-blue px-2.5 py-1.5 text-xs font-bold text-white hover:bg-gov-blue-dark transition-colors"
                            >
                                <Upload size={12} />
                                Upload
                            </button>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>

        <div class="px-4 py-3 flex items-center justify-between border-t border-border-subtle bg-surface-muted">
                <button
                    type="button"
                    onclick={() => currentPage = Math.max(1, currentPage - 1)}
                    disabled={currentPage <= 1}
                    class="px-3 py-2 text-xs font-bold rounded-lg {currentPage <= 1 ? 'text-text-muted/50' : 'text-gov-blue hover:bg-gov-blue/10'}"
                >
                    Previous
                </button>
                <span class="text-xs font-bold text-text-muted">Page {currentPage} of {totalPages}</span>
                <button
                    type="button"
                    onclick={() => currentPage = Math.min(totalPages, currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    class="px-3 py-2 text-xs font-bold rounded-lg {currentPage >= totalPages ? 'text-text-muted/50' : 'text-gov-blue hover:bg-gov-blue/10'}"
                >
                    Next
                </button>
        </div>
    {/if}
</div>
