-- Keep the Admin move RPC compatible with databases where grade_level exists
-- only on teaching_loads. The archive grade is derived from the selected load.

create or replace function public.admin_move_submission(
    p_submission_id uuid,
    p_teaching_load_id uuid,
    p_term_number integer,
    p_week_number integer,
    p_calendar_id uuid
)
returns public.submissions
language plpgsql
security definer
set search_path = public
as $$
declare
    v_submission public.submissions;
    v_load public.teaching_loads;
    v_calendar public.academic_calendar;
    v_actor_role text;
begin
    select role into v_actor_role from public.profiles where id = auth.uid();
    if v_actor_role <> 'Admin' then raise exception 'Only Admin users can move archive files'; end if;
    select * into v_submission from public.submissions where id = p_submission_id for update;
    if not found then raise exception 'Archive file not found'; end if;
    select * into v_load from public.teaching_loads
    where id = p_teaching_load_id and user_id = v_submission.user_id and is_active = true;
    if not found then raise exception 'Teaching load does not belong to the original uploader'; end if;
    select * into v_calendar from public.academic_calendar
    where id = p_calendar_id and school_year = v_submission.school_year
      and term = p_term_number and week_number = p_week_number and is_active = true;
    if not found then raise exception 'Selected term and week are not an open calendar slot'; end if;
    if exists (
        select 1 from public.submissions s
        where s.id <> v_submission.id and s.user_id = v_submission.user_id
          and s.teaching_load_id = p_teaching_load_id
          and s.school_year = v_submission.school_year
          and s.term_number = p_term_number and s.week_number = p_week_number
          and s.doc_type in ('DLL','DLP')
          and s.compliance_status in ('compliant','late')
    ) then raise exception 'A counted upload already exists for this teaching load, term, and week'; end if;
    update public.submissions
    set teaching_load_id = p_teaching_load_id, subject = v_load.subject,
        term_number = p_term_number, week_number = p_week_number, calendar_id = p_calendar_id
    where id = v_submission.id returning * into v_submission;
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'archive.moved', 'submission', v_submission.id::text,
        jsonb_build_object('original_uploader', v_submission.user_id,
            'teaching_load_id', p_teaching_load_id, 'term_number', p_term_number,
            'week_number', p_week_number));
    return v_submission;
end;
$$;

grant execute on function public.admin_move_submission(uuid, uuid, integer, integer, uuid) to authenticated;
