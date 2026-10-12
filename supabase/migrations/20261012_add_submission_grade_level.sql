-- Archive records need to retain the selected teaching-load grade so the
-- Admin correction path can update the archive location without losing the
-- original file metadata.

ALTER TABLE public.submissions
    ADD COLUMN IF NOT EXISTS grade_level text;

UPDATE public.submissions s
SET grade_level = tl.grade_level
FROM public.teaching_loads tl
WHERE s.teaching_load_id = tl.id
  AND (s.grade_level IS NULL OR btrim(s.grade_level) = '');

CREATE INDEX IF NOT EXISTS idx_submissions_grade_level
    ON public.submissions (grade_level);
