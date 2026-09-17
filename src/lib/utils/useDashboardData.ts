/**
 * Dashboard Data Utilities
 * Shared compliance calculation helpers for all 4 dashboards.
 * 
 * CRITICAL: All compliance data uses ACTUAL compliance_status values from the
 * submissions table. No recalculation or estimation of compliance status.
 */

export interface ComplianceStats {
  Compliant: number;
  Late: number;
  NonCompliant: number;
  totalUploaded: number;
  expected: number;
  rate: number; // 0-100
}

export interface WeeklyData {
  week: number;
  label: string;
  Compliant: number;
  Late: number;
  NonCompliant: number;
  rate: number;
  docs: number;
}

export interface AcademicWeek {
  week_number: number;
  deadline_date?: string;
  school_year?: string;
}

// Short-lived in-memory cache so getActualWeeks / getDefinedWeeksCount /
// getCurrentWeekFromCalendar don't re-query the calendar on every call within
// a page load. Cleared whenever the school year or district changes.
const calendarCache = new Map<string, AcademicWeek[]>();
export function clearCalendarCache() {
  calendarCache.clear();
}

/**
 * Fetch actual weeks from the academic_calendar table.
 * Returns sorted array of AcademicWeek objects. Cached per (year, district).
 */
export async function getActualWeeks(
  supabase: any,
  schoolYear: string = getDynamicSchoolYear(),
  districtId?: string
): Promise<AcademicWeek[]> {
  const cacheKey = `${schoolYear}|${districtId || 'all'}`;
  const cached = calendarCache.get(cacheKey);
  if (cached) return cached;

  let query = supabase
    .from('academic_calendar')
    .select('week_number, deadline_date, school_year, is_active')
    .eq('school_year', schoolYear)
    .eq('is_active', true)
    .order('week_number', { ascending: true });

  if (districtId) {
    query = query.or(`district_id.eq.${districtId},district_id.is.null`);
  }

  const { data, error } = await query;
  const weeks = (error || !data) ? [] : (data as AcademicWeek[]);
  calendarCache.set(cacheKey, weeks);
  return weeks;
}

/**
 * Get the current week number from academic_calendar by finding which
 * week contains today's date. Falls back to calculated week if no match.
 */
export async function getCurrentWeekFromCalendar(
  supabase: any,
  schoolYear: string = getDynamicSchoolYear(),
  districtId?: string
): Promise<number> {
  const weeks = await getActualWeeks(supabase, schoolYear, districtId);
  const today = new Date().toISOString().split('T')[0];

  // If we have weeks, find the first week where the deadline is in the future or today
  const currentWeek = weeks.find(w => w.deadline_date && w.deadline_date >= today);
  if (currentWeek) {
    return currentWeek.week_number;
  }

  // Fallback: return the latest week_number if all deadlines passed
  if (weeks.length > 0) {
    return weeks[weeks.length - 1].week_number;
  }

  // Ultimate fallback: calculate from hardcoded date
  return getWeekNumber();
}

/**
 * Count the number of weeks defined in the academic_calendar table.
 * This determines the multiplier for teaching loads in compliance calculations.
 */
export async function getDefinedWeeksCount(
  supabase: any,
  schoolYear: string = getDynamicSchoolYear(),
  districtId?: string
): Promise<number> {
  const weeks = await getActualWeeks(supabase, schoolYear, districtId);

  // User requirement: weeks show up as expected loads as soon as they are set in calendar.
  // So we count all weeks defined for this year.
  return weeks.length || 1; // Minimum 1 to avoid 0% issues if calendar is empty
}

/**
 * ISP/ISR are one-off administrative uploads (Individual/School Plans and
 * Reports), not part of the weekly DLL submission cadence — they must never
 * count toward, or dilute, compliance rates or "total uploaded" figures.
 */
export function isComplianceTrackedDocType(docType: string | null | undefined): boolean {
  const dt = (docType || '').toUpperCase().trim();
  return dt !== 'ISP' && dt !== 'ISR';
}

/**
 * Deduplicate submissions by slot (teaching_load_id + week_number + doc_type).
 * When a teacher uploads multiple documents for the same week/load, only the
 * most recent submission per slot is counted toward compliance.
 */
