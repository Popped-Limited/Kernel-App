-- Scope suppliers table to org_isolation only — remove anon access
-- The public SAQ form now uses a service-role route (/api/saq/[token])
-- so the suppliers table needs no anon or token-based policy at all.

BEGIN;

DROP POLICY IF EXISTS "saq_token_select" ON suppliers;
DROP POLICY IF EXISTS "allow_select"     ON suppliers;
DROP POLICY IF EXISTS "allow_insert"     ON suppliers;
DROP POLICY IF EXISTS "allow_update"     ON suppliers;
DROP POLICY IF EXISTS "allow_delete"     ON suppliers;

-- Ensure org_isolation is the one and only policy.
DROP POLICY IF EXISTS "org_isolation" ON suppliers;
CREATE POLICY "org_isolation" ON suppliers FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

REVOKE ALL ON suppliers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON suppliers TO authenticated, service_role;

COMMIT;

-- Sanity check: SELECT policyname, roles, cmd, qual FROM pg_policies WHERE tablename = 'suppliers';
-- Should show only org_isolation.
