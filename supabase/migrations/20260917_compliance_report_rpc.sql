-- =============================================================================
-- Flat compliance-report rows, for the Google Apps Script Sheets export.
--
-- Same security-scoping convention as get_analytics_comparison() (see
-- 20260821_analytics_aggregate_functions.sql): SECURITY DEFINER, and the
-- caller's own profile (looked up via auth.uid()) decides what they can see
-- — School Head / Master Teacher get their own school, District Supervisor
-- gets their own district, or every district when their district_id is
-- NULL. That last case is what lets a dedicated reporting account (role =
-- 'District Supervisor', district_id = NULL) see everything without ever
-- touching the service_role key — it's the same fallthrough
-- get_analytics_comparison() already relies on for a district-wide view.
--
-- Apply with:  supabase db push   (or paste into the SQL editor of the dashboard)
-- =============================================================================

create or replace function public.get_compliance_report_rows(p_school_year text default null)
returns table (
    teacher_name      text,
    school_name       text,
    district_name     text,
    doc_type          text,
    week_number       integer,
    school_year       text,
    compliance_status text,
    submitted_at      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role        text;
    v_school_id   uuid;
    v_district_id uuid;
    v_sy          text;
begin
    select p.role, p.school_id, p.district_id
      into v_role, v_school_id, v_district_id
      from public.profiles p
     where p.id = auth.uid();

    if v_role is null then
        raise exception 'Not authorized';
    end if;

    v_sy := coalesce(p_school_year, public.get_current_school_year());

    return query
    select
        t.full_name  as teacher_name,
        sch.name     as school_name,
        d.name       as district_name,
        s.doc_type,
        s.week_number,
        s.school_year,
        s.compliance_status,
        s.created_at as submitted_at
      from public.submissions s
      join public.profiles t         on t.id = s.user_id
      left join public.schools sch   on sch.id = t.school_id
      left join public.districts d   on d.id = sch.district_id
     where s.school_year = v_sy
       and (
                (v_role in ('School Head', 'Master Teacher') and t.school_id = v_school_id)
            or  (v_role = 'District Supervisor' and (v_district_id is null or sch.district_id = v_district_id))
       )
     order by d.name, sch.name, t.full_name, s.week_number;
end;
$$;

revoke execute on function public.get_compliance_report_rows(text) from public;
grant  execute on function public.get_compliance_report_rows(text) to authenticated;
