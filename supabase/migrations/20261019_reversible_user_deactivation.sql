-- Reversible user deactivation: preserve profiles, teaching-load history, and
-- submissions while removing deactivated users and their active loads from
-- compliance. Only loads that this operation disables are restored later.

alter table public.teaching_loads
    add column if not exists disabled_by_user_deactivation boolean not null default false;

create or replace function public.set_user_active_status(
    p_user_id uuid,
    p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_admin_role text;
    v_admin_active boolean;
begin
    select role, is_active
      into v_admin_role, v_admin_active
      from public.profiles
     where id = auth.uid();

    if v_admin_role is distinct from 'Admin' or v_admin_active is false then
        raise exception 'Only an active Admin can change user status.'
            using errcode = '42501';
    end if;

    if p_user_id is null or p_is_active is null then
        raise exception 'A user and target status are required.'
            using errcode = '22023';
    end if;

    if p_user_id = auth.uid() and not p_is_active then
        raise exception 'An Admin cannot deactivate their own account.'
            using errcode = '22023';
    end if;

    if not exists (select 1 from public.profiles where id = p_user_id) then
        raise exception 'User profile not found.'
            using errcode = 'P0002';
    end if;

    if p_is_active then
        update public.profiles
           set is_active = true
         where id = p_user_id;

        update public.teaching_loads
           set is_active = true,
               disabled_by_user_deactivation = false
         where user_id = p_user_id
           and disabled_by_user_deactivation = true;
    else
        -- Record which loads are being suspended so a later reactivation
        -- does not accidentally revive loads that were already inactive.
        update public.teaching_loads
           set is_active = false,
               disabled_by_user_deactivation = true
         where user_id = p_user_id
           and is_active = true;

        update public.profiles
           set is_active = false
         where id = p_user_id;
    end if;
end;
$$;

revoke all on function public.set_user_active_status(uuid, boolean) from public;
grant execute on function public.set_user_active_status(uuid, boolean) to authenticated;

-- The downloadable compliance report must follow the same active-account
-- scope as the live Compliance screens. Archives remain unfiltered.
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
     where p.id = auth.uid()
       and p.is_active is distinct from false;

    if v_role is null then
        raise exception 'Not authorized';
    end if;

    v_sy := coalesce(p_school_year, public.get_current_school_year());

    return query
    select t.full_name,
           sch.name,
           d.name,
           s.doc_type,
           s.week_number,
           s.school_year,
           s.compliance_status,
           s.created_at
      from public.submissions s
      join public.profiles t on t.id = s.user_id
      left join public.schools sch on sch.id = t.school_id
      left join public.districts d on d.id = sch.district_id
     where s.school_year = v_sy
       and t.is_active is distinct from false
       and (
            (v_role in ('School Head', 'Master Teacher') and t.school_id = v_school_id)
         or (v_role = 'District Supervisor' and (v_district_id is null or sch.district_id = v_district_id))
       )
     order by d.name, sch.name, t.full_name, s.week_number;
end;
$$;

revoke all on function public.get_compliance_report_rows(text) from public;
grant execute on function public.get_compliance_report_rows(text) to authenticated;

notify pgrst, 'reload schema';