export function deduplicateSubmissions<T extends { teaching_load_id?: string | null; week_number?: number | null; doc_type?: string | null; created_at?: string; compliance_status?: string }>(
  submissions: T[]
): T[] {
  const latestBySlot = new Map<string, T>();
  const isSup = (r: T | undefined) => (r?.compliance_status || '').toLowerCase() === 'supplementary' || (r?.compliance_status || '').toLowerCase() === 'extra';
  for (const s of submissions) {
    const key = `${s.teaching_load_id ?? ''}|${s.week_number ?? ''}|${s.doc_type ?? ''}`;
    const existing = latestBySlot.get(key);
    // Required (non-supplementary) submissions always win a slot over supplementary ones,
    // so a "another DLL" can never replace the counted DLL for that week+subject.
    if (!existing) {
      latestBySlot.set(key, s);
    } else if (isSup(existing) && !isSup(s)) {
      latestBySlot.set(key, s);
    } else if (isSup(existing) === isSup(s)) {
      if (s.created_at && (!existing.created_at || new Date(s.created_at) > new Date(existing.created_at))) {
        latestBySlot.set(key, s);
      }
    }
  }
  return Array.from(latestBySlot.values());
}

/**
 * Count submissions directly by their stored compliance_status.
 * Returns counts for each status category.
 */
export function countSubmissionsByStatus(
  submissions: { compliance_status?: string }[]
): { compliant: number; late: number; nonCompliant: number; total: number } {
  let compliant = 0;
  let late = 0;
  let nonCompliant = 0;

  for (const s of submissions) {
    const cs = (s.compliance_status || 'compliant').toLowerCase().trim();
    // Supplementary/extra DLLs (another DLL for an already-covered slot) are
    // stored but must NOT affect compliant, late, missing, or the rate.
    if (cs === 'supplementary' || cs === 'extra') continue;
    if (cs === 'compliant' || cs === 'on-time') {
      compliant++;
    } else if (cs === 'late') {
      late++;
    } else {
      nonCompliant++;
    }
  }

  return { compliant, late, nonCompliant, total: compliant + late + nonCompliant };
}

export function calculateCompliance(
  submissions: { compliance_status?: string; created_at?: string; teaching_load_id?: string | null; week_number?: number | null; doc_type?: string | null }[],
  expectedTotal: number = 0
): ComplianceStats {
  const tracked = submissions.filter((s) => isComplianceTrackedDocType(s.doc_type));
  const deduped = deduplicateSubmissions(tracked as { teaching_load_id?: string | null; week_number?: number | null; doc_type?: string | null; created_at?: string }[]);
  const counts = countSubmissionsByStatus(deduped as { compliance_status?: string }[]);

  // Instead of counting DB records for non-compliant, we deduce it:
  // Expected Total = (Setted Weeks) * (Teaching Loads)
  // Actual Uploads = Compliant + Late
  const actualUploads = counts.compliant + counts.late;
  const nonCompliant = Math.max(0, expectedTotal - actualUploads);

  // Rate = Actual Uploads / Expected Total
  const rate = expectedTotal > 0 ? Math.min(100, Math.round((actualUploads / expectedTotal) * 100)) : 0;

  return {
    Compliant: counts.compliant,
    Late: counts.late,
    NonCompliant: nonCompliant,
    totalUploaded: counts.total,
    expected: expectedTotal,
    rate
  };
}

/**
 * Dynamic Academic Year calculation.
 * Returns 'YYYY-YYYY' based on current date (Aug 1st transition).
 */
import { getCurrentSchoolYear as getDynamicSchoolYear } from './schoolYear';

export { getDynamicSchoolYear };

/**
 * Fallback week number calculation.
 * Calculates week number based on August 1st of the current academic year.
 */
export function getWeekNumber(date: Date = new Date()): number {
  const year = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  const start = new Date(year, 7, 1); // August 1st
  const diff = date.getTime() - start.getTime();
  const week = Math.ceil(diff / (1000 * 60 * 60 * 24 * 7));
  return Math.max(1, week);
}

export function getComplianceColor(rate: number): string {
  if (rate >= 100) return '#008751'; // green
  if (rate >= 50) return '#FCD116'; // yellow
  return '#CE1126'; // red
}

export function getComplianceClass(rate: number): string {
  if (rate >= 100) return 'text-gov-green';
  if (rate >= 50) return 'text-gov-gold-dark';
  return 'text-gov-red';
}

