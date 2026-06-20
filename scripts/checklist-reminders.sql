-- Per-checklist email reminders.
-- Each organisation configures its own reminders; recipients only ever receive
-- their own org's reminders (full isolation via organisation_id + RLS).
-- Run once in the Supabase SQL editor.

create table if not exists checklist_reminders (
  id               uuid primary key default gen_random_uuid(),
  checklist_id     uuid not null references checklists(id) on delete cascade,
  organisation_id  uuid not null references organisations(id),
  recipient_email  text not null,
  recipient_name   text,
  send_hour        smallint not null default 9,           -- 0-23, UK local time (Europe/London)
  days             smallint[] not null default '{1,2,3,4,5}', -- 0=Sun .. 6=Sat
  active           boolean not null default true,
  last_sent_on     date,                                  -- dedupe: at most one send per calendar day
  created_at       timestamptz not null default now()
);

create index if not exists checklist_reminders_checklist_idx on checklist_reminders(checklist_id);
create index if not exists checklist_reminders_org_idx       on checklist_reminders(organisation_id);

alter table checklist_reminders enable row level security;

-- Org isolation: a user can only see/manage reminders for their own organisation.
drop policy if exists "org_isolation" on checklist_reminders;
create policy "org_isolation" on checklist_reminders for all
  using (organisation_id = get_my_org_id())
  with check (organisation_id = get_my_org_id());

grant select, insert, update, delete on checklist_reminders to authenticated;
-- The hourly cron (/api/reminders) runs as the service role, so it needs access too.
grant select, insert, update, delete on checklist_reminders to service_role;
