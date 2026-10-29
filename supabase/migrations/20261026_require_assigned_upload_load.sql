-- Enforce the same rule for direct uploads, background sync, and older clients.
CREATE OR REPLACE FUNCTION public.require_assigned_submission_load()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE assigned public.teaching_loads%ROWTYPE;
BEGIN
  IF NEW.doc_type IN ('DLL', 'DLP') THEN
    SELECT * INTO assigned FROM public.teaching_loads
      WHERE id = NEW.teaching_load_id AND user_id = NEW.user_id AND is_active = true;
    IF NOT FOUND OR assigned.grade_level IS NULL OR
       upper(trim(assigned.grade_level::text)) !~ '^(GRADE[[:space:]]*|BAITANG[[:space:]]*)?([1-6]|I|II|III|IV|V|VI)$' OR
       nullif(trim(assigned.subject), '') IS NULL THEN
      RAISE EXCEPTION 'Select an active assigned teaching load with a valid grade before uploading.' USING ERRCODE = '23514';
    END IF;
    -- Archive folders must follow the selected assignment, never the OCR label.
    NEW.subject := assigned.subject;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS require_assigned_submission_load ON public.submissions;
CREATE TRIGGER require_assigned_submission_load
BEFORE INSERT OR UPDATE OF teaching_load_id, user_id, doc_type, subject ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.require_assigned_submission_load();
