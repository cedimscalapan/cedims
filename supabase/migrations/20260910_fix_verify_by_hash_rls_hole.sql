-- ============================================================================
-- SECURITY FIX: "Anyone can verify by hash" was implemented as
--     CREATE POLICY "Anyone can verify by hash" ON submissions FOR SELECT USING (true);
--
-- RLS policies are evaluated per-row and combined with OR across all
-- permissive policies on the same command. A `USING (true)` SELECT policy
-- does not (and cannot) restrict itself to "only when the query filters by
-- file_hash" — Postgres has no way to see the client's WHERE clause from
-- inside a row policy. In practice this meant ANY authenticated (and
-- possibly anonymous) request could run
--     supabase.from('submissions').select('*')
-- with no filter at all and receive every row in the table — including
-- other teachers' file paths, raw OCR text, and compliance data — because
-- this one policy alone was enough to satisfy RLS regardless of the other,
-- correctly-scoped policies (Teachers own rows only, School Head/Master
-- Teacher same school, District Supervisor same district).
--
-- The public "scan a QR code to verify" feature only ever needs a single
-- row's worth of already-non-sensitive verification fields for one known
-- hash. That's exactly what a SECURITY DEFINER function is for: it runs
-- with the privileges of its owner (bypassing RLS internally) but only
-- exposes the narrow, specific result its own SQL asks for — a client can
-- never turn it into an unfiltered table dump.
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can verify by hash" ON submissions;

CREATE OR REPLACE FUNCTION verify_submission_by_hash(p_hash TEXT)
RETURNS TABLE (
    file_name TEXT,
    file_path TEXT,
    doc_type TEXT,
    compliance_status TEXT,
    created_at TIMESTAMPTZ,
    file_size INTEGER,
    week_number INTEGER,
    subject TEXT,
    school_year TEXT,
    uploader_id UUID,
    teacher_name TEXT,
    uploader_school_id UUID,
    school_name TEXT,
    teaching_load_subject TEXT,
    teaching_load_grade TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT
        s.file_name,
        s.file_path,
        s.doc_type,
        s.compliance_status,
        s.created_at,
        s.file_size,
        s.week_number,
        s.subject,
        s.school_year,
        s.user_id AS uploader_id,
        p.full_name AS teacher_name,
        p.school_id AS uploader_school_id,
        sch.name AS school_name,
        tl.subject AS teaching_load_subject,
        tl.grade_level AS teaching_load_grade
    FROM submissions s
    LEFT JOIN profiles p ON p.id = s.user_id
    LEFT JOIN schools sch ON sch.id = p.school_id
    LEFT JOIN teaching_loads tl ON tl.id = s.teaching_load_id
    WHERE s.file_hash = p_hash
    LIMIT 1;
$$;

-- The verification page is intentionally public (per the landing page copy:
-- "Anyone can scan the code to verify document authenticity"), so both
-- anonymous visitors and signed-in users may call this function. It cannot
-- be used to enumerate or dump data — it only ever returns the single row
-- matching the exact hash passed in.
GRANT EXECUTE ON FUNCTION verify_submission_by_hash(TEXT) TO anon, authenticated;

-- ============================================================================
-- The dropped policy was ALSO the only thing letting the app's cross-teacher
-- duplicate-content check work: "reject files that have already been
-- archived" (by anyone, not just the current uploader) genuinely needs to
-- look up a hash regardless of who owns the row. With that policy gone, an
-- authenticated Teacher's own query is limited to their own rows (correct —
-- that's what fixed the leak), so this legitimate check needs the same
-- narrow-RPC treatment: authenticated-only, and it returns just enough to
-- show "this was already archived", never the full row.
-- ============================================================================

CREATE OR REPLACE FUNCTION check_duplicate_submission_hash(p_hash TEXT)
RETURNS TABLE (
    id UUID,
    file_name TEXT,
    doc_type TEXT,
    week_number INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT s.id, s.file_name, s.doc_type, s.week_number
    FROM submissions s
    WHERE s.file_hash = p_hash
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION check_duplicate_submission_hash(TEXT) TO authenticated;
