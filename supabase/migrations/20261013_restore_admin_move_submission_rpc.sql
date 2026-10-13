-- Restore the exact Admin move RPC signature used by the archive UI.
-- Supabase PostgREST resolves RPC calls by parameter names, so production
-- must expose this 6-parameter function including p_compliance_status.

CREATE OR REPLACE FUNCTION public.admin_move_submission(
    p_submission_id uuid,
    p_teaching_load_id uuid,
    p_term_number integer,
    p_week_number integer,
    p_calendar_id uuid,
    p_compliance_status text
)
RETURNS public.submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_submission public.submissions;
    v_load public.teaching_loads;
    v_calendar public.academic_calendar;
    v_actor_role text;
BEGIN
    IF p_compliance_status NOT IN ('compliant', 'supplementary') THEN
        RAISE EXCEPTION 'Status must be compliant or supplementary';
    END IF;

    SELECT role INTO v_actor_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_actor_role <> 'Admin' THEN
        RAISE EXCEPTION 'Only Admin users can move archive files';
    END IF;

    SELECT *
    INTO v_submission
    FROM public.submissions
    WHERE id = p_submission_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Archive file not found';
    END IF;

    SELECT *
    INTO v_load
    FROM public.teaching_loads
    WHERE id = p_teaching_load_id
      AND user_id = v_submission.user_id
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Teaching load does not belong to the original uploader';
    END IF;

    SELECT *
    INTO v_calendar
    FROM public.academic_calendar
    WHERE id = p_calendar_id
      AND school_year = v_submission.school_year
      AND term = p_term_number
      AND week_number = p_week_number
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected term and week are not an open calendar slot';
    END IF;

    IF p_compliance_status = 'compliant' AND EXISTS (
        SELECT 1
        FROM public.submissions s
        WHERE s.id <> v_submission.id
          AND s.user_id = v_submission.user_id
          AND s.teaching_load_id = p_teaching_load_id
          AND s.school_year = v_submission.school_year
          AND s.term_number = p_term_number
          AND s.week_number = p_week_number
          AND s.doc_type IN ('DLL', 'DLP')
          AND s.compliance_status IN ('compliant', 'late')
    ) THEN
        RAISE EXCEPTION 'A counted upload already exists for this teaching load, term, and week';
    END IF;

    UPDATE public.submissions
    SET teaching_load_id = p_teaching_load_id,
        subject = v_load.subject,
        term_number = p_term_number,
        week_number = p_week_number,
        calendar_id = p_calendar_id,
        compliance_status = p_compliance_status
    WHERE id = v_submission.id
    RETURNING * INTO v_submission;

    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    VALUES (
        auth.uid(),
        'archive.moved',
        'submission',
        v_submission.id::text,
        jsonb_build_object(
            'original_uploader', v_submission.user_id,
            'teaching_load_id', p_teaching_load_id,
            'term_number', p_term_number,
            'week_number', p_week_number,
            'compliance_status', p_compliance_status
        )
    );

    RETURN v_submission;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_move_submission(uuid, uuid, integer, integer, uuid, text)
TO authenticated;
