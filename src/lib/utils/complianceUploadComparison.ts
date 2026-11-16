import type { ComplianceSubmission } from './compliance';

type Upload = Pick<ComplianceSubmission, 'user_id'>;
type Uploader = { id: string; full_name: string; school_id: string; role?: string | null };
type School = { id: string; name: string };

/** Counts confirmed, already period-filtered uploads by the uploader's school. */
export function uploadsBySchool(uploads: Upload[], uploaders: Uploader[], schools: School[]) {
    const schoolByUser = new Map(uploaders.map(user => [user.id, user.school_id]));
    const counts = new Map(schools.map(school => [school.id, 0]));
    for (const upload of uploads) {
        const schoolId = schoolByUser.get(upload.user_id || '');
        if (schoolId && counts.has(schoolId)) counts.set(schoolId, (counts.get(schoolId) || 0) + 1);
    }
    return schools.map(school => ({ id: school.id, label: school.name, value: counts.get(school.id) || 0 }));
}

/** One slice per Teacher or Master Teacher, including people with zero uploads. */
export function uploadsByTeacher(uploads: Upload[], uploaders: Uploader[]) {
    const people = uploaders.filter(user => user.role === 'Teacher' || user.role === 'Master Teacher')
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    const counts = new Map(people.map(user => [user.id, 0]));
    for (const upload of uploads) {
        const userId = upload.user_id || '';
        if (counts.has(userId)) counts.set(userId, (counts.get(userId) || 0) + 1);
    }
    return people.map(user => ({ id: user.id, label: user.full_name, role: user.role, value: counts.get(user.id) || 0 }));
}
