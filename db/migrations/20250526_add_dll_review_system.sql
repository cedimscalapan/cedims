-- ═══════════════════════════════════════════════════════════════
-- DLL Review & Annotation System — Database Migrations
-- Smart E-VISION 2.0 — Modernized Workflow
-- ═══════════════════════════════════════════════════════════════

-- ─── DLL ANNOTATIONS (Digitized pen/comments layer) ────────────

CREATE TABLE IF NOT EXISTS dll_annotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE NOT NULL,
    annotator_id UUID REFERENCES profiles(id) NOT NULL,
    annotation_type TEXT NOT NULL CHECK (annotation_type IN ('highlight', 'comment', 'mark', 'flag')),
    content TEXT NOT NULL,
    page_number INTEGER,
    position JSONB, -- { x, y, width, height } for PDF viewer
    color TEXT DEFAULT '#FFFF00', -- yellow for highlight, etc.
    is_official BOOLEAN DEFAULT FALSE, -- Teacher vs Reviewer
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dll_annotations_submission ON dll_annotations(submission_id);
CREATE INDEX idx_dll_annotations_annotator ON dll_annotations(annotator_id);

-- ─── DLL REVIEWS (Status, approval, workflow) ────────────────

CREATE TABLE IF NOT EXISTS dll_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE NOT NULL,
    reviewer_id UUID REFERENCES profiles(id) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('submitted', 'needs-check', 'returned', 'approved')) DEFAULT 'needs-check',
    reviewer_comment TEXT,
    return_reason TEXT, -- If status = returned
    approved_at TIMESTAMPTZ,
    returned_at TIMESTAMPTZ,
    file_hash_at_review TEXT, -- Immutable record of file version reviewed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(submission_id) -- One active review per submission
);

CREATE INDEX idx_dll_reviews_submission ON dll_reviews(submission_id);
CREATE INDEX idx_dll_reviews_reviewer ON dll_reviews(reviewer_id);
CREATE INDEX idx_dll_reviews_status ON dll_reviews(status);

-- ─── DLL AUDIT LOGS (Immutable, signed, tamper-proof) ────────

CREATE TABLE IF NOT EXISTS dll_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('uploaded', 'annotated', 'reviewed', 'approved', 'returned', 'exported')),
    actor_id UUID REFERENCES profiles(id) NOT NULL,
    actor_role TEXT NOT NULL,
    details JSONB, -- {annotation_id, review_id, export_format, reason}
    file_hash TEXT, -- Immutable hash of file at time of action
    signature_hash TEXT, -- HMAC for tamper detection
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dll_audit_logs_submission ON dll_audit_logs(submission_id);
CREATE INDEX idx_dll_audit_logs_actor ON dll_audit_logs(actor_id);
CREATE INDEX idx_dll_audit_logs_action ON dll_audit_logs(action);
CREATE INDEX idx_dll_audit_logs_created ON dll_audit_logs(created_at);

-- ─── FILE VERSIONS (Track submission revisions) ──────────────

CREATE TABLE IF NOT EXISTS dll_file_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE NOT NULL,
    file_hash TEXT NOT NULL UNIQUE,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    uploaded_by UUID REFERENCES profiles(id) NOT NULL,
    version_number INTEGER NOT NULL,
    reason TEXT, -- 'resubmission', 'revision', etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dll_file_versions_submission ON dll_file_versions(submission_id);
CREATE INDEX idx_dll_file_versions_hash ON dll_file_versions(file_hash);

-- ─── EXPORT TEMPLATES (For DepEd reporting) ──────────────────

CREATE TABLE IF NOT EXISTS dll_export_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    format TEXT CHECK (format IN ('pdf', 'csv', 'xlsx')),
    include_annotations BOOLEAN DEFAULT TRUE,
    include_audit_trail BOOLEAN DEFAULT TRUE,
    include_reviews BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ROW LEVEL SECURITY (RLS) ───────────────────────────────

