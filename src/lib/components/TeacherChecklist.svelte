<script lang="ts">
    import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-svelte";
    import StatusBadge from "$lib/components/StatusBadge.svelte";
    import { getWeekNumber } from "$lib/utils/useDashboardData";
    
    // Props
    export let submissions: any[] = [];
    export let teachingLoads: any[] = [];
    export let calendarWeeks: any[] = []; // { week_number, start_date, end_date }
    
    // Status type definition
    type ExpectationStatus = 'missing' | 'compliant' | 'late';
    
    interface Expectation {
        week: number;
        subject: string;
        status: ExpectationStatus;
        submission?: any;
        isExpected: boolean;
    }
    
    // Pre-process submissions for quick lookup
    let submissionMap = new Map<string, any>();
    $: {
        submissionMap.clear();
        submissions.forEach(sub => {
            const week = sub.week_number;
            const tl = Array.isArray(sub.teaching_loads) ? sub.teaching_loads[0] : sub.teaching_loads;
            const subject = tl?.subject || "Unknown";
            
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
                isExpected: true
            } as Expectation;
        })
    );
    
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
    
    function getExpectationStatus(week: number, subject: string): ExpectationStatus {
        const expectation = expectations.find(e => e.week === week && e.subject === subject);
        return expectation?.status || 'missing';
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
    <div class="px-6 py-5 border-b border-border-subtle bg-surface-white flex items-center justify-between flex-wrap gap-4">
        <div class="flex items-center gap-3">
            <div class="w-1.5 h-6 bg-gov-blue rounded-full"></div>
            <h3 class="text-sm font-bold text-text-primary uppercase tracking-wide">
                Requirements Checklist
            </h3>
        </div>
        <div class="flex gap-4 text-xs font-medium text-text-muted flex-wrap">
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
        <div class="px-6 py-5 bg-surface-muted border-b border-border-subtle">
            <div class="grid grid-cols-5 gap-4">
                <div>
                    <p class="text-[10px] font-bold text-text-muted uppercase tracking-tight">Total Expected</p>
                    <p class="text-2xl font-bold text-text-primary mt-1">{statistics.total}</p>
                </div>
                <div>
                    <p class="text-[10px] font-bold text-gov-green uppercase tracking-tight">Compliant</p>
                    <p class="text-2xl font-bold text-gov-green mt-1">{statistics.compliant}</p>
                </div>
                <div>
                    <p class="text-[10px] font-bold text-gov-gold uppercase tracking-tight">Late</p>
                    <p class="text-2xl font-bold text-gov-gold mt-1">{statistics.late}</p>
                </div>
                <div>
                    <p class="text-[10px] font-bold text-gov-red uppercase tracking-tight">Missing</p>
                    <p class="text-2xl font-bold text-gov-red mt-1">{statistics.missing}</p>
                </div>
                <div>
                    <p class="text-[10px] font-bold text-text-muted uppercase tracking-tight">Compliance Rate</p>
                    <p class="text-2xl font-bold {complianceRate >= 80 ? 'text-gov-green' : complianceRate >= 50 ? 'text-gov-gold' : 'text-gov-red'} mt-1">{complianceRate}%</p>
                </div>
            </div>
        </div>
    {/if}

    <!-- Table -->
    <div class="max-h-[65vh] overflow-y-auto overflow-x-auto custom-scrollbar">
        {#if calendarWeeks.length === 0 || uniqueSubjects.length === 0}
            <div class="p-8 text-center text-text-muted">
                <p>No active schedule or teaching loads found.</p>
            </div>
        {:else}
            <!-- The only one of the app's 7 tables missing this wrapper — a
                 sticky-left timeline column plus one min-w-[110px] column per
                 subject has no ceiling on total width, and had no scroll
                 mechanism at all below that width. -->
            <div class="overflow-x-auto cedims-scroll">
            <table class="w-full text-left border-collapse text-sm">
                <thead>
                    <tr class="bg-surface-muted border-b border-border-subtle">
                        <th class="py-2 px-3 text-[10px] font-bold text-text-muted uppercase tracking-widest sticky left-0 bg-surface-muted backdrop-blur-sm z-20 min-w-[120px] border-r border-border-subtle">
                            Timeline
                        </th>
                        {#each uniqueSubjects as subject}
                            <th class="py-2 px-3 text-[10px] font-bold text-text-muted uppercase tracking-widest text-center min-w-[110px]">
                                <div class="truncate max-w-[160px] mx-auto" title={subject}>
                                    {subject}
                                </div>
                            </th>
                        {/each}
                    </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle">
                    {#each calendarWeeks as week}
                        <tr class="hover:bg-gov-blue/5 transition-colors group">
                            <td class="py-2 px-3 sticky left-0 bg-surface-white border-r border-border-subtle z-10 group-hover:bg-gov-blue/5 transition-colors">
                                <div class="flex flex-col">
                                    <span class="font-bold text-xs text-text-primary">Week {week.week_number}</span>
                                    {#if week.start_date && week.end_date}
                                        <span class="text-[9px] text-text-muted font-medium mt-0.5 whitespace-nowrap">
                                            {new Date(week.start_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} - {new Date(week.end_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                        </span>
                                    {/if}
                                </div>
                            </td>
                            {#each uniqueSubjects as subject}
                                {@const status = getExpectationStatus(week.week_number, subject)}
                                {@const Icon = getStatusIcon(status)}
                                <td class="p-2 text-center border-l border-border-subtle/30 first:border-l-0 align-middle">
                                    <div class="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full border {getStatusColor(status)} shadow-[0_1px_2px_rgba(0,0,0,0.02)] whitespace-nowrap transition-transform hover:scale-105 cursor-default">
                                        <Icon size={12} strokeWidth={2.5} />
                                        <span class="text-[9px] font-bold uppercase tracking-widest">
                                            {getStatusLabel(status)}
                                        </span>
                                    </div>
                                </td>
                            {/each}
                        </tr>
                    {/each}
                </tbody>
            </table>
            </div>
        {/if}
    </div>

    <!-- Legend & Notes -->
    <div class="px-6 py-4 bg-surface-muted border-t border-border-subtle text-[10px] text-text-muted space-y-2">
        <p><strong>Compliant:</strong> Submitted on time</p>
        <p><strong>Late:</strong> Submitted after the deadline</p>
        <p><strong>Missing:</strong> No submission recorded for this week and subject</p>
    </div>
</div>