export function getComplianceBgClass(rate: number): string {
  if (rate >= 100) return 'bg-gov-green/15';
  if (rate >= 50) return 'bg-gov-gold/15';
  return 'bg-gov-red/15';
}

export function getTrendDirection(current: number, previous: number): 'up' | 'down' | 'stable' {
  const diff = current - previous;
  if (diff > 2) return 'up';
  if (diff < -2) return 'down';
  return 'stable';
}

export function getTrendIcon(dir: 'up' | 'down' | 'stable'): string {
  return ''; // Rely on color and text/direction
}

/**
 * Group submissions by week for charts and widgets.
 * Uses academic_calendar deadlines when available, falls back to computed weeks.
 */
export function normalizeComplianceStatus(status: string | null | undefined): string {
  if (!status) return 'compliant';
  const s = status.toLowerCase().trim();
  if (s === 'compliant' || s === 'on-time') return 'compliant';
  if (s === 'late') return 'late';
  if (s === 'non-compliant' || s === 'missing') return 'missing';
  if (s === 'supplementary' || s === 'extra') return 'supplementary';
  return s;
}

export function groupSubmissionsByWeek(
  submissions: { created_at: string; status?: string; compliance_status?: string; week_number?: number }[],
  teachingLoadsCount: number = 0,
  weekCount = 8,
  calendarDeadlines: any[] = []
): WeeklyData[] {
  const weeks: WeeklyData[] = [];

  // If calendar deadlines are provided, use those as the "weeks"
  if (calendarDeadlines.length > 0) {
    // Sort by week number descending, take most recent weekCount
    const sorted = [...calendarDeadlines].sort((a, b) => b.week_number - a.week_number).slice(0, weekCount);
    for (const cal of sorted) {
      const weekSubs = submissions.filter(s => s.week_number === cal.week_number);
      const stats = calculateCompliance(weekSubs, teachingLoadsCount);
      weeks.push({
        week: cal.week_number,
        label: `W${cal.week_number}`,
        Compliant: stats.Compliant,
        Late: stats.Late,
        NonCompliant: stats.NonCompliant,
        rate: stats.rate,
        docs: weekSubs.length
      });
    }
    return weeks.reverse(); // Back to ascending for the chart
  }

  // Fallback: use calculated weeks if no calendar provided
  const currentWeek = getWeekNumber();
  for (let i = weekCount - 1; i >= 0; i--) {
    const wk = currentWeek - i;
    if (wk < 1) continue;
    const weekSubs = submissions.filter(s => {
      if (s.week_number) return s.week_number === wk;
      return getWeekNumber(new Date(s.created_at)) === wk;
    });
    const stats = calculateCompliance(weekSubs, teachingLoadsCount);
    weeks.push({
      week: wk,
      label: `W${wk}`,
      Compliant: stats.Compliant,
      Late: stats.Late,
      NonCompliant: stats.NonCompliant,
      rate: stats.rate,
      docs: weekSubs.length
    });
  }

  return weeks;
}

export function formatComplianceRate(rate: number): string {
  return `${Math.round(rate)}%`;
}

/**
 * Robustly get week number from a submission object.
 */
export function getSubmissionWeek(s: { week_number?: number | null, created_at?: string }): number {
  if (s.week_number) return s.week_number;
  if (s.created_at) return getWeekNumber(new Date(s.created_at));
  return getWeekNumber();
}

/**
 * WBS 14.5 - Active Missing Submission Detection (Per Teaching Load)
 * 
 * Scans past-deadline calendar weeks and, for each teacher, checks how many
 * teaching loads they have. For each (teacher, load, week) tuple with no
 * matching submission, inserts a 'missing' placeholder record.
 */
