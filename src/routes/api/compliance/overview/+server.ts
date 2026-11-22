import { json, type RequestHandler } from '@sveltejs/kit';
import { env as publicEnv } from '$env/dynamic/public';
import { createClient } from '@supabase/supabase-js';
import {
    buildRequirements, currentCompliancePeriod, fetchAllRows, fetchRowsForIds,
    filterSubmissionsByPeriod, isRemarkRequiredSubmission, isUploadSubmission,
    scopedCalendar, summarizeRequirements, summarizeSubmissionReviews,
    type CalendarSlot, type ComplianceLoad, type ComplianceSubmission, type LeaveRequest,
} from '$lib/utils/compliance';

export const GET: RequestHandler = async ({ request, url }) => {
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token || !publicEnv.PUBLIC_SUPABASE_URL || !publicEnv.PUBLIC_SUPABASE_ANON_KEY) {
        return json({ error: 'Sign in to view compliance.' }, { status: 401 });
    }
    const db = createClient(publicEnv.PUBLIC_SUPABASE_URL, publicEnv.PUBLIC_SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) return json({ error: 'Session expired.' }, { status: 401 });
    const { data: actor, error: profileError } = await db.from('profiles')
        .select('id, role, school_id, district_id').eq('id', user.id).single();
    if (profileError || !actor || !['Master Teacher', 'School Head', 'District Supervisor', 'Admin'].includes(actor.role)) {
        return json({ error: 'Compliance access denied.' }, { status: 403 });
    }
    const year = url.searchParams.get('year') || '';
    const requestedTerm = url.searchParams.get('term') || 'current';
    const requestedWeek = url.searchParams.get('week') || 'current';
    if (!/^2\d{3}-2\d{3}$/.test(year) || !/^(all|current|[1-3])$/.test(requestedTerm) ||
        !/^(all|current|\d{1,2})$/.test(requestedWeek)) {
        return json({ error: 'Invalid academic period.' }, { status: 400 });
    }
    if (actor.role === 'District Supervisor' && !actor.district_id ||
        ['Master Teacher', 'School Head'].includes(actor.role) && !actor.school_id) {
        return json({ error: 'An assigned school or district is required.' }, { status: 403 });
    }
    try {
        const schools = await fetchAllRows<{ id: string; name: string; district_id: string }>(() => {
            let query = db.from('schools').select('id, name, district_id').order('id');
            if (['Master Teacher', 'School Head'].includes(actor.role)) query = query.eq('id', actor.school_id);
            else if (actor.district_id) query = query.eq('district_id', actor.district_id);
            return query;
        });
        const schoolIds = schools.map(s => s.id);
        const people = await fetchRowsForIds<{ id: string; full_name: string; school_id: string; role: string; is_active: boolean | null }>(schoolIds,
            batch => db.from('profiles').select('id, full_name, school_id, role, is_active')
                .in('school_id', batch).in('role', ['Teacher','Master Teacher','School Head']).order('id'));
        const active = people.filter(p => p.is_active !== false);
        const teacherIds = active.filter(p => ['Teacher','Master Teacher'].includes(p.role)).map(p => p.id);
        const userIds = active.map(p => p.id);
        const calendar = await fetchAllRows<CalendarSlot>(() => db.from('academic_calendar')
            .select('id,school_year,term,week_number,deadline_date,district_id,is_active')
            .eq('school_year',year).eq('is_published',true).order('id'));
        const current = currentCompliancePeriod(calendar);
        const term = requestedTerm === 'current' ? current.term : requestedTerm;
        const week = requestedWeek === 'current' ? current.week : requestedWeek;
        const [loads, submissions, leaves] = await Promise.all([
            fetchRowsForIds<ComplianceLoad>(teacherIds, batch => db.from('teaching_loads')
                .select('id,user_id,subject,grade_level,is_active').in('user_id',batch).eq('is_active',true).order('id')),
            fetchRowsForIds<ComplianceSubmission>(userIds, batch => {
                let query = db.from('submissions')
                    .select('id,user_id,teaching_load_id,school_year,term_number,week_number,calendar_id,file_path,doc_type,compliance_status,created_at,subject')
                    .in('user_id',batch).eq('school_year',year).in('doc_type',['DLL','DLP','ISP','ISR']).order('id');
                // Week numbers repeat across terms. Keep the term check in the
                // existing compliance calculation so legacy path terms remain valid.
                if (week !== 'all') query = query.eq('week_number',Number(week));
                return query;
            }),
            fetchRowsForIds<LeaveRequest>(userIds, batch => db.from('submission_leave_requests')
                .select('*').in('user_id',batch).eq('school_year',year).order('created_at',{ascending:false})),
        ]);
        const reviews = await fetchRowsForIds<{ submission_id: string; reviewer_comment: string | null; status: string | null }>(
            submissions.map(s => s.id), batch => db.from('dll_reviews')
                .select('submission_id,reviewer_comment,status').in('submission_id',batch).order('id'));
        const schoolMap = new Map(schools.map(s => [s.id, s]));
        const allRequirements = active.filter(p => teacherIds.includes(p.id)).flatMap(person => {
            const ownLoads = loads.filter(load => load.user_id === person.id).map(load => ({ ...load, school_name: schoolMap.get(person.school_id)?.name || null }));
            return buildRequirements(ownLoads,
                scopedCalendar(calendar, schoolMap.get(person.school_id)?.district_id),
                submissions.filter(s => s.user_id === person.id), reviews, Date.now(),
                leaves.filter(leave => leave.user_id === person.id));
        });
        const summarize = (schoolId?: string, teacherId?: string) => {
            const scopedPeople = active.filter(p => (!schoolId || p.school_id === schoolId) && (!teacherId || p.id === teacherId));
            const ids = new Set(scopedPeople.map(p => p.id));
            const requirements = allRequirements.filter(r => ids.has(r.teacherId) &&
                (term === 'all' || r.calendar.term === Number(term)) &&
                (week === 'all' || r.calendar.week_number === Number(week)));
            const uploads = filterSubmissionsByPeriod(submissions.filter(s => s.user_id && ids.has(s.user_id) && isUploadSubmission(s)),term,week);
            const reviewable = uploads.filter(isRemarkRequiredSubmission);
            return { ...summarizeRequirements(requirements), ...summarizeSubmissionReviews(reviewable,reviews),
                supplementary: reviewable.filter(s => ['supplementary','extra'].includes((s.compliance_status || '').toLowerCase())).length };
        };
        return json({ year, term, week, savedAt: new Date().toISOString(), summary: summarize(),
            schools: schools.map(s => ({ ...s, ...summarize(s.id) })),
            teachers: active.filter(p => teacherIds.includes(p.id)).map(p => ({ id:p.id, full_name:p.full_name, school_id:p.school_id, ...summarize(p.school_id,p.id) })),
            weeks: [...new Set(calendar.filter(c => term === 'all' || c.term === Number(term)).map(c => c.week_number))].sort((a,b) => a-b),
        }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        console.error('[compliance] Overview failed', error);
        return json({ error: 'Unable to load compliance. Please retry.' }, { status: 503 });
    }
};
