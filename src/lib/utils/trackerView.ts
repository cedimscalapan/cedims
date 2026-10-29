import type { Requirement } from './compliance';
import { effectiveDeadlineForSubject } from './deadlineRules';

export function trackerLabel(row: Requirement, open: boolean): string {
    if (row.status === 'on-time') return 'Submitted · On time';
    if (row.status === 'late') return 'Submitted · Late';
    if (row.status === 'on-leave') return 'Leave approved';
    if (row.status === 'leave-requested') return 'Leave pending';
    if (row.status === 'leave-rejected') return open ? 'Leave declined' : 'Closed · Leave declined';
    return open ? (row.status === 'missing' ? 'Overdue · Open' : 'Pending') : 'Closed';
}

export function prioritizeTrackerRows<T extends Requirement>(rows: T[]): T[] {
    const rank = (row: Requirement) => row.submission || row.status === 'on-leave' ? 2 : 0;
    return [...rows].sort((a, b) => rank(a) - rank(b) ||
        effectiveDeadlineForSubject(a.calendar.deadline_date, a.load.subject, a.load.school_name).getTime() -
        effectiveDeadlineForSubject(b.calendar.deadline_date, b.load.subject, b.load.school_name).getTime() ||
        a.load.subject.localeCompare(b.load.subject));
}

export type ReviewEntry = { id: string; submission_id: string; reviewer_id: string; reviewer_name: string; reviewer_role: string; status: string; comment: string; created_at: string };
export function currentDocumentReview(entries: ReviewEntry[]): ReviewEntry | undefined {
    return [...entries].sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
}
export function documentReviewLabel(entries: ReviewEntry[]): string {
    return entries.length ? 'Checked' : 'For checking';
}

export function validateReview(status: string, comment: string): string | null {
    if (status !== 'checked') return 'Documents may be marked Checked only. Revision and resubmission are not required.';
    if (comment.trim().length > 5000) return 'Keep remarks within 5,000 characters.';
    return null;
}
