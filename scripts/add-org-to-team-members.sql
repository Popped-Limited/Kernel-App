-- Add organisation_id to team_members for proper multi-tenancy isolation
-- Run in Supabase SQL Editor

-- 1. Add column
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

-- 2. Migrate all existing rows to Yep Kitchen
UPDATE team_members
SET organisation_id = '11111111-1111-1111-1111-111111111111'
WHERE organisation_id IS NULL;

-- 3. Update RLS policy to isolate by org
DROP POLICY IF EXISTS "team_members_select" ON team_members;
DROP POLICY IF EXISTS "team_members_insert" ON team_members;
DROP POLICY IF EXISTS "org_isolation" ON team_members;

CREATE POLICY "org_isolation" ON team_members
  FOR ALL
  USING (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- 4. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON team_members TO anon, authenticated;
