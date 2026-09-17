/* 
  MIGRATION: Strict One-Upload-Per-Week Policy
  Description: Enforces a unique constraint on submissions to prevent multiple uploads 
               for the same teaching load within a single academic week.
*/

-- Step 1: Remove any potential duplicates before applying the constraint
-- (Keeps only the most recent submission if duplicates currently exist)
DELETE FROM public.submissions a
USING public.submissions b
WHERE a.id < b.id
AND a.teaching_load_id = b.teaching_load_id
AND a.week_number = b.week_number
AND a.school_year = b.school_year;

-- Step 2: Add the unique constraint
-- Note: We include school_year to allow the same load IDs to be reused in different years
ALTER TABLE public.submissions
ADD CONSTRAINT unique_submission_per_load_week 
UNIQUE (teaching_load_id, week_number, school_year);

-- Step 3: Add an index for faster lookups (redundant but good for performance)
CREATE INDEX IF NOT EXISTS idx_submissions_load_week 
ON public.submissions(teaching_load_id, week_number, school_year);
