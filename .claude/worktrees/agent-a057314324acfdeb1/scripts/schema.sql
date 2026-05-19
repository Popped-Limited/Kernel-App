-- Run this in the Supabase SQL editor if tables don't exist yet.
-- If the 6 tables already exist, check column names match these definitions.

-- CHECKLISTS
create table if not exists checklists (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  frequency text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- QUESTIONS
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references checklists(id) on delete cascade,
  label text not null,
  type text not null, -- checkbox | number | text | date | datetime | dropdown | photo | signature | multiple_choice
  required boolean not null default true,
  order_index integer not null default 0,
  options jsonb,       -- array of strings for dropdown/multiple_choice
  hint text,
  created_at timestamptz not null default now()
);
create index if not exists questions_checklist_idx on questions(checklist_id);

-- SUBMISSIONS
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references checklists(id),
  submitted_by text not null,
  submitted_at timestamptz not null default now(),
  signed_off_by text,
  signed_off_at timestamptz,
  notes text
);
create index if not exists submissions_checklist_idx on submissions(checklist_id);
create index if not exists submissions_submitted_at_idx on submissions(submitted_at desc);

-- ANSWERS
create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  question_id uuid not null references questions(id),
  value text
);
create index if not exists answers_submission_idx on answers(submission_id);

-- TEAM MEMBERS
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  role text not null default 'staff', -- admin | manager | staff
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ALERT LOG
create table if not exists alert_log (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid references checklists(id),
  sent_at timestamptz not null default now(),
  recipient text not null,
  message text not null
);

-- ─── RLS POLICIES ────────────────────────────────────────────────────────────
-- Allow anonymous reads and inserts (for QR form submissions from staff phones)
-- Tighten with auth when you add login later.

alter table checklists enable row level security;
alter table questions enable row level security;
alter table submissions enable row level security;
alter table answers enable row level security;
alter table team_members enable row level security;
alter table alert_log enable row level security;

-- Drop policies first so this script is safe to re-run
drop policy if exists "checklists_select" on checklists;
drop policy if exists "questions_select" on questions;
drop policy if exists "submissions_select" on submissions;
drop policy if exists "submissions_insert" on submissions;
drop policy if exists "submissions_update" on submissions;
drop policy if exists "answers_select" on answers;
drop policy if exists "answers_insert" on answers;
drop policy if exists "team_members_select" on team_members;
drop policy if exists "team_members_insert" on team_members;
drop policy if exists "alert_log_insert" on alert_log;
drop policy if exists "alert_log_select" on alert_log;

-- Checklists: public read
create policy "checklists_select" on checklists for select using (true);

-- Questions: public read
create policy "questions_select" on questions for select using (true);

-- Submissions: public insert + select + update (manager signs off)
create policy "submissions_select" on submissions for select using (true);
create policy "submissions_insert" on submissions for insert with check (true);
create policy "submissions_update" on submissions for update using (true);

-- Answers: public insert + select
create policy "answers_select" on answers for select using (true);
create policy "answers_insert" on answers for insert with check (true);

-- Team members: select + insert
create policy "team_members_select" on team_members for select using (true);
create policy "team_members_insert" on team_members for insert with check (true);

-- Alert log
create policy "alert_log_insert" on alert_log for insert with check (true);
create policy "alert_log_select" on alert_log for select using (true);

-- ─── STORAGE BUCKET ──────────────────────────────────────────────────────────
-- Create this manually in Supabase Dashboard > Storage > New bucket
-- Name: compliance-photos
-- Public: true (so photo URLs work in submissions)