ALTER TABLE dll_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dll_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE dll_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dll_file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dll_export_templates ENABLE ROW LEVEL SECURITY;

-- Annotations: Teachers can view own, reviewers can view all for their submissions
CREATE POLICY "Annotations viewable by involved parties"
    ON dll_annotations FOR SELECT
    USING (
        auth.uid() = annotator_id OR
        EXISTS (
            SELECT 1 FROM dll_reviews dr
            WHERE dr.submission_id = dll_annotations.submission_id
            AND dr.reviewer_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM submissions s
            WHERE s.id = dll_annotations.submission_id
            AND s.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create annotations on own submissions or as reviewer"
    ON dll_annotations FOR INSERT
    WITH CHECK (
        auth.uid() = annotator_id AND (
            EXISTS (
                SELECT 1 FROM submissions s
                WHERE s.id = dll_annotations.submission_id
                AND s.user_id = auth.uid()
            ) OR
            EXISTS (
                SELECT 1 FROM dll_reviews dr
                WHERE dr.submission_id = dll_annotations.submission_id
                AND dr.reviewer_id = auth.uid()
            )
        )
    );

-- Reviews: Reviewers can view/update own, supervisors can view all
CREATE POLICY "Reviews viewable by involved parties"
    ON dll_reviews FOR SELECT
    USING (
        auth.uid() = reviewer_id OR
        EXISTS (
            SELECT 1 FROM submissions s
            WHERE s.id = dll_reviews.submission_id
            AND s.user_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('District Supervisor', 'School Head', 'Master Teacher')
        )
    );

CREATE POLICY "Reviewers can create/update own reviews"
    ON dll_reviews FOR ALL
    USING (auth.uid() = reviewer_id)
    WITH CHECK (auth.uid() = reviewer_id);

-- Audit logs: Immutable, viewable by involved parties and supervisors
CREATE POLICY "Audit logs viewable by involved parties"
    ON dll_audit_logs FOR SELECT
    USING (
        auth.uid() = actor_id OR
        EXISTS (
            SELECT 1 FROM submissions s
            WHERE s.id = dll_audit_logs.submission_id
            AND s.user_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('District Supervisor', 'School Head', 'Master Teacher')
        )
    );

CREATE POLICY "Audit logs insert only (immutable)"
    ON dll_audit_logs FOR INSERT
    WITH CHECK (auth.uid() = actor_id);

-- File versions: Teachers can view own, supervisors can view all
CREATE POLICY "File versions viewable by involved parties"
    ON dll_file_versions FOR SELECT
    USING (
        auth.uid() = uploaded_by OR
        EXISTS (
            SELECT 1 FROM submissions s
            WHERE s.id = dll_file_versions.submission_id
            AND s.user_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('District Supervisor', 'School Head', 'Master Teacher')
        )
    );

-- Export templates: Authenticated users can view, supervisors can manage
CREATE POLICY "Export templates viewable by all authenticated"
    ON dll_export_templates FOR SELECT
    USING (true);

CREATE POLICY "Supervisors can manage export templates"
    ON dll_export_templates FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'District Supervisor'
        )
    );

-- ═══════════════════════════════════════════════════════════════
-- Insert default export templates for DepEd compliance
-- ═══════════════════════════════════════════════════════════════

INSERT INTO dll_export_templates (name, description, format, include_annotations, include_audit_trail, include_reviews)
VALUES
    ('Complete DLL Report', 'Full submission with annotations, reviews, and audit trail', 'pdf', TRUE, TRUE, TRUE),
    ('Teacher Summary', 'DLL file with teacher annotations only', 'pdf', TRUE, FALSE, FALSE),
    ('Compliance Report', 'CSV export for DepEd compliance verification', 'csv', FALSE, FALSE, TRUE),
    ('Audit Trail Export', 'Complete audit history for accountability', 'xlsx', FALSE, TRUE, FALSE)
ON CONFLICT (name) DO NOTHING;
