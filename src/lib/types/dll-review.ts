// ═══════════════════════════════════════════════════════════════
// DLL Review & Annotation System — TypeScript Types
// CEDIMS — Type-safe workflow
// ═══════════════════════════════════════════════════════════════

export type AnnotationType = 'highlight' | 'comment' | 'mark' | 'flag';
export type ReviewStatus = 'submitted' | 'needs-check' | 'returned' | 'approved';
export type AuditAction = 'uploaded' | 'annotated' | 'reviewed' | 'approved' | 'returned' | 'exported';
export type ExportFormat = 'pdf' | 'csv' | 'xlsx';

// ─── Annotation (Digitized pen/comment) ──────────────────────

export interface DLLAnnotation {
    id: string;
    submission_id: string;
    annotator_id: string;
    annotation_type: AnnotationType;
    content: string;
    page_number?: number;
    position?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    color: string;
    is_official: boolean;
    created_at: string;
    updated_at: string;
}

export interface CreateAnnotationInput {
    submission_id: string;
    annotation_type: AnnotationType;
    content: string;
    page_number?: number;
    position?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    color?: string;
    is_official?: boolean;
}

// ─── Review (Status, approval, workflow) ────────────────────

export interface DLLReview {
    id: string;
    submission_id: string;
    reviewer_id: string;
    status: ReviewStatus;
    reviewer_comment?: string;
    return_reason?: string;
    approved_at?: string;
    returned_at?: string;
    file_hash_at_review?: string;
    created_at: string;
    updated_at: string;
}

export interface CreateReviewInput {
    submission_id: string;
    status: 'needs-check' | 'reviewed'; // Initial status
    reviewer_comment?: string;
}

export interface SaveReviewCommentInput {
    submission_id: string;
    reviewer_comment: string;
}

export interface ApproveReviewInput {
    review_id: string;
}

export interface ReturnReviewInput {
    review_id: string;
    return_reason: string;
}

// ─── Audit Log (Immutable trail) ────────────────────────────

export interface DLLAuditLog {
    id: string;
    submission_id: string;
    action: AuditAction;
    actor_id: string;
    actor_role: string;
    details?: {
        annotation_id?: string;
        review_id?: string;
        export_format?: ExportFormat;
        reason?: string;
    };
    file_hash?: string;
    signature_hash?: string;
    created_at: string;
}

export interface CreateAuditLogInput {
    submission_id: string;
    action: AuditAction;
    actor_id: string;
    actor_role: string;
    details?: Record<string, any>;
    file_hash?: string;
}

// ─── File Version (Track revisions) ──────────────────────────

export interface DLLFileVersion {
    id: string;
    submission_id: string;
    file_hash: string;
    file_path: string;
    file_size: number;
    uploaded_by: string;
    version_number: number;
    reason?: string;
    created_at: string;
}

// ─── Export Template (DepEd reporting) ───────────────────────

export interface DLLExportTemplate {
    id: string;
    name: string;
    description?: string;
    format: ExportFormat;
    include_annotations: boolean;
    include_audit_trail: boolean;
    include_reviews: boolean;
    created_by?: string;
    created_at: string;
}

// ─── Submission with Review Context ──────────────────────────

export interface SubmissionWithReview {
    id: string;
    user_id: string;
    file_name: string;
    file_path: string;
    file_hash: string;
    doc_type: string;
    week_number: number;
    subject: string;
    compliance_status: string;
    file_size?: number;
    created_at: string;
    updated_at: string;
    review?: DLLReview;
    annotations?: DLLAnnotation[];
    audit_logs?: DLLAuditLog[];
    file_versions?: DLLFileVersion[];
}

// ─── Review Summary (Dashboard view) ─────────────────────────

export interface ReviewSummary {
    total_submissions: number;
    pending_review: number;
    approved: number;
    returned: number;
    compliance_rate: number;
    recent_activity: DLLAuditLog[];
}
