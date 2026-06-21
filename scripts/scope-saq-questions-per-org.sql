-- ============================================================
-- Scope saq_questions per organisation (was a GLOBAL table)
-- Run in Supabase SQL Editor. Safe to run once.
-- ============================================================
-- Before: one shared set of SAQ questions, RLS USING(true) — every org saw
-- (and could edit) the same rows. After: each org owns its own copy, RLS
-- locked to get_my_org_id(). The public supplier form reads via a service-role
-- route (/api/saq/[token]) so no anon access to this table is needed.
-- ============================================================

BEGIN;

-- 1. Add the org column (nullable for now so we can backfill).
ALTER TABLE saq_questions
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

-- 2. Drop the GLOBAL unique on question_id (the multi-tenancy trap) so the same
--    question_id can exist once per org. Constraint name is the inline default.
ALTER TABLE saq_questions DROP CONSTRAINT IF EXISTS saq_questions_question_id_key;

-- 3. Backfill: give every existing organisation its own copy of the current
--    (global, organisation_id IS NULL) question set, with fresh ids.
INSERT INTO saq_questions
  (organisation_id, section_number, section_title, question_id, question_text,
   answer_type, placeholder, required, for_types, sort_order, active, created_at)
SELECT o.id, s.section_number, s.section_title, s.question_id, s.question_text,
       s.answer_type, s.placeholder, s.required, s.for_types, s.sort_order, s.active, now()
FROM   saq_questions s
CROSS  JOIN organisations o
WHERE  s.organisation_id IS NULL;

-- 4. Remove the original global rows.
DELETE FROM saq_questions WHERE organisation_id IS NULL;

-- 5. Lock the column down + enforce uniqueness PER ORG.
ALTER TABLE saq_questions ALTER COLUMN organisation_id SET NOT NULL;
ALTER TABLE saq_questions
  ADD CONSTRAINT saq_questions_org_question_id_key UNIQUE (organisation_id, question_id);

-- 6. Replace the USING(true) policies with org-scoped ones.
DROP POLICY IF EXISTS saq_questions_select ON saq_questions;
DROP POLICY IF EXISTS saq_questions_insert ON saq_questions;
DROP POLICY IF EXISTS saq_questions_update ON saq_questions;
DROP POLICY IF EXISTS saq_questions_delete ON saq_questions;

CREATE POLICY saq_questions_select ON saq_questions
  FOR SELECT USING (organisation_id = get_my_org_id());
CREATE POLICY saq_questions_insert ON saq_questions
  FOR INSERT WITH CHECK (organisation_id = get_my_org_id());
CREATE POLICY saq_questions_update ON saq_questions
  FOR UPDATE USING (organisation_id = get_my_org_id())
             WITH CHECK (organisation_id = get_my_org_id());
CREATE POLICY saq_questions_delete ON saq_questions
  FOR DELETE USING (organisation_id = get_my_org_id());

-- 7. Privileges: authenticated (admin UI) + service_role (seeder + public route).
--    Anon no longer needs any access — the public form goes through the route.
REVOKE ALL ON saq_questions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON saq_questions TO authenticated, service_role;

COMMIT;

-- Sanity checks (run after committing):
--   SELECT organisation_id, count(*) FROM saq_questions GROUP BY 1;   -- one row per org, each 70
--   SELECT count(*) FROM saq_questions WHERE organisation_id IS NULL; -- 0
