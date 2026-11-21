/** Saved-file facts for reports. Missing requirements are reported separately. */
import { hasRemarks } from './compliance';
export type SavedReportRow = {
    id?: string;
    doc_type?: string | null;
    compliance_status?: string | null;
    review_status?: string | null;
};

const knownStatuses = ['compliant', 'on-time', 'late', 'supplementary', 'extra'];
const knownTypes = ['DLL', 'DLP', 'ISP', 'ISR'];
const reviewableStatuses = new Set(knownStatuses);

export function savedStatusLabel(status: string): string {
    const name = status.replace(/[-_]/g, ' ').trim();
    return name ? name[0].toUpperCase() + name.slice(1) : 'Unspecified';
}

export function savedReviewStatus(row: SavedReportRow, review?: { status?: string | null; reviewer_comment?: string | null }): 'Checked' | 'For checking' | 'Not applicable' {
    const type = (row.doc_type || '').toUpperCase();
    const status = (row.compliance_status || '').toLowerCase();
    if (!['DLL', 'DLP'].includes(type) || !reviewableStatuses.has(status)) return 'Not applicable';
    return hasRemarks(review?.reviewer_comment) ? 'Checked' : 'For checking';
}

export function summarizeSavedReportRows(rows: SavedReportRow[]) {
    const statuses = new Map(knownStatuses.map(status => [status, 0]));
    const types = new Map(knownTypes.map(type => [type, 0]));
    let checked = 0;
    let forChecking = 0;
    let notApplicable = 0;
    for (const row of rows) {
        const status = (row.compliance_status || '').toLowerCase().trim() || 'unspecified';
        const type = (row.doc_type || '').toUpperCase().trim() || 'OTHER';
        statuses.set(status, (statuses.get(status) || 0) + 1);
        types.set(type, (types.get(type) || 0) + 1);
        if (row.review_status === 'Checked') checked++;
        else if (row.review_status === 'For checking') forChecking++;
        else notApplicable++;
    }
    const statusRows = [...statuses].map(([status, count]) => ({ status, label: savedStatusLabel(status), count }));
    const typeRows = [...types].map(([type, count]) => ({ type, count }));
    const knownCount = knownStatuses.reduce((sum, status) => sum + (statuses.get(status) || 0), 0);
    return {
        total: rows.length,
        statusRows,
        typeRows,
        onTime: (statuses.get('compliant') || 0) + (statuses.get('on-time') || 0),
        late: statuses.get('late') || 0,
        supplementary: (statuses.get('supplementary') || 0) + (statuses.get('extra') || 0),
        otherStatus: rows.length - knownCount,
        lessonPlans: (types.get('DLL') || 0) + (types.get('DLP') || 0),
        isp: types.get('ISP') || 0,
        isr: types.get('ISR') || 0,
        checked,
        forChecking,
        notApplicable,
    };
}
