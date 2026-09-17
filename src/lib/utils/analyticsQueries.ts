import { supabase } from '$lib/utils/supabase';
import { calculateCompliance } from '$lib/utils/useDashboardData';

/**
 * ANALYTICS DATA QUERIES
 * Used by School Head and District Supervisor
 */

// ===========================
// SCHOOL HEAD ANALYTICS
// ===========================

export async function getSchoolHeadAnalytics(schoolId: string, districtId: string) {
    // NOTE: every query below embeds `profiles!inner(...)` (not the plain
    // `profiles(...)` left-join form) so that `.eq('profiles.school_id', ...)`
    // actually restricts the top-level `submissions` rows returned. Without
    // `!inner`, PostgREST treats it as a left join and the school_id filter
    // does not narrow the result set — every query here previously returned
    // submissions from every school in the system instead of just this one.
    const [complianceTrend, teacherPerformance, atRiskTeachers, rosterProfiles, rosterLoads] = await Promise.all([
        // Compliance trend over last 12 weeks
        supabase
            .from('submissions')
            .select(`
                id,
                created_at,
                compliance_status,
                doc_type,
                week_number,
                teaching_load_id,
                profiles!inner(school_id)
            `)
            .eq('profiles.school_id', schoolId)
            .order('created_at', { ascending: true })
            .limit(500),

        // Teacher performance metrics (week_number + teaching_load_id are
        // required for calculateCompliance's slot-dedup — see
        // getPerformanceDistribution below)
        supabase
            .from('submissions')
            .select(`
                user_id,
                compliance_status,
                doc_type,
                created_at,
                week_number,
                teaching_load_id,
                profiles!inner(full_name, role, school_id)
            `)
            .eq('profiles.school_id', schoolId)
            .order('created_at', { ascending: false })
            .limit(300),

        // Teachers below compliance threshold (< 70%)
        supabase
            .from('submissions')
            .select(`
                user_id,
                compliance_status,
                profiles!inner(full_name, role, avatar_url, school_id)
            `)
            .eq('profiles.school_id', schoolId)
            .order('user_id')
            .limit(300),

        // Full teacher/master-teacher roster for this school, so an entity
        // with zero submissions still shows up (at 0%) instead of being
        // silently absent from clustering/rankings/at-risk.
        supabase
            .from('profiles')
            .select('id, full_name')
            .eq('school_id', schoolId)
            .in('role', ['Teacher', 'Master Teacher']),

        // Active teaching load counts per teacher, for the expected-total
        // denominator in getPerformanceDistribution
        supabase
            .from('teaching_loads')
            .select('id, user_id, profiles!inner(school_id)')
            .eq('profiles.school_id', schoolId)
    ]);

    const loadCountByUser = new Map<string, number>();
    for (const l of (rosterLoads.data || []) as any[]) {
        loadCountByUser.set(l.user_id, (loadCountByUser.get(l.user_id) || 0) + 1);
    }
    const roster = (rosterProfiles.data || []).map((p: any) => ({
        id: p.id,
        name: p.full_name,
        loadCount: loadCountByUser.get(p.id) || 0
    }));

    return {
        complianceTrend: complianceTrend.data || [],
        teacherPerformance: teacherPerformance.data || [],
        atRiskTeachers: atRiskTeachers.data || [],
        roster
    };
}

// ===========================
// DISTRICT SUPERVISOR ANALYTICS
// ===========================

