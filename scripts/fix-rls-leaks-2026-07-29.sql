-- ============================================================
-- CROSS-ORG DATA LEAK FIX — 29 Jul 2026
-- Run in the Supabase SQL Editor (Popped-Limited project). Idempotent.
-- ============================================================
-- Symptom: Yep Kitchen saw "Milk Chocolate Honeycomb" (The Chocolate Society's
--   product) in Finished Goods. Verified as a live cross-org RLS breach:
--   as tom@yepkitchen.com, RLS returned rows from OTHER orgs on two tables.
--
-- Root cause: leftover permissive policies (FOR ALL / SELECT USING (true)) that
--   the proper org-scoped migrations were meant to replace but which are still
--   live in production, so every authenticated user reads every org's rows.
--     * finished_goods_adjustments — "allow_all" USING(true) still live
--       (fix-multitenancy-all-tables.sql, which drops it, was never applied).
--     * saq_questions — a USING(true) policy still live alongside/instead of the
--       org-scoped set from scope-saq-questions-per-org.sql.
--
-- This script is defensive: it drops EVERY existing policy on each table (so no
-- stray permissive policy survives under any name), ensures RLS is enabled, and
-- recreates the correct org-scoped policies. get_my_org_id() already exists.
-- Seeding/public reads run as service_role (BYPASSRLS) and are unaffected.
-- ============================================================

BEGIN;

-- ── 1. finished_goods_adjustments ───────────────────────────────────────────
ALTER TABLE finished_goods_adjustments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'finished_goods_adjustments'
  LOOP
    EXECUTE format('DROP POLICY %I ON finished_goods_adjustments', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "org_isolation" ON finished_goods_adjustments FOR ALL
  USING      (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- ── 2. saq_questions ────────────────────────────────────────────────────────
-- New orgs are seeded from the code baseline (lib/seed/salsa-baseline.ts) via
-- service_role, which bypasses RLS — this policy set does NOT affect signup
-- seeding. It only makes each org's customisations (add/edit/delete questions)
-- stay inside that org instead of being globally visible/editable.
ALTER TABLE saq_questions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'saq_questions'
  LOOP
    EXECUTE format('DROP POLICY %I ON saq_questions', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "saq_questions_select" ON saq_questions
  FOR SELECT USING (organisation_id = get_my_org_id());
CREATE POLICY "saq_questions_insert" ON saq_questions
  FOR INSERT WITH CHECK (organisation_id = get_my_org_id());
CREATE POLICY "saq_questions_update" ON saq_questions
  FOR UPDATE USING (organisation_id = get_my_org_id())
             WITH CHECK (organisation_id = get_my_org_id());
CREATE POLICY "saq_questions_delete" ON saq_questions
  FOR DELETE USING (organisation_id = get_my_org_id());

-- The public supplier form reads saq_questions via the service-role route
-- /api/saq/[token], so anon needs no direct access.
REVOKE ALL ON saq_questions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON saq_questions TO authenticated, service_role;

COMMIT;

-- ── Verify after committing (each should return ONLY the caller's org) ───────
-- Run as a normal (non-service) session, or trust the app: Finished Goods must
-- no longer show Milk Chocolate Honeycomb for Yep Kitchen.
--   SELECT tablename, policyname, cmd, qual FROM pg_policies
--   WHERE tablename IN ('finished_goods_adjustments','saq_questions') ORDER BY 1,2;