export async function markNonCompliantSubmissions(
  supabase: any,
  schoolYear: string = getDynamicSchoolYear(),
  districtId?: string,
  userId?: string,
  schoolId?: string
): Promise<number> {
  let marked = 0;

  try {
    console.log('[NC] markNonCompliantSubmissions called with:', { schoolYear, districtId, userId, schoolId });

    // 1. Get all weeks from academic calendar
    let calQuery = supabase
      .from('academic_calendar')
      .select('id, week_number')
      .eq('school_year', schoolYear)
      .order('week_number', { ascending: true });

    if (districtId) {
      calQuery = calQuery.eq('district_id', districtId);
    }

    const { data: pastWeeks, error: calError } = await calQuery;
    if (calError || !pastWeeks || pastWeeks.length === 0) return 0;

    // 2. Get teachers in scope
    let teacherQuery = supabase
      .from('profiles')
      .select('id, full_name, school_id')
      .eq('role', 'Teacher');

    if (userId) {
      teacherQuery = teacherQuery.eq('id', userId);
    } else if (schoolId) {
      teacherQuery = teacherQuery.eq('school_id', schoolId);
    } else if (districtId) {
      const { data: schools } = await supabase.from('schools').select('id').eq('district_id', districtId);
      if (schools && schools.length > 0) {
        teacherQuery = teacherQuery.in('school_id', schools.map((s: any) => s.id));
      }
    }

    const { data: teachers, error: teacherError } = await teacherQuery;
    if (teacherError || !teachers || teachers.length === 0) return 0;

    const teacherIds = teachers.map((t: any) => t.id);

    // 3. Get teaching loads
    const { data: teachingLoads } = await supabase
      .from('teaching_loads')
      .select('id, user_id, subject')
      .in('user_id', teacherIds);

    if (!teachingLoads || teachingLoads.length === 0) return 0;

    // 4. Get existing submissions
    const weekNumbers = pastWeeks.map((w: any) => w.week_number);
    const { data: existingSubs } = await supabase
      .from('submissions')
      .select('id, user_id, week_number, compliance_status, file_hash, teaching_load_id')
      .in('user_id', teacherIds)
      .in('week_number', weekNumbers)
      .eq('school_year', schoolYear);

    // 5. Per-Load Rebalancing Logic
    const ncRecords: any[] = [];
    const idsToDelete: string[] = [];

    for (const teacher of teachers) {
      const myLoads = teachingLoads.filter((l: any) => l.user_id === teacher.id);
      if (myLoads.length === 0) continue;

      for (const week of pastWeeks) {
        const mySubsForWeek = (existingSubs || []).filter(
          (s: any) => s.user_id === teacher.id && s.week_number === week.week_number
        );

        for (const load of myLoads) {
          const loadSubs = mySubsForWeek.filter((s: any) => s.teaching_load_id === load.id);
          const hasRealSub = loadSubs.some((s: any) =>
            s.compliance_status === 'compliant' ||
            s.compliance_status === 'late' ||
            s.compliance_status === 'supplementary' ||
            s.compliance_status === 'extra'
          );
          const ncSubs = loadSubs.filter((s: any) => s.compliance_status === 'missing');

          if (hasRealSub) {
            if (ncSubs.length > 0) {
              idsToDelete.push(...ncSubs.map((s: any) => s.id));
            }
          } else {
            if (ncSubs.length === 0) {
              const hash = `nc_${teacher.id}_${week.week_number}_${load.id}_${schoolYear}`;
              ncRecords.push({
                user_id: teacher.id,
                teaching_load_id: load.id,
                file_name: `[Missing] ${load.subject} - Week ${week.week_number}`,
                file_path: `missing/${teacher.id}/week_${week.week_number}_load_${load.id}`,
                file_hash: hash,
                file_size: 0,
                doc_type: 'Unknown',
                week_number: week.week_number,
                school_year: schoolYear,
                calendar_id: week.id,
                compliance_status: 'missing'
              });
            } else if (ncSubs.length > 1) {
              idsToDelete.push(...ncSubs.slice(1).map((s: any) => s.id));
            }
          }
        }
      }
    }

    // 6. Execute balanced changes
    if (idsToDelete.length > 0) {
      await supabase.from('submissions').delete().in('id', idsToDelete);
    }

    if (ncRecords.length > 0) {
        // Chunk the insert: Supabase REST rejects requests without rows that fit
        // one body (~1000 rows). Inserting tens of thousands of 'missing' rows at
        // once would exceed that, so we batch in safe slices.
        const BATCH_SIZE = 900;
        for (let i = 0; i < ncRecords.length; i += BATCH_SIZE) {
            const chunk = ncRecords.slice(i, i + BATCH_SIZE);
            const { error } = await supabase
                .from("submissions")
                .insert(chunk);
            if (error) {
                console.error("[markNonCompliantSubmissions] batch insert error:", error);
            } else {
                marked += chunk.length;
            }
        }
    }

    return marked;
  } catch (err) {
    console.error('[markNonCompliantSubmissions] Error:', err);
    return 0;
  }
}
