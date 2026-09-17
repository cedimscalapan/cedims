-- Audit Logs table
-- Tracks administrative actions for accountability

create table if not exists audit_logs (
    id          uuid primary key default gen_random_uuid(),
    actor_id    uuid not null references profiles(id),
    action      text not null,
    entity_type text not null,
    entity_id   text,
    metadata    jsonb default '{}'::jsonb,
    created_at  timestamptz default now()
);

create index if not exists idx_audit_logs_actor on audit_logs(actor_id);
create index if not exists idx_audit_logs_action on audit_logs(action);
create index if not exists idx_audit_logs_created on audit_logs(created_at desc);

-- Enable RLS
alter table audit_logs enable row level security;

-- Only supervisors/admins can read audit logs
create policy "Supervisors can read audit logs"
    on audit_logs for select
    using (
        exists (
            select 1 from profiles
            where profiles.id = auth.uid()
            and profiles.role in ('District Supervisor', 'Admin')
        )
    );

-- Authenticated users can insert audit logs (fire-and-forget)
create policy "Authenticated users can insert audit logs"
    on audit_logs for insert
    with check (auth.role() = 'authenticated');
