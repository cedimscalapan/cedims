-- =============================================================================
-- Analytics scaling: push aggregation into the database instead of shipping the
-- whole submissions table to the browser.
--
-- These functions are SAFE on the free tier: they return only aggregate counts
-- (a handful of rows), dramatically reducing PostgREST payloads and egress vs
-- the previous client-side logic that fetched every submission row.
--
-- RLS: SECURITY DEFINER so the function can aggregate the whole (authorized)
-- scope; we manually scope by the caller's profile (role/school/district)
-- derived from auth.uid(). Execute is granted to `authenticated` only.
--
-- Apply with:  supabase db push   (or paste into the SQL editor of the dashboard)
-- =============================================================================

-- 1) School-year helper (matches src/lib/utils/schoolYear.ts; runs June–May)
create or replace function public.get_current_school_year()
returns text
language sql
immutable
set search_path = public
as $$
  select
    (   extract(year from now())
      + (case when extract(month from now()) >= 6 then 0 else -1 end)
    )::int::text
    || '-' ||
    (   extract(year from now())
      + (case when extract(month from now()) >= 6 then 1 else 0 end)
    )::int::text;
$$;

-- 2) Compliance comparison aggregate.
--    - School Head / Master Teacher  -> rows per Teacher (their own school)
--    - District Supervisor           -> rows per School (their district)
--    - Returns:
--      id, name, compliant, late, noncompliant, expected, rate
--    Semantics match the old JS pipeline in analytics/+page.svelte:
--      dedup submissions by (teaching_load_id, week_number, doc_type),
--      prefer non-supplementary, then latest created_at; count compliant/late;
--      expected = teaching_loads_count * defined_weeks; noncompliant & rate derived.
create or replace function public.get_analytics_comparison()
returns table (
    id          uuid,
    name        text,
    compliant   bigint,
    late        bigint,
    noncompliant bigint,
    expected    bigint,
    rate        numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role       text;
    v_school_id  uuid;
    v_district_id uuid;
    v_sy         text;
    v_defined    bigint;
begin
    select p.role, p.school_id, p.district_id
      into v_role, v_school_id, v_district_id
      from public.profiles p
     where p.id = auth.uid();

    v_sy := public.get_current_school_year();

    select count(*) into v_defined
      from public.academic_calendar c
     where c.school_year = v_sy
       and c.is_active = true
       and (v_district_id is null or c.district_id is null or c.district_id = v_district_id);
    v_defined := greatest(coalesce(v_defined, 0), 1);

    -- ---- School Head / Master Teacher: per-teacher ----
    if v_role in ('School Head', 'Master Teacher') then
        return query
        with
        valid as (
            select distinct on (s.teaching_load_id, s.week_number, s.doc_type)
                   s.user_id,
                   lower(coalesce(s.compliance_status, '')) as status
              from public.submissions s
             where s.school_year = v_sy
               and s.user_id in (select id from public.profiles where school_id = v_school_id)
             order by s.teaching_load_id,
                      s.week_number,
                      s.doc_type,
                      (case when lower(coalesce(s.compliance_status, '')) in ('supplementary','extra') then 1 else 0 end),
                      s.created_at desc
        ),
        per as (
            select v.user_id,
                   count(*) filter (where v.status in ('compliant','on-time'))  as cnt_compliant,
                   count(*) filter (where v.status = 'late')                    as cnt_late
              from valid v
             group by v.user_id
        ),
        loads as (
            select l.user_id, count(*)::bigint as loadcnt
              from public.teaching_loads l
             group by l.user_id
        )
        select
            t.id,
            t.full_name,
            coalesce(p.cnt_compliant, 0) as compliant,
            coalesce(p.cnt_late, 0)      as late,
            greatest(
                coalesce(l.loadcnt, 0) * v_defined
                - coalesce(p.cnt_compliant, 0)
                - coalesce(p.cnt_late, 0), 0) as noncompliant,
            coalesce(l.loadcnt, 0) * v_defined as expected,
            case when coalesce(l.loadcnt, 0) * v_defined > 0
                 then least(100, round(
                        (coalesce(p.cnt_compliant, 0) + coalesce(p.cnt_late, 0))
                        * 100.0 / (coalesce(l.loadcnt, 0) * v_defined)))
                 else 0 end as rate
        from public.profiles t
        left join per   p on p.user_id = t.id
        left join loads l on l.user_id = t.id
        where t.role = 'Teacher'
          and t.school_id = v_school_id
        order by t.full_name;
    end if;

    -- ---- District Supervisor: per-school ----
    return query
    with
    valid as (
        select distinct on (s.teaching_load_id, s.week_number, s.doc_type)
               sch.id,
               lower(coalesce(s.compliance_status, '')) as status
          from public.submissions s
          join public.profiles u   on u.id = s.user_id
          join public.schools  sch on sch.id = u.school_id
         where s.school_year = v_sy
           and (v_district_id is null or sch.district_id = v_district_id)
         order by s.teaching_load_id,
                  s.week_number,
                  s.doc_type,
                  (case when lower(coalesce(s.compliance_status, '')) in ('supplementary','extra') then 1 else 0 end),
                  s.created_at desc
    ),
    per as (
        select v.id as school_id,
               count(*) filter (where v.status in ('compliant','on-time')) as cnt_compliant,
               count(*) filter (where v.status = 'late')                  as cnt_late
          from valid v
         group by v.id
    ),
    loads as (
        select p.school_id, count(*)::bigint as loadcnt
          from public.teaching_loads l
          join public.profiles p on p.id = l.user_id
         group by p.school_id
    )
    select
        sc.id,
        sc.name,
        coalesce(p.cnt_compliant, 0) as compliant,
        coalesce(p.cnt_late, 0)      as late,
        greatest(
            coalesce(l.loadcnt, 0) * v_defined
            - coalesce(p.cnt_compliant, 0)
            - coalesce(p.cnt_late, 0), 0) as noncompliant,
        coalesce(l.loadcnt, 0) * v_defined as expected,
        case when coalesce(l.loadcnt, 0) * v_defined > 0
             then least(100, round(
                    (coalesce(p.cnt_compliant, 0) + coalesce(p.cnt_late, 0))
                    * 100.0 / (coalesce(l.loadcnt, 0) * v_defined)))
             else 0 end as rate
    from public.schools sc
    left join per   p on p.school_id = sc.id
    left join loads l on l.school_id = sc.id
    where v_district_id is null or sc.district_id = v_district_id
    order by sc.name;
end;
$$;

-- Grant execution (RLS-differentiated by role via SECURITY DEFINER + auth.uid())
revoke execute on function public.get_analytics_comparison() from public;
grant  execute on function public.get_analytics_comparison() to authenticated;
grant  execute on function public.get_analytics_comparison() to service_role;

-- Optional helper for callers to get the active defined-weeks count in SQL.
create or replace function public.get_defined_weeks_count()
returns bigint
language sql
stable
set search_path = public
as $$
    select greatest(count(*), 1)
      from public.academic_calendar c
     where c.school_year = public.get_current_school_year()
       and c.is_active = true
       and ( (select p.district_id from public.profiles p where p.id = auth.uid()) is null
          or c.district_id is null
          or c.district_id = (select p.district_id from public.profiles p where p.id = auth.uid()) );
$$;