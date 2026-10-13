-- Add HGP to Grades 1-6 and define subject-specific deadline rules.
-- HGP, Makabansa, and MAPEH are due Tuesday at 10:00 AM Philippine time.

create table if not exists public.subject_deadline_rules (
    id uuid primary key default gen_random_uuid(),
    subject text not null unique,
    due_weekday smallint not null check (due_weekday between 0 and 6),
    due_time time not null,
    timezone text not null default 'Asia/Manila',
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.subject_deadline_rules enable row level security;

drop policy if exists "All authenticated users can view subject deadline rules" on public.subject_deadline_rules;
create policy "All authenticated users can view subject deadline rules"
    on public.subject_deadline_rules
    for select
    to authenticated
    using (true);

insert into public.curriculum_subjects (grade_level, subject, sort_order)
values
    ('Grade 1', 'HGP', 6),
    ('Grade 2', 'HGP', 6),
    ('Grade 3', 'HGP', 7),
    ('Grade 4', 'HGP', 9),
    ('Grade 5', 'HGP', 9),
    ('Grade 6', 'HGP', 9)
on conflict (grade_level, subject) do update
set sort_order = excluded.sort_order;

insert into public.subject_deadline_rules (subject, due_weekday, due_time, timezone, is_active)
values
    ('HGP', 2, time '10:00', 'Asia/Manila', true),
    ('Makabansa', 2, time '10:00', 'Asia/Manila', true),
    ('MAPEH', 2, time '10:00', 'Asia/Manila', true)
on conflict (subject) do update
set
    due_weekday = excluded.due_weekday,
    due_time = excluded.due_time,
    timezone = excluded.timezone,
    is_active = true,
    updated_at = now();
