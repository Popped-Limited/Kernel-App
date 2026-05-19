-- ============================================================
-- Multi-tenancy migration for yep-compliance
-- Run this once in the Supabase SQL editor
-- ============================================================

-- 1. Organisations table
CREATE TABLE IF NOT EXISTS organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  plan text NOT NULL DEFAULT 'trial',
  created_at timestamptz DEFAULT now()
);

-- 2. Organisation members (links auth users to orgs)
CREATE TABLE IF NOT EXISTS organisation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz DEFAULT now(),
  UNIQUE(organisation_id, user_id)
);

-- 3. Seed the two orgs with fixed UUIDs
INSERT INTO organisations (id, name, slug, plan) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Yep Kitchen', 'yep-kitchen', 'starter'),
  ('00000000-0000-0000-0000-000000000000', 'Kernel Admin', 'kernel-admin', 'pro')
ON CONFLICT DO NOTHING;

-- 4. Link support@kernelapp.co.uk to Kernel Admin org
INSERT INTO organisation_members (organisation_id, user_id, role)
SELECT '00000000-0000-0000-0000-000000000000', id, 'admin'
FROM auth.users WHERE email = 'support@kernelapp.co.uk'
ON CONFLICT DO NOTHING;

-- 5. Add organisation_id column to all data tables
ALTER TABLE checklists ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
ALTER TABLE answers ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
ALTER TABLE saq_responses ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
ALTER TABLE ingredient_lots ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
ALTER TABLE alert_logs ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

-- 6. Migrate all existing data to Yep Kitchen
UPDATE checklists SET organisation_id = '11111111-1111-1111-1111-111111111111' WHERE organisation_id IS NULL;
UPDATE questions SET organisation_id = '11111111-1111-1111-1111-111111111111' WHERE organisation_id IS NULL;
UPDATE submissions SET organisation_id = '11111111-1111-1111-1111-111111111111' WHERE organisation_id IS NULL;
UPDATE answers SET organisation_id = '11111111-1111-1111-1111-111111111111' WHERE organisation_id IS NULL;
UPDATE suppliers SET organisation_id = '11111111-1111-1111-1111-111111111111' WHERE organisation_id IS NULL;
UPDATE saq_responses SET organisation_id = '11111111-1111-1111-1111-111111111111' WHERE organisation_id IS NULL;
UPDATE ingredients SET organisation_id = '11111111-1111-1111-1111-111111111111' WHERE organisation_id IS NULL;
UPDATE ingredient_lots SET organisation_id = '11111111-1111-1111-1111-111111111111' WHERE organisation_id IS NULL;
UPDATE dispatches SET organisation_id = '11111111-1111-1111-1111-111111111111' WHERE organisation_id IS NULL;
UPDATE alert_logs SET organisation_id = '11111111-1111-1111-1111-111111111111' WHERE organisation_id IS NULL;

-- 7. Helper function: get current user's org_id
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT organisation_id FROM organisation_members WHERE user_id = auth.uid() LIMIT 1;
$$;

-- 8. RLS on organisations and members
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members_see_own_org" ON organisations;
CREATE POLICY "members_see_own_org" ON organisations FOR SELECT USING (id = get_my_org_id());

ALTER TABLE organisation_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members_see_own" ON organisation_members;
CREATE POLICY "members_see_own" ON organisation_members FOR SELECT USING (organisation_id = get_my_org_id());

-- 9. RLS on checklists
ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON checklists;
DROP POLICY IF EXISTS "public_token_select" ON checklists;
CREATE POLICY "org_isolation" ON checklists FOR ALL
  USING (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());
-- Allow anon to read public-token checklists (for guest page)
CREATE POLICY "public_token_select" ON checklists FOR SELECT USING (public_token IS NOT NULL);

-- 10. RLS on questions
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON questions;
DROP POLICY IF EXISTS "public_checklist_questions" ON questions;
CREATE POLICY "org_isolation" ON questions FOR ALL
  USING (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());
CREATE POLICY "public_checklist_questions" ON questions FOR SELECT
  USING (EXISTS (SELECT 1 FROM checklists WHERE checklists.id = questions.checklist_id AND checklists.public_token IS NOT NULL));

-- 11. RLS on submissions
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON submissions;
DROP POLICY IF EXISTS "service_role_insert" ON submissions;
CREATE POLICY "org_isolation" ON submissions FOR ALL
  USING (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());
-- Service role (used by API routes) bypasses RLS automatically

-- 12. RLS on answers
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON answers;
CREATE POLICY "org_isolation" ON answers FOR ALL
  USING (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- 13. RLS on suppliers
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON suppliers;
DROP POLICY IF EXISTS "saq_token_select" ON suppliers;
CREATE POLICY "org_isolation" ON suppliers FOR ALL
  USING (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());
CREATE POLICY "saq_token_select" ON suppliers FOR SELECT USING (saq_token IS NOT NULL);

-- 14. RLS on saq_responses
ALTER TABLE saq_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON saq_responses;
CREATE POLICY "org_isolation" ON saq_responses FOR ALL
  USING (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- 15. RLS on saq_questions (global — all authenticated users can read, service role manages)
ALTER TABLE saq_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "everyone_read" ON saq_questions;
DROP POLICY IF EXISTS "auth_manage" ON saq_questions;
CREATE POLICY "everyone_read" ON saq_questions FOR SELECT USING (true);
CREATE POLICY "auth_manage" ON saq_questions FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 16. RLS on ingredients
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON ingredients;
CREATE POLICY "org_isolation" ON ingredients FOR ALL
  USING (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- 17. RLS on ingredient_lots
ALTER TABLE ingredient_lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON ingredient_lots;
CREATE POLICY "org_isolation" ON ingredient_lots FOR ALL
  USING (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- 18. RLS on dispatches
ALTER TABLE dispatches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON dispatches;
CREATE POLICY "org_isolation" ON dispatches FOR ALL
  USING (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- 19. RLS on alert_logs
ALTER TABLE alert_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON alert_logs;
CREATE POLICY "org_isolation" ON alert_logs FOR ALL
  USING (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- 20. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON organisations TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON organisation_members TO anon, authenticated;
