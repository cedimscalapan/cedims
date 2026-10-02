CREATE TABLE IF NOT EXISTS submission_leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    teaching_load_id UUID NOT NULL REFERENCES teaching_loads(id) ON DELETE CASCADE,
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    district_id UUID REFERENCES districts(id) ON DELETE CASCADE,
    school_year TEXT NOT NULL,
    term_number INTEGER NOT NULL CHECK (term_number BETWEEN 1 AND 3),
    week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 52),
    leave_type TEXT NOT NULL DEFAULT 'Leave',
    reason TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    reviewer_id UUID REFERENCES profiles(id),
    reviewer_comment TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, teaching_load_id, school_year, term_number, week_number)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_user_period
ON submission_leave_requests(user_id, school_year, term_number, week_number);

CREATE INDEX IF NOT EXISTS idx_leave_requests_school_status
ON submission_leave_requests(school_id, status);

CREATE INDEX IF NOT EXISTS idx_leave_requests_district_status
ON submission_leave_requests(district_id, status);

ALTER TABLE submission_leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers can create own leave requests" ON submission_leave_requests;
CREATE POLICY "Teachers can create own leave requests"
ON submission_leave_requests FOR INSERT TO authenticated
WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND EXISTS (
        SELECT 1
        FROM profiles p
        WHERE p.id = auth.uid()
          AND p.school_id = submission_leave_requests.school_id
          AND p.district_id = submission_leave_requests.district_id
    )
);

DROP POLICY IF EXISTS "Teachers can view own leave requests" ON submission_leave_requests;
CREATE POLICY "Teachers can view own leave requests"
ON submission_leave_requests FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "School reviewers can view school leave requests" ON submission_leave_requests;
CREATE POLICY "School reviewers can view school leave requests"
ON submission_leave_requests FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles reviewer
        WHERE reviewer.id = auth.uid()
          AND reviewer.role IN ('School Head', 'Master Teacher')
          AND reviewer.school_id = submission_leave_requests.school_id
    )
    OR EXISTS (
        SELECT 1
        FROM profiles reviewer
        WHERE reviewer.id = auth.uid()
          AND reviewer.role = 'District Supervisor'
          AND reviewer.district_id = submission_leave_requests.district_id
    )
);

DROP POLICY IF EXISTS "Reviewers can decide leave requests" ON submission_leave_requests;
CREATE POLICY "Reviewers can decide leave requests"
ON submission_leave_requests FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles reviewer
        WHERE reviewer.id = auth.uid()
          AND reviewer.role IN ('School Head', 'Master Teacher')
          AND reviewer.school_id = submission_leave_requests.school_id
    )
    OR EXISTS (
        SELECT 1
        FROM profiles reviewer
        WHERE reviewer.id = auth.uid()
          AND reviewer.role = 'District Supervisor'
          AND reviewer.district_id = submission_leave_requests.district_id
    )
)
WITH CHECK (
    status IN ('approved', 'rejected', 'pending')
    AND reviewer_id = auth.uid()
);
