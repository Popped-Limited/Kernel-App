-- ============================================================
-- RLS AUDIT — find cross-org holes across the whole schema.
-- READ-ONLY (SELECT only). Safe to run anytime in the Supabase SQL editor.
-- Any row returned by (1) or (2) is a potential cross-org leak to investigate.
-- ============================================================

-- (1) Tenant tables (they HAVE an organisation_id column) with RLS switched OFF.
--     RLS off = every authenticated user reads every org's rows.
SELECT c.relname AS table_name, 'RLS DISABLED' AS issue
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relkind = 'r'
  AND c.relrowsecurity = false
  AND EXISTS (SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = c.oid AND a.attname = 'organisation_id'
                AND a.attnum > 0 AND NOT a.attisdropped)
ORDER BY 1;

-- (2) Permissive policies on a tenant table that match ALL rows regardless of org
--     (USING true / WITH CHECK true) — the exact bug that leaked honeycomb.
SELECT p.tablename, p.policyname, p.cmd, p.permissive,
       p.roles::text AS roles, p.qual AS using_expr, p.with_check
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public' AND n.nspname = p.schemaname
WHERE p.permissive = 'PERMISSIVE'
  AND EXISTS (SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = c.oid AND a.attname = 'organisation_id'
                AND a.attnum > 0 AND NOT a.attisdropped)
  AND (
        (p.cmd IN ('SELECT','UPDATE','DELETE','ALL') AND (p.qual IS NULL OR btrim(lower(p.qual)) = 'true'))
     OR (p.cmd IN ('INSERT','UPDATE','ALL')          AND (p.with_check IS NOT NULL AND btrim(lower(p.with_check)) = 'true'))
      )
ORDER BY p.tablename, p.policyname;

-- (3) Tenant tables with NO policy referencing get_my_org_id() at all.
--     Expected to list only tables that are cross-org BY DESIGN (e.g. demo_slots,
--     if it carries organisation_id). Anything else here is a gap.
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relkind = 'r'
  AND EXISTS (SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = c.oid AND a.attname = 'organisation_id'
                AND a.attnum > 0 AND NOT a.attisdropped)
  AND NOT EXISTS (SELECT 1 FROM pg_policies p
                  WHERE p.schemaname = 'public' AND p.tablename = c.relname
                    AND (coalesce(p.qual,'') LIKE '%get_my_org_id%'
                      OR coalesce(p.with_check,'') LIKE '%get_my_org_id%'))
ORDER BY 1;