export async function getDistrictSupervisorAnalytics(districtId: string) {
    // See the !inner note in getSchoolHeadAnalytics above — same fix applies
    // here, scoped to district_id instead of school_id.
    const [complianceTrend, schoolPerformance, teacherDistribution, alertData, rosterProfiles, rosterLoads] = await Promise.all([
        // District compliance trend
        supabase
            .from('submissions')
            .select(`
                id,
                created_at,
                compliance_status,
                doc_type,
                week_number,
                teaching_load_id,
                profiles!inner(district_id, schools(name))
            `)
            .eq('profiles.district_id', districtId)
            .order('created_at', { ascending: true })
            .limit(1000),

        // School performance metrics
        supabase
            .from('submissions')
            .select(`
                compliance_status,
                profiles!inner(district_id, school_id, schools(name))
            `)
            .eq('profiles.district_id', districtId)
            .limit(1000),

        // Teacher performance distribution (for k-means clustering).
        // week_number + teaching_load_id are required for
        // calculateCompliance's slot-dedup — see getPerformanceDistribution.
        supabase
            .from('submissions')
            .select(`
                user_id,
                compliance_status,
                doc_type,
                created_at,
                week_number,
                teaching_load_id,
                profiles!inner(full_name, district_id, school_id, schools(name))
            `)
            .eq('profiles.district_id', districtId)
            .order('user_id')
            .limit(500),

        // Critical alerts
        supabase
            .from('submissions')
            .select(`
                id,
                compliance_status,
                created_at,
                profiles!inner(full_name, district_id, schools(name))
            `)
            .eq('profiles.district_id', districtId)
            .in('compliance_status', ['late', 'missing'])
            .order('created_at', { ascending: false })
            .limit(100),

        // Full teacher/master-teacher roster across the district, so an
        // entity with zero submissions still shows up (at 0%) instead of
        // being silently absent from clustering/rankings/at-risk.
        supabase
            .from('profiles')
            .select('id, full_name')
            .eq('district_id', districtId)
            .in('role', ['Teacher', 'Master Teacher']),

        // Active teaching load counts per teacher, for the expected-total
        // denominator in getPerformanceDistribution
        supabase
            .from('teaching_loads')
            .select('id, user_id, profiles!inner(district_id)')
            .eq('profiles.district_id', districtId)
    ]);

    const loadCountByUser = new Map<string, number>();
    for (const l of (rosterLoads.data || []) as any[]) {
        loadCountByUser.set(l.user_id, (loadCountByUser.get(l.user_id) || 0) + 1);
    }
    const roster = (rosterProfiles.data || []).map((p: any) => ({
        id: p.id,
        name: p.full_name,
        loadCount: loadCountByUser.get(p.id) || 0
    }));

    return {
        complianceTrend: complianceTrend.data || [],
        schoolPerformance: schoolPerformance.data || [],
        teacherDistribution: teacherDistribution.data || [],
        alerts: alertData.data || [],
        roster
    };
}

// ===========================
// DATA ANALYSIS & PROCESSING
// ===========================

/**
 * Calculate compliance metrics for a dataset
 */
export function calculateComplianceMetrics(submissions: any[]) {
    if (submissions.length === 0) return { compliant: 0, late: 0, missing: 0, rate: 0, total: 0 };

    const compliant = submissions.filter(s => s.compliance_status === 'compliant').length;
    const late = submissions.filter(s => s.compliance_status === 'late').length;
    const missing = submissions.filter(s => s.compliance_status === 'missing').length;
    const total = submissions.length;

    return {
        compliant,
        late,
        missing,
        total,
        rate: Math.round((compliant / total) * 100)
    };
}

/**
 * Generate compliance trend over time (by week or month)
 */
export function generateComplianceTrend(submissions: any[], granularity: 'week' | 'month' = 'week') {
    const trendMap = new Map<string, { compliant: number; late: number; missing: number; total: number }>();

    submissions.forEach(sub => {
        const date = new Date(sub.created_at);
        let key: string;

        if (granularity === 'week') {
            const weekNum = Math.ceil((date.getDate() - date.getDay()) / 7);
            const month = String(date.getMonth() + 1).padStart(2, '0');
            key = `W${weekNum}-${month}`;
        } else {
            const month = date.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });
            key = month;
        }

        if (!trendMap.has(key)) {
            trendMap.set(key, { compliant: 0, late: 0, missing: 0, total: 0 });
        }

        const stats = trendMap.get(key)!;
        stats.total += 1;

        if (sub.compliance_status === 'compliant') stats.compliant += 1;
        else if (sub.compliance_status === 'late') stats.late += 1;
        else if (sub.compliance_status === 'missing') stats.missing += 1;
    });

    return Array.from(trendMap.entries()).map(([key, stats]) => ({
        period: key,
        ...stats,
        rate: Math.round((stats.compliant / stats.total) * 100)
    }));
}

