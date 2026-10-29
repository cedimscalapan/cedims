-- Make the six Kindergarten learning areas available in the teaching-load picker.
ALTER TABLE public.curriculum_subjects
  DROP CONSTRAINT IF EXISTS curriculum_subjects_grade_level_check;

ALTER TABLE public.curriculum_subjects
  ADD CONSTRAINT curriculum_subjects_grade_level_check
  CHECK (grade_level IN ('Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'));

INSERT INTO public.curriculum_subjects (grade_level, subject, sort_order) VALUES
  ('Kinder', 'Literacy, Language, and Communication', 1),
  ('Kinder', 'Socio-Emotional Development', 2),
  ('Kinder', 'Values Development', 3),
  ('Kinder', 'Physical Health and Motor Development', 4),
  ('Kinder', 'Aesthetic/Creative Development', 5),
  ('Kinder', 'Cognitive Development', 6)
ON CONFLICT (grade_level, subject) DO UPDATE
SET sort_order = EXCLUDED.sort_order;
