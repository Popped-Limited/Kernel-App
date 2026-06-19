-- Fix 1: saq_token_select was too broad — authenticated users could see all
-- suppliers across all orgs because the policy has no role restriction.
-- Restrict it to the `anon` role only (unauthenticated suppliers filling the SAQ form).

DROP POLICY IF EXISTS "saq_token_select" ON suppliers;
CREATE POLICY "saq_token_select" ON suppliers FOR SELECT TO anon
  USING (saq_token IS NOT NULL);

-- Fix 2: Ensure authenticated role still covered by org_isolation only.
-- (org_isolation policy already exists from fix-multitenancy-all-tables.sql)
-- No further changes needed for authenticated — they use org_isolation.