/**
 * Performance distribution for k-means clustering
 * Calculates compliance rate and submission frequency for each teacher/school.
 *
 * `roster` + `definedWeeks` give each entity its true expected total
 * (loadCount * definedWeeks), so the rate is computed the same
 * capped, expected-total-based way as the rest of the app (via
 * calculateCompliance) instead of compliant/submitted-only — and an entity
 * with zero submissions still gets an entry instead of being silently
 * absent from clustering/rankings/at-risk.
 */
export function getPerformanceDistribution(
    submissions: any[],
    groupBy: 'teacher' | 'school' = 'teacher',
    roster: { id: string; name: string; loadCount: number }[] = [],
    definedWeeks: number = 0
) {
    const idOf = (sub: any) => groupBy === 'teacher' ? sub.user_id : sub.profiles?.school_id;
    const nameOf = (sub: any) => groupBy === 'teacher' ?
        (sub.profiles?.full_name || 'Unknown') :
        (sub.profiles?.schools?.name || 'Unknown');

    const groupMap = new Map<string, { name: string; submissions: any[] }>();

    for (const r of roster) {
        groupMap.set(r.id, { name: r.name, submissions: [] });
    }

    submissions.forEach(sub => {
        const key = idOf(sub) ?? nameOf(sub);
        if (!groupMap.has(key)) {
            groupMap.set(key, { name: nameOf(sub), submissions: [] });
        }
        groupMap.get(key)!.submissions.push(sub);
    });

    const expectedById = new Map(roster.map(r => [r.id, r.loadCount * definedWeeks]));

    return Array.from(groupMap.entries()).map(([id, { name, submissions: subs }]) => {
        const expected = expectedById.get(id) ?? subs.length;
        const stats = calculateCompliance(subs, expected);
        return {
            name,
            compliance_rate: stats.rate,
            submission_frequency: subs.length,
            compliant: stats.Compliant,
            late: stats.Late,
            missing: stats.NonCompliant,
            total: stats.totalUploaded
        };
    });
}

/**
 * K-means clustering for performance distribution
 * Clusters entities into 3 groups: High Performers, Average, At-Risk
 *
 * Real Lloyd's-algorithm k-means: centroids are seeded from the data's own
 * percentile spread, then iteratively re-assigned and re-averaged until they
 * stop moving (or maxIterations is hit). Clusters are labeled by ranking the
 * *converged* centroids' compliance rate — never by fixed array position —
 * since which cluster ends up "high" vs "at-risk" depends on the data.
 */
export function kMeansClusterPerformance(performances: any[], k: number = 3, maxIterations: number = 25) {
    if (performances.length === 0) return { high: [], average: [], atRisk: [] };

    k = Math.min(k, performances.length);

    // Normalize data for clustering
    const maxRate = Math.max(...performances.map(p => p.compliance_rate), 100);
    const maxFreq = Math.max(...performances.map(p => p.submission_frequency), 1);

    const points = performances.map(p => [
        p.compliance_rate / maxRate,
        p.submission_frequency / maxFreq
    ]);

    const dist = (a: number[], b: number[]) =>
        Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));

    // Seed centroids from evenly-spaced percentiles of the sorted compliance
    // rate, so the starting points already reflect this dataset's spread
    // instead of assuming a fixed 0.3/0.6/0.9 shape.
    const sortedIdx = points
        .map((_, i) => i)
        .sort((a, b) => performances[a].compliance_rate - performances[b].compliance_rate);
    let centroids: number[][] = Array.from({ length: k }, (_, c) => {
        const idx = sortedIdx[Math.floor(((c + 0.5) / k) * sortedIdx.length)];
        return [...points[idx]];
    });

    let assignments = new Array(points.length).fill(0);

    for (let iter = 0; iter < maxIterations; iter++) {
        let changed = false;

        // Assignment step
        for (let i = 0; i < points.length; i++) {
            let bestCluster = 0;
            let bestDist = Infinity;
            for (let c = 0; c < k; c++) {
                const d = dist(points[i], centroids[c]);
                if (d < bestDist) {
                    bestDist = d;
                    bestCluster = c;
                }
            }
            if (assignments[i] !== bestCluster) {
                assignments[i] = bestCluster;
                changed = true;
            }
        }

        if (!changed && iter > 0) break;

        // Update step
        for (let c = 0; c < k; c++) {
            const members = points.filter((_, i) => assignments[i] === c);
            if (members.length > 0) {
                centroids[c] = [
                    members.reduce((s, p) => s + p[0], 0) / members.length,
                    members.reduce((s, p) => s + p[1], 0) / members.length
                ];
            }
        }
    }

    // Rank converged clusters by centroid compliance rate (highest first),
    // then map ranks to the high/average/at-risk buckets — regardless of
    // which raw cluster index ended up with the best-performing centroid.
    const clusterOrder = Array.from({ length: k }, (_, c) => c)
        .sort((a, b) => centroids[b][0] - centroids[a][0]);
    const rankOf = new Map(clusterOrder.map((c, rank) => [c, rank]));

    const buckets: any[][] = [[], [], []];
    performances.forEach((perf, i) => {
        const rank = rankOf.get(assignments[i]) ?? 1;
        // With k < 3 (very little data), fold any extra ranks into "average".
        const bucketIdx = rank === 0 ? 0 : rank === k - 1 ? 2 : 1;
        buckets[bucketIdx].push(perf);
    });

    return {
        high: buckets[0].sort((a, b) => b.compliance_rate - a.compliance_rate),
        average: buckets[1].sort((a, b) => b.compliance_rate - a.compliance_rate),
        atRisk: buckets[2].sort((a, b) => b.compliance_rate - a.compliance_rate)
    };
}

