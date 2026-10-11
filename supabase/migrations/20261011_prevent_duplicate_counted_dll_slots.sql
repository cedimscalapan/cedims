-- Prevent two counted DLL/DLP submissions for the same teacher load and calendar slot.
-- Supplementary uploads remain allowed because they are excluded from this partial index.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_counted_dll_slot
ON submissions (
    user_id,
    teaching_load_id,
    school_year,
    term_number,
    week_number
)
WHERE teaching_load_id IS NOT NULL
  AND doc_type IN ('DLL', 'DLP')
  AND compliance_status IN ('compliant', 'late');
