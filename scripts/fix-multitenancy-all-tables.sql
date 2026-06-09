-- ============================================================
-- Fix multi-tenancy RLS on all tables with open USING (true) policies
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. production_calendar — has organisation_id column, just needs policy fixed
DROP POLICY IF EXISTS "allow_all"              ON production_calendar;
DROP POLICY IF EXISTS "org_isolation"          ON production_calendar;
CREATE POLICY "org_isolation" ON production_calendar FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- 2. finished_goods_adjustments — has organisation_id column, just needs policy fixed
DROP POLICY IF EXISTS "allow_all"              ON finished_goods_adjustments;
DROP POLICY IF EXISTS "org_isolation"          ON finished_goods_adjustments;
CREATE POLICY "org_isolation" ON finished_goods_adjustments FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- 3. ingredients — re-apply org isolation (overrides fix-ingredients-permissions.sql)
DROP POLICY IF EXISTS "allow_all"              ON ingredients;
DROP POLICY IF EXISTS "anon_read_ingredients"  ON ingredients;
DROP POLICY IF EXISTS "org_isolation"          ON ingredients;
CREATE POLICY "org_isolation" ON ingredients FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- 4. ingredient_lots — re-apply org isolation (overrides stock-schema.sql)
DROP POLICY IF EXISTS "anon_all_ingredient_lots" ON ingredient_lots;
DROP POLICY IF EXISTS "org_isolation"            ON ingredient_lots;
CREATE POLICY "org_isolation" ON ingredient_lots FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- 5. dispatches — re-apply org isolation (overrides dispatches-schema.sql)
DROP POLICY IF EXISTS "anon_all_dispatches" ON dispatches;
DROP POLICY IF EXISTS "org_isolation"       ON dispatches;
CREATE POLICY "org_isolation" ON dispatches FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- 6. suppliers — re-apply org isolation (overrides fix-suppliers-rls.sql)
DROP POLICY IF EXISTS "allow_select"     ON suppliers;
DROP POLICY IF EXISTS "allow_insert"     ON suppliers;
DROP POLICY IF EXISTS "allow_update"     ON suppliers;
DROP POLICY IF EXISTS "allow_delete"     ON suppliers;
DROP POLICY IF EXISTS "org_isolation"    ON suppliers;
DROP POLICY IF EXISTS "saq_token_select" ON suppliers;
CREATE POLICY "org_isolation" ON suppliers FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());
-- Suppliers with a SAQ token can be read by the anon supplier filling in the form
CREATE POLICY "saq_token_select" ON suppliers FOR SELECT
  USING (saq_token IS NOT NULL);

-- 7. batch_drafts — add organisation_id, migrate existing rows, fix RLS
ALTER TABLE batch_drafts ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

-- Migrate existing drafts: inherit org from their linked checklist
UPDATE batch_drafts bd
SET organisation_id = c.organisation_id
FROM checklists c
WHERE c.id = bd.checklist_id
  AND bd.organisation_id IS NULL;

DROP POLICY IF EXISTS "anon_all_batch_drafts" ON batch_drafts;
DROP POLICY IF EXISTS "org_isolation"         ON batch_drafts;
CREATE POLICY "org_isolation" ON batch_drafts FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- Ensure grants are in place
GRANT SELECT, INSERT, UPDATE, DELETE ON batch_drafts TO anon, authenticated;