/**
 * Get at-risk entities (below threshold compliance)
 */
export function getAtRiskEntities(performances: any[], threshold: number = 70) {
    return performances
        .filter(p => p.compliance_rate < threshold)
        .sort((a, b) => a.compliance_rate - b.compliance_rate)
        .map(p => ({
            ...p,
            risk_level: p.compliance_rate < 50 ? 'critical' : p.compliance_rate < 60 ? 'high' : 'medium'
        }));
}

/**
 * Forecast compliance based on trend
 */
export function forecastCompliance(trend: any[], periods: number = 4) {
    if (trend.length < 2) return [];

    const forecast = [...trend];
    const recentTrend = trend.slice(-3);

    if (recentTrend.length === 0) return forecast;

    // Calculate average rate change
    const avgChange = recentTrend.reduce((sum, t, i) => {
        if (i === 0) return sum;
        return sum + (t.rate - recentTrend[i - 1].rate);
    }, 0) / recentTrend.length;

    // Generate forecasted periods
    let lastRate = recentTrend[recentTrend.length - 1].rate;
    for (let i = 0; i < periods; i++) {
        const nextRate = Math.min(100, Math.max(0, lastRate + avgChange));
        forecast.push({
            period: `F${i + 1}`,
            compliant: 0,
            late: 0,
            missing: 0,
            total: 0,
            rate: Math.round(nextRate),
            isForecasted: true
        });
        lastRate = nextRate;
    }

    return forecast;
}

/**
 * School/Teacher comparison metrics
 */
export function getComparisonMetrics(performances: any[]) {
    if (performances.length === 0) return {
        best: null,
        worst: null,
        average: { compliance_rate: 0, submission_frequency: 0 },
        median: { compliance_rate: 0, submission_frequency: 0 }
    };

    const sorted = [...performances].sort((a, b) => b.compliance_rate - a.compliance_rate);

    const avgRate = performances.reduce((sum, p) => sum + p.compliance_rate, 0) / performances.length;
    const avgFreq = performances.reduce((sum, p) => sum + p.submission_frequency, 0) / performances.length;

    const medianIdx = Math.floor(performances.length / 2);
    const medianRate = sorted[medianIdx].compliance_rate;
    const medianFreq = sorted[medianIdx].submission_frequency;

    return {
        best: sorted[0],
        worst: sorted[sorted.length - 1],
        average: {
            compliance_rate: Math.round(avgRate),
            submission_frequency: Math.round(avgFreq)
        },
        median: {
            compliance_rate: medianRate,
            submission_frequency: medianFreq
        }
    };
}
