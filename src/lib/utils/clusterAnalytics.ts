/**
 * Cluster-Based Performance Analytics (K-Means)
 * 
 * Unsupervised machine learning that groups teachers by behavioral patterns:
 * - Punctuality (on-time submission rate)
 * - Consistency (regularity of submission day)
 * - Completeness (% of weeks with submissions)
 * - Volume (docs per week average)
 * 
 * Optimization: Pre-aggregated counts from existing dashboard data.
 * Local resource cost: 🟢 Minimal | Offline speed: ⚡ Instant
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TeacherFeatureVector {
    teacherId: string;
    teacherName: string;
    schoolName: string;
    /** 0-100: % of submissions that were on-time */
    punctuality: number;
    /** 0-100: how regular the submission schedule is */
    consistency: number;
    /** 0-100: % of expected weeks that have at least 1 submission */
    completeness: number;
    /** average documents per week */
    volume: number;
}

export interface ClusterResult {
    teacher: TeacherFeatureVector;
    clusterId: number;
    clusterLabel: string;
    clusterColor: string;
    distanceToCentroid: number;
}

export interface ClusterSummary {
    clusterId: number;
    label: string;
    color: string;
    count: number;
    centroid: number[];
    avgPunctuality: number;
    avgConsistency: number;
    avgCompleteness: number;
    avgVolume: number;
}

export interface ClusterOutput {
    results: ClusterResult[];
    summaries: ClusterSummary[];
    iterations: number;
}

// ─── Feature Extraction ──────────────────────────────────────────────────────

/**
 * Extract behavioral feature vectors from raw submission data.
 * Uses pre-aggregated counts — no new DB queries needed.
 */
export function extractFeatures(
    teachers: { id: string; full_name: string; school_name?: string }[],
    submissions: {
        user_id: string;
        compliance_status?: string;
        week_number?: number;
        created_at?: string;
    }[],
    totalWeeks: number = 8
): TeacherFeatureVector[] {
    const vectors: TeacherFeatureVector[] = [];

    for (const teacher of teachers) {
        const subs = submissions.filter(s => s.user_id === teacher.id);
        if (subs.length === 0) {
            vectors.push({
                teacherId: teacher.id,
                teacherName: teacher.full_name,
                schoolName: teacher.school_name || '',
                punctuality: 0,
                consistency: 0,
                completeness: 0,
                volume: 0
            });
            continue;
        }

        // Punctuality: % compliant out of total
        const compliant = subs.filter(s => {
            const cs = (s.compliance_status || '').toLowerCase();
            return cs === 'compliant' || cs === 'on-time';
        }).length;
        const punctuality = Math.round((compliant / subs.length) * 100);

        // Completeness: how many distinct weeks have at least one submission
        const distinctWeeks = new Set(subs.map(s => s.week_number).filter(Boolean));
        const completeness = Math.round((distinctWeeks.size / Math.max(1, totalWeeks)) * 100);

        // Consistency: measure how regular the submission day pattern is
        // Lower std dev in day-of-week = more consistent
        const days = subs
            .filter(s => s.created_at)
            .map(s => new Date(s.created_at!).getDay());

        let consistency = 50; // default if no dates
        if (days.length >= 2) {
            const mean = days.reduce((a, b) => a + b, 0) / days.length;
            const variance = days.reduce((sum, d) => sum + (d - mean) ** 2, 0) / days.length;
            const stdDev = Math.sqrt(variance);
            // Convert: stdDev 0 = 100% consistent, stdDev 3+ = 0%
            consistency = Math.round(Math.max(0, Math.min(100, (1 - stdDev / 3) * 100)));
        }

        // Volume: average docs per active week
        const activeWeeks = Math.max(1, distinctWeeks.size);
        const volume = Math.round((subs.length / activeWeeks) * 10) / 10;

        vectors.push({
            teacherId: teacher.id,
            teacherName: teacher.full_name,
            schoolName: teacher.school_name || '',
            punctuality,
            consistency,
            completeness,
            volume: Math.min(volume * 20, 100) // Normalize to 0-100
        });
    }

    return vectors;
}

// ─── K-Means Algorithm ────────────────────────────────────────────────────────

function toArray(v: TeacherFeatureVector): number[] {
    return [v.punctuality, v.consistency, v.completeness, v.volume];
}

function euclidean(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
}

function mean(vectors: number[][]): number[] {
    if (vectors.length === 0) return [0, 0, 0, 0];
    const dims = vectors[0].length;
    const result = new Array(dims).fill(0);
    for (const v of vectors) {
        for (let i = 0; i < dims; i++) {
            result[i] += v[i];
        }
    }
    for (let i = 0; i < dims; i++) {
        result[i] /= vectors.length;
    }
    return result;
}

