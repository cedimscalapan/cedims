-- Allow the dedicated Admin role to be stored and managed from the Admin UI.
alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
    add constraint profiles_role_check
    check (role in ('Admin', 'Teacher', 'School Head', 'Master Teacher', 'District Supervisor'));

drop policy if exists "Supervisors can manage all profiles" on public.profiles;

create policy "Admins can manage all profiles"
    on public.profiles for update to authenticated
    using (
        exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'Admin'
        )
    )
    with check (true);
