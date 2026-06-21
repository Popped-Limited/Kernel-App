-- Add a quarterly anchor month so quarterly reminders can start from any month.
-- Run once in the Supabase SQL editor (after checklist-reminders-frequency.sql).
--
-- start_month (0=Jan .. 11=Dec): quarterly reminders fire on day_of_month in
-- start_month and every 3rd month after it. e.g. start_month = 1 (Feb) → Feb,
-- May, Aug, Nov.

alter table checklist_reminders add column if not exists start_month smallint;
