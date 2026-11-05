-- A leave request now covers a teacher's whole load for chosen school days.
-- Older rows stay valid: they name one teaching load, term and week.
ALTER TABLE submission_leave_requests
    ALTER COLUMN teaching_load_id DROP NOT NULL,
    ALTER COLUMN term_number DROP NOT NULL,
    ALTER COLUMN week_number DROP NOT NULL;

ALTER TABLE submission_leave_requests
    DROP CONSTRAINT IF EXISTS leave_request_scope_check;
ALTER TABLE submission_leave_requests
    ADD CONSTRAINT leave_request_scope_check CHECK (
        (teaching_load_id IS NOT NULL AND term_number IS NOT NULL AND week_number IS NOT NULL)
        OR (
            teaching_load_id IS NULL AND term_number IS NULL AND week_number IS NULL
            AND start_date IS NOT NULL AND end_date IS NOT NULL AND start_date <= end_date
            AND EXTRACT(ISODOW FROM start_date) BETWEEN 1 AND 5
            AND EXTRACT(ISODOW FROM end_date) BETWEEN 1 AND 5
        )
    );

CREATE INDEX IF NOT EXISTS idx_leave_requests_user_dates
ON submission_leave_requests(user_id, start_date, end_date)
WHERE teaching_load_id IS NULL;

-- Nobody approves their own leave. A Master Teacher's request goes to the
-- School Head or another Master Teacher in the same school.
DROP POLICY IF EXISTS "Reviewers can decide leave requests" ON submission_leave_requests;
CREATE POLICY "Reviewers can decide leave requests"
ON submission_leave_requests FOR UPDATE TO authenticated
USING (
    submission_leave_requests.user_id <> auth.uid()
    AND (
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
)
WITH CHECK (
    status IN ('approved', 'rejected', 'pending')
    AND reviewer_id = auth.uid()
    AND submission_leave_requests.user_id <> auth.uid()
);

-- Teachers may withdraw their own request while it is still undecided.
DROP POLICY IF EXISTS "Teachers can cancel own pending leave requests" ON submission_leave_requests;
CREATE POLICY "Teachers can cancel own pending leave requests"
ON submission_leave_requests FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id AND status = 'cancelled');
