import { supabase } from '$lib/utils/supabase';
import { calculateCompliance } from '$lib/utils/useDashboardData';

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
            .limit(10000),

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
            .limit(10000),

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
            .limit(10000),

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
            .limit(10000),

        // School performance metrics
        supabase
            .from('submissions')
            .select(`
                compliance_status,
                profiles!inner(district_id, school_id, schools(name))
            `)
            .eq('profiles.district_id', districtId)
            .limit(10000),

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
            .limit(10000),

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
