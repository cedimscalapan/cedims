ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS term_number INTEGER CHECK (term_number BETWEEN 1 AND 3);

UPDATE submissions s
SET term_number = COALESCE(
    NULLIF((regexp_match(s.file_path, '(?:^|/)Term_([1-3])(?:/|$)'))[1], '')::INTEGER,
    ac.term
)
FROM academic_calendar ac
WHERE s.term_number IS NULL
  AND s.calendar_id = ac.id;

UPDATE submissions s
SET term_number = NULLIF((regexp_match(s.file_path, '(?:^|/)Term_([1-3])(?:/|$)', 'i'))[1], '')::INTEGER
WHERE s.term_number IS NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_term_week
ON submissions(term_number, week_number);

-- Week numbers repeat across terms. Unidentified legacy rows stay NULL.
CREATE INDEX IF NOT EXISTS idx_submissions_compliance_slot
ON submissions(school_year, teaching_load_id, term_number, week_number)
WHERE doc_type = 'DLL';
