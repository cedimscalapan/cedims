-- Align upload enforcement with Kinder teaching loads offered in the app.
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
       upper(trim(assigned.grade_level::text)) !~ '^(GRADE[[:space:]]*|BAITANG[[:space:]]*)?([1-6]|I|II|III|IV|V|VI|K|KINDER|KINDERGARTEN)$' OR
       nullif(trim(assigned.subject), '') IS NULL THEN
      RAISE EXCEPTION 'Select an active assigned teaching load with a valid grade before uploading.' USING ERRCODE = '23514';
    END IF;
    NEW.subject := assigned.subject;
  END IF;
  RETURN NEW;
END;
$$;
