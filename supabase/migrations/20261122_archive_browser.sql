-- Small, role-scoped archive responses. The browser receives counts for the
-- current folder, and file metadata only at the leaf (or during search).
create or replace function public.browse_archive(
    p_year text,
    p_path jsonb default '[]'::jsonb,
    p_search text default '',
    p_review text default 'all',
    p_term text default 'all',
    p_week text default 'all',
    p_offset integer default 0,
    p_limit integer default 8
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_actor public.profiles%rowtype;
    v_doc text; v_school text; v_teacher text; v_grade text;
    v_subject text; v_path_term text; v_path_week text; v_next text;
    v_result jsonb;
begin
    select * into v_actor from public.profiles where id = auth.uid();
    if not found or v_actor.role not in ('Teacher','Master Teacher','School Head','District Supervisor','Admin') then
        raise exception 'Archive access denied';
    end if;
    if v_actor.role in ('Master Teacher','School Head') and v_actor.school_id is null then
        raise exception 'Archive school is not assigned';
    end if;
    if v_actor.role = 'District Supervisor' and v_actor.district_id is null then
        raise exception 'Archive district is not assigned';
    end if;
    if p_year !~ '^2[0-9]{3}-2[0-9]{3}$' or p_review not in ('all','checked','for-checking')
       or p_term !~ '^(all|[1-3])$' or p_week !~ '^(all|[0-9]{1,2})$'
       or p_limit not between 1 and 50 or p_offset < 0 or jsonb_typeof(p_path) <> 'array'
       or jsonb_array_length(p_path) > 7 or length(p_search) > 120 then
        raise exception 'Invalid archive request';
    end if;
    select value->>'id' into v_doc from jsonb_array_elements(p_path) value where value->>'type'='docType' limit 1;
    select value->>'id' into v_school from jsonb_array_elements(p_path) value where value->>'type'='school' limit 1;
    select value->>'id' into v_teacher from jsonb_array_elements(p_path) value where value->>'type'='teacher' limit 1;
    select value->>'id' into v_grade from jsonb_array_elements(p_path) value where value->>'type'='grade' limit 1;
    select value->>'id' into v_subject from jsonb_array_elements(p_path) value where value->>'type'='subject' limit 1;
    select value->>'id' into v_path_term from jsonb_array_elements(p_path) value where value->>'type'='term' limit 1;
    select value->>'id' into v_path_week from jsonb_array_elements(p_path) value where value->>'type'='week' limit 1;
    if v_school is not null and v_school !~ '^[0-9a-f-]{36}$' or v_teacher is not null and v_teacher !~ '^[0-9a-f-]{36}$' then
        raise exception 'Invalid archive path';
    end if;
    if btrim(p_search) <> '' then v_next := null;
    elsif v_doc is null then v_next := 'docType';
    elsif v_school is null then v_next := 'school';
    elsif v_teacher is null then v_next := 'teacher';
    elsif v_doc <> 'DLL' then v_next := null;
    elsif v_grade is null then v_next := 'grade';
    elsif v_subject is null then v_next := 'subject';
    elsif v_path_term is null then v_next := 'term';
    elsif v_path_week is null then v_next := 'week';
    else v_next := null;
    end if;

    with visible as materialized (
        select s.id, s.user_id, s.file_name, s.file_hash, s.file_size,
            s.doc_type, s.compliance_status, s.term_number, s.week_number,
            s.subject, s.teaching_load_id, s.created_at, s.file_path,
            s.school_year, s.calendar_id,
            u.full_name, u.school_id, u.district_id, u.avatar_url, u.role,
            sch.name as school_name, sch.avatar_url as school_avatar,
            coalesce(nullif(btrim(tl.grade_level),''),'Unassigned Grade') as archive_grade,
            coalesce(nullif(btrim(s.subject),''),nullif(btrim(tl.subject),''),'Unassigned') as archive_subject,
            coalesce(s.term_number::text,(regexp_match(s.file_path,'(?:^|/)Term_([1-3])(?:/|$)','i'))[1],'unassigned') as archive_term,
            exists (select 1 from public.dll_reviews r where r.submission_id=s.id and nullif(btrim(r.reviewer_comment),'') is not null) as checked
        from public.submissions s
        join public.profiles u on u.id=s.user_id
        left join public.schools sch on sch.id=u.school_id
        left join public.teaching_loads tl on tl.id=s.teaching_load_id
        where s.school_year=p_year and s.doc_type in ('DLL','DLP','ISP','ISR')
          and (
            (v_actor.role='Teacher' and s.user_id=v_actor.id and s.doc_type in ('DLL','DLP'))
            or (v_actor.role in ('Master Teacher','School Head') and u.school_id=v_actor.school_id and
                (s.doc_type in ('DLL','DLP') or s.user_id=v_actor.id or
                 (v_actor.role='School Head' and u.role='Master Teacher')))
            or (v_actor.role='District Supervisor' and u.district_id=v_actor.district_id and
                (s.doc_type in ('DLL','DLP') or u.role in ('Master Teacher','School Head') or s.user_id=v_actor.id))
            or (v_actor.role='Admin' and (v_actor.district_id is null or u.district_id=v_actor.district_id))
          )
    ), filtered as materialized (
        select * from visible v
        where (v_doc is null or case when v.doc_type in ('DLL','DLP') then 'DLL' else v.doc_type end=v_doc)
          and (v_school is null or v.school_id::text=v_school)
          and (v_teacher is null or v.user_id::text=v_teacher)
          and (v_grade is null or v.archive_grade=v_grade)
          and (v_subject is null or v.archive_subject=v_subject)
          and (v_path_term is null or v.archive_term=v_path_term)
          and (v_path_week is null or coalesce(v.week_number::text,'null')=v_path_week)
          and (p_term='all' or (v.doc_type in ('DLL','DLP') and v.archive_term=p_term))
          and (p_week='all' or (v.doc_type in ('DLL','DLP') and v.week_number::text=p_week))
          and (p_review='all' or (v.doc_type in ('DLL','DLP') and
               lower(v.compliance_status) in ('compliant','on-time','late','supplementary','extra') and
               v.checked=(p_review='checked')))
          and (btrim(p_search)='' or v.id::text=p_search or v.file_name ilike '%'||p_search||'%' or
               v.full_name ilike '%'||p_search||'%' or v.file_hash ilike '%'||p_search||'%' or
               v.archive_grade ilike '%'||p_search||'%' or v.doc_type ilike '%'||p_search||'%')
    ), grouped as (
        select case v_next
            when 'docType' then case when doc_type in ('DLL','DLP') then 'DLL' else doc_type end
            when 'school' then school_id::text when 'teacher' then user_id::text
            when 'grade' then archive_grade when 'subject' then archive_subject
            when 'term' then archive_term when 'week' then coalesce(week_number::text,'null') end as id,
            case v_next when 'school' then school_name when 'teacher' then full_name
            when 'grade' then archive_grade when 'subject' then archive_subject
            when 'term' then case when archive_term='unassigned' then 'Unassigned Term' else 'Term '||archive_term end
            when 'week' then case when week_number is null then 'Unassigned' else 'Week '||week_number end
            else case when doc_type in ('DLL','DLP') then 'DLL / DLP' else doc_type end end as label,
            case v_next when 'school' then school_avatar when 'teacher' then avatar_url else null end as avatar_url,
            count(*) as file_count
        from filtered where v_next is not null
        group by 1,2,3
    ), page as (
        select * from filtered where v_next is null
        order by created_at desc,id limit p_limit offset p_offset
    )
    select jsonb_build_object(
        'folders', coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label,'type',v_next,'count',file_count,'avatar_url',avatar_url) order by label) from grouped),'[]'::jsonb),
        'total', (select count(*) from filtered),
        'files', coalesce((select jsonb_agg(jsonb_build_object(
            'id',id,'user_id',user_id,'file_name',file_name,'file_hash',file_hash,
            'file_size',file_size,'doc_type',doc_type,'compliance_status',compliance_status,
            'term_number',term_number,'week_number',week_number,'subject',archive_subject,
            'grade_level',archive_grade,'teaching_load_id',teaching_load_id,
            'created_at',created_at,'file_path',file_path,'school_year',school_year,
            'calendar_id',calendar_id,'school_name',school_name,'school_avatar',school_avatar,
            'checked',checked,'uploader',jsonb_build_object('full_name',full_name,
                'school_id',school_id,'district_id',district_id,'avatar_url',avatar_url,'role',role))
            order by created_at desc,id) from page),'[]'::jsonb),
        'next', v_next,
        'terms', coalesce((select jsonb_agg(distinct archive_term) from visible where doc_type in ('DLL','DLP') and archive_term<>'unassigned'),'[]'::jsonb),
        'weeks', coalesce((select jsonb_agg(distinct week_number) from visible where doc_type in ('DLL','DLP') and week_number is not null),'[]'::jsonb)
    ) into v_result;
    return v_result;
end $$;

revoke all on function public.browse_archive(text,jsonb,text,text,text,text,integer,integer) from public;
grant execute on function public.browse_archive(text,jsonb,text,text,text,text,integer,integer) to authenticated;
