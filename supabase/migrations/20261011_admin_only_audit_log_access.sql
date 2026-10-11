-- System logs are an Admin-only interface. District Supervisors retain their
-- monitoring permissions but must not read the administrative audit trail.
drop policy if exists "Supervisors can read audit logs" on public.audit_logs;

create policy "Admins can read audit logs"
    on public.audit_logs for select
    using (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid()
              and profiles.role = 'Admin'
        )
    );
