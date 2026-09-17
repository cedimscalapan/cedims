/*
  MIGRATION: Allow Multiple Uploads Per Week
  Description: Removes the unique constraints that enforce one upload per 
               teaching load per week. Multiple DLLs can now be uploaded for 
               the same week/subject. Compliance tracking still expects at 
               least one per week.
*/

-- Drop the unique constraint that was enforcing single-upload policy
ALTER TABLE public.submissions
DROP CONSTRAINT IF EXISTS unique_submission_per_load_week;

-- Drop unique index (created separately or via dashboard)
DROP INDEX IF EXISTS idx_submissions_user_slot_doc;

-- Drop the associated query index (optional cleanup)
DROP INDEX IF EXISTS idx_submissions_load_week;
