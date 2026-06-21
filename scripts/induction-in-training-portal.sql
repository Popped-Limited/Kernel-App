-- ============================================================
-- Move the Employee Induction Record into the Training Portal.
-- Run this in the Supabase SQL editor (supabase.com → project → SQL Editor).
--
-- The induction checklist becomes the first row of the training matrix and is
-- filled per employee, with a begin → continue (draft) → completed lifecycle.
-- To support that we scope a draft and a submission to a specific team member.
-- Both columns are NULLABLE so existing production drafts/submissions are
-- completely unaffected.
-- ============================================================

-- 1. Per-employee in-progress induction drafts
ALTER TABLE batch_drafts
  ADD COLUMN IF NOT EXISTS team_member_id uuid REFERENCES team_members(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS batch_drafts_checklist_member_idx
  ON batch_drafts (checklist_id, team_member_id);

-- 2. Completed induction submissions linked to the employee
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS team_member_id uuid REFERENCES team_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS submissions_checklist_member_idx
  ON submissions (checklist_id, team_member_id);