/**
 * Run K-Means clustering on teacher feature vectors.
 * 
 * @param teachers - Pre-extracted feature vectors
 * @param k - Number of clusters (default: 3)
 * @param maxIterations - Max convergence iterations (default: 20)
 */
export function runKMeansClustering(
    teachers: TeacherFeatureVector[],
    k: number = 3,
    maxIterations: number = 20
): ClusterOutput {
    if (teachers.length === 0) {
        return { results: [], summaries: [], iterations: 0 };
    }

    // Clamp k to available data
    k = Math.min(k, teachers.length);

    const data = teachers.map(toArray);

    // Initialize centroids using K-Means++ initialization
    const centroids: number[][] = [];

    // First centroid: pick the one with highest overall score
    const scores = data.map(d => d.reduce((a, b) => a + b, 0));
    const firstIdx = scores.indexOf(Math.max(...scores));
    centroids.push([...data[firstIdx]]);

    // If k >= 2, pick the one with lowest score
    if (k >= 2) {
        const secondIdx = scores.indexOf(Math.min(...scores));
        centroids.push([...data[secondIdx === firstIdx ? (firstIdx + 1) % data.length : secondIdx]]);
    }

    // If k >= 3, pick the one farthest from both
    if (k >= 3) {
        let maxDist = -1;
        let thirdIdx = 0;
        for (let i = 0; i < data.length; i++) {
            const d1 = euclidean(data[i], centroids[0]);
            const d2 = euclidean(data[i], centroids[1]);
            const minD = Math.min(d1, d2);
            if (minD > maxDist) {
                maxDist = minD;
                thirdIdx = i;
            }
        }
        centroids.push([...data[thirdIdx]]);
    }

    // Iterate
    let assignments = new Array(data.length).fill(0);
    let iterations = 0;

    for (let iter = 0; iter < maxIterations; iter++) {
        iterations++;
        let changed = false;

        // Assignment step
        for (let i = 0; i < data.length; i++) {
            let bestCluster = 0;
            let bestDist = Infinity;
            for (let c = 0; c < k; c++) {
                const dist = euclidean(data[i], centroids[c]);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestCluster = c;
                }
            }
            if (assignments[i] !== bestCluster) {
                assignments[i] = bestCluster;
                changed = true;
            }
        }

        if (!changed) break;

        // Update step
        for (let c = 0; c < k; c++) {
            const clusterPoints = data.filter((_, i) => assignments[i] === c);
            if (clusterPoints.length > 0) {
                centroids[c] = mean(clusterPoints);
            }
        }
    }

    // Label clusters by centroid quality
    const centroidScores = centroids.map((c, i) => ({
        idx: i,
        score: c.reduce((a, b) => a + b, 0)
    }));
    centroidScores.sort((a, b) => b.score - a.score);
    const labels: Record<number, { label: string; color: string }> = {};

    centroidScores.forEach((cs, rank) => {
        const defs = [
            { label: 'Consistently Meeting Standards', color: '#008751' },
            { label: 'Steadily Progressing', color: '#0038A8' },
            { label: 'Building Momentum', color: '#FCD116' },
            { label: 'Moving Forward Together', color: '#CE1126' }
        ];
        labels[cs.idx] = defs[Math.min(rank, defs.length - 1)];
    });

    // Build results
    const results: ClusterResult[] = teachers.map((teacher, i) => ({
        teacher,
        clusterId: assignments[i],
        clusterLabel: labels[assignments[i]].label,
        clusterColor: labels[assignments[i]].color,
        distanceToCentroid: euclidean(data[i], centroids[assignments[i]])
    }));

    // Build summaries
    const summaries: ClusterSummary[] = [];
    for (let c = 0; c < k; c++) {
        const members = results.filter(r => r.clusterId === c);
        if (members.length === 0) continue;

        summaries.push({
            clusterId: c,
            label: labels[c].label,
            color: labels[c].color,
            count: members.length,
            centroid: centroids[c],
            avgPunctuality: Math.round(members.reduce((s, m) => s + m.teacher.punctuality, 0) / members.length),
            avgConsistency: Math.round(members.reduce((s, m) => s + m.teacher.consistency, 0) / members.length),
            avgCompleteness: Math.round(members.reduce((s, m) => s + m.teacher.completeness, 0) / members.length),
            avgVolume: Math.round(members.reduce((s, m) => s + m.teacher.volume, 0) / members.length)
        });
    }

    return { results, summaries, iterations };
}

/**
 * Quick pre-flight check: returns true if there's enough data for meaningful clustering.
 */
export function canCluster(teacherCount: number, submissionCount: number): boolean {
    return teacherCount >= 3 && submissionCount >= 5;
}
