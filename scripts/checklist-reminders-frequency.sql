-- Add scheduling frequency to checklist reminders.
-- Run once in the Supabase SQL editor (after checklist-reminders.sql).
--
-- frequency:
--   'daily'     → every day at send_hour
--   'weekly'    → on the weekdays listed in `days` (0=Sun .. 6=Sat) at send_hour
--   'monthly'   → on `day_of_month` (1-28) each month at send_hour
--   'quarterly' → on `day_of_month` (1-28) in Jan, Apr, Jul & Oct at send_hour

alter table checklist_reminders add column if not exists frequency text not null default 'weekly';
alter table checklist_reminders add column if not exists day_of_month smallint;
