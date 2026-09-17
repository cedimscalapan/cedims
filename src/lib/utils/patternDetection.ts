import { normalizeComplianceStatus } from './useDashboardData';

export interface PatternAlert {
    user_id: string;
    full_name: string;
    school_id: string;
    school_name: string;
    pattern_type: 'consecutive_late_missing' | 'high_non_compliance' | 'bulk_submission';
    severity: 'high' | 'medium' | 'low';
    details: string;
    weeks: number[];
    count: number;
}

/**
 * Enhanced Integrity Guard — AI Feature 4
 * Detects trends, anomalies, and integrity concerns in teacher submissions.
 * 
 * Pattern Types:
 * - consecutive_late_missing: 3+ consecutive weeks with late/missing/non-compliant
 * - high_non_compliance: Teacher has >60% non-compliant across all submissions
 * - bulk_submission: 3+ uploads within 10 minutes (suspicious batch behavior)
 */
export function detectPatterns(
    submissions: any[],
    calendar: any[],
    teachers: any[] = []
): PatternAlert[] {
    const alerts: PatternAlert[] = [];

    // Sort weeks descending (newest first)
    const sortedWeeks = [...calendar].sort((a, b) => b.week_number - a.week_number);
    if (sortedWeeks.length === 0 && teachers.length === 0) return [];

    const recentWeeks = sortedWeeks.slice(0, 5).map(w => w.week_number);

    // Group submissions by teacher
    const teacherMap = new Map<string, any[]>();
    submissions.forEach(s => {
        const uid = s.user_id;
        if (!teacherMap.has(uid)) teacherMap.set(uid, []);
        teacherMap.get(uid)!.push(s);
    });

    // Check each teacher
    teachers.forEach(teacher => {
        const userSubs = teacherMap.get(teacher.id) || [];
        const teacherInfo = {
            user_id: teacher.id,
            full_name: teacher.full_name,
            school_id: teacher.school_id,
            school_name: teacher.schools?.name || 'Unknown School'
        };

        // ── Pattern 1: Consecutive Late/Missing (Original) ──
        let consecutiveCount = 0;
        const failedWeeks: number[] = [];

        for (const weekNum of recentWeeks) {
            const weekSubs = userSubs.filter(s => s.week_number === weekNum);
            const isProblematic = weekSubs.length === 0 ||
                weekSubs.some(s => {
                    const status = normalizeComplianceStatus(s.compliance_status);
                    return status === 'late' || status === 'missing';
                });

            if (isProblematic) {
                consecutiveCount++;
                failedWeeks.push(weekNum);
            } else {
                break;
            }
        }

        if (consecutiveCount >= 3) {
            alerts.push({
                ...teacherInfo,
                pattern_type: 'consecutive_late_missing',
                severity: consecutiveCount >= 4 ? 'high' : 'medium',
                details: `${teacher.full_name} has problematic submissions for ${consecutiveCount} consecutive weeks.`,
                weeks: [...failedWeeks].reverse(),
                count: consecutiveCount
            });
        }

        // ── Pattern 2: High Non-Compliance Rate ──
        if (userSubs.length >= 5) {
            const nonCompliantCount = userSubs.filter(s => {
                const status = normalizeComplianceStatus(s.compliance_status);
                return status === 'missing';
            }).length;
            const rate = nonCompliantCount / userSubs.length;

            if (rate > 0.6) {
                alerts.push({
                    ...teacherInfo,
                    pattern_type: 'high_non_compliance',
                    severity: rate > 0.8 ? 'high' : 'medium',
                    details: `${teacher.full_name} has a ${Math.round(rate * 100)}% non-compliance rate across ${userSubs.length} submissions.`,
                    weeks: [],
                    count: nonCompliantCount
                });
            }
        }

        // ── Pattern 4: Bulk Submission Detection ──
        if (userSubs.length >= 3) {
            const sorted = [...userSubs]
                .filter(s => s.created_at)
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

            for (let i = 0; i <= sorted.length - 3; i++) {
                const window = sorted.slice(i, i + 3);
                const startTime = new Date(window[0].created_at).getTime();
                const endTime = new Date(window[window.length - 1].created_at).getTime();
                const diffMinutes = (endTime - startTime) / (1000 * 60);

                if (diffMinutes <= 10 && diffMinutes >= 0) {
                    const weekSet = new Set(window.map(s => s.week_number).filter(Boolean));
                    // Only flag if uploads span multiple different weeks (suspicious backfill)
                    if (weekSet.size >= 2) {
                        alerts.push({
                            ...teacherInfo,
                            pattern_type: 'bulk_submission',
                            severity: weekSet.size >= 3 ? 'high' : 'medium',
                            details: `${teacher.full_name} uploaded ${window.length} documents for ${weekSet.size} different weeks within ${Math.round(diffMinutes)} minutes.`,
                            weeks: Array.from(weekSet) as number[],
                            count: window.length
                        });
                        break; // Only report once per teacher
                    }
                }
            }
        }
    });

    return alerts.sort((a, b) => {
        const severityMap = { high: 3, medium: 2, low: 1 };
        return severityMap[b.severity] - severityMap[a.severity];
    });
}
