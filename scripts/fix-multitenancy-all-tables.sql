-- ============================================================
-- COMPREHENSIVE MULTI-TENANCY FIX
-- Locks down every table in the Kernel App database.
-- Run in Supabase SQL Editor — safe to re-run.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. production_calendar — has organisation_id, policy was USING(true)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all"   ON production_calendar;
DROP POLICY IF EXISTS "org_isolation" ON production_calendar;
CREATE POLICY "org_isolation" ON production_calendar FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. finished_goods_adjustments — has organisation_id, policy was USING(true)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all"   ON finished_goods_adjustments;
DROP POLICY IF EXISTS "org_isolation" ON finished_goods_adjustments;
CREATE POLICY "org_isolation" ON finished_goods_adjustments FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ingredients — re-apply org isolation (fix-ingredients-permissions.sql reopened it)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all"             ON ingredients;
DROP POLICY IF EXISTS "anon_read_ingredients" ON ingredients;
DROP POLICY IF EXISTS "org_isolation"         ON ingredients;
CREATE POLICY "org_isolation" ON ingredients FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ingredient_lots — re-apply org isolation (stock-schema.sql reopened it)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all_ingredient_lots" ON ingredient_lots;
DROP POLICY IF EXISTS "org_isolation"             ON ingredient_lots;
CREATE POLICY "org_isolation" ON ingredient_lots FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. dispatches — re-apply org isolation (dispatches-schema.sql reopened it)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_all_dispatches" ON dispatches;
DROP POLICY IF EXISTS "org_isolation"       ON dispatches;
CREATE POLICY "org_isolation" ON dispatches FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. suppliers — re-apply org isolation (fix-suppliers-rls.sql reopened it)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_select"     ON suppliers;
DROP POLICY IF EXISTS "allow_insert"     ON suppliers;
DROP POLICY IF EXISTS "allow_update"     ON suppliers;
DROP POLICY IF EXISTS "allow_delete"     ON suppliers;
DROP POLICY IF EXISTS "org_isolation"    ON suppliers;
DROP POLICY IF EXISTS "saq_token_select" ON suppliers;
CREATE POLICY "org_isolation" ON suppliers FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());
-- Suppliers with a SAQ token must be readable by the supplier filling in the form (no auth)
CREATE POLICY "saq_token_select" ON suppliers FOR SELECT
  USING (saq_token IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. batch_drafts — add organisation_id column, migrate, fix RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE batch_drafts ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

-- Inherit org from the linked checklist
UPDATE batch_drafts bd
SET    organisation_id = c.organisation_id
FROM   checklists c
WHERE  c.id = bd.checklist_id
  AND  bd.organisation_id IS NULL;

DROP POLICY IF EXISTS "anon_all_batch_drafts" ON batch_drafts;
DROP POLICY IF EXISTS "org_isolation"         ON batch_drafts;
CREATE POLICY "org_isolation" ON batch_drafts FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON batch_drafts TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. sops — has organisation_id in app code but no RLS policy
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE sops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON sops;
CREATE POLICY "org_isolation" ON sops FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON sops TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. sop_steps — no organisation_id; scope via parent sop's org
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE sop_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON sop_steps;
CREATE POLICY "org_isolation" ON sop_steps FOR ALL
  USING (EXISTS (
    SELECT 1 FROM sops
    WHERE sops.id = sop_steps.sop_id
      AND sops.organisation_id = get_my_org_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM sops
    WHERE sops.id = sop_steps.sop_id
      AND sops.organisation_id = get_my_org_id()
  ));
GRANT SELECT, INSERT, UPDATE, DELETE ON sop_steps TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. training_items — add organisation_id, migrate, fix RLS + app code updated
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE training_items ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

-- Migrate existing rows to Yep Kitchen (the only org that had data at launch)
UPDATE training_items
SET    organisation_id = '11111111-1111-1111-1111-111111111111'
WHERE  organisation_id IS NULL;

ALTER TABLE training_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON training_items;
CREATE POLICY "org_isolation" ON training_items FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON training_items TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. training_records — add organisation_id, migrate, fix RLS + app code updated
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

-- Migrate: inherit from the linked team_member
UPDATE training_records tr
SET    organisation_id = tm.organisation_id
FROM   team_members tm
WHERE  tm.id = tr.team_member_id
  AND  tr.organisation_id IS NULL;

ALTER TABLE training_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON training_records;
CREATE POLICY "org_isolation" ON training_records FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON training_records TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. documents — add organisation_id, fix RLS + app code updated
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE documents ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

-- Migrate: documents are linked to ingredients/suppliers by entity_id.
-- Try to infer org from linked ingredient; fall back to Yep Kitchen.
UPDATE documents d
SET    organisation_id = i.organisation_id
FROM   ingredients i
WHERE  d.entity_type = 'ingredient'
  AND  d.entity_id = i.id
  AND  d.organisation_id IS NULL;

UPDATE documents d
SET    organisation_id = s.organisation_id
FROM   suppliers s
WHERE  d.entity_type IN ('supplier', 'supply', 'packaging')
  AND  d.entity_id = s.id
  AND  d.organisation_id IS NULL;

-- Any remaining unmatched rows → Yep Kitchen
UPDATE documents
SET    organisation_id = '11111111-1111-1111-1111-111111111111'
WHERE  organisation_id IS NULL;

DROP POLICY IF EXISTS "documents_select" ON documents;
DROP POLICY IF EXISTS "documents_insert" ON documents;
DROP POLICY IF EXISTS "documents_delete" ON documents;
DROP POLICY IF EXISTS "org_isolation"    ON documents;
CREATE POLICY "org_isolation" ON documents FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. wastage_log — has organisation_id but policy used broken team_members lookup
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org members can manage wastage_log" ON wastage_log;
DROP POLICY IF EXISTS "org_isolation"                      ON wastage_log;
CREATE POLICY "org_isolation" ON wastage_log FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON wastage_log TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. alert_log — server-side log; scope via linked checklist's org
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE alert_log ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

UPDATE alert_log al
SET    organisation_id = c.organisation_id
FROM   checklists c
WHERE  c.id = al.checklist_id
  AND  al.organisation_id IS NULL;

DROP POLICY IF EXISTS "alert_log_insert" ON alert_log;
DROP POLICY IF EXISTS "alert_log_select" ON alert_log;
DROP POLICY IF EXISTS "org_isolation"    ON alert_log;
CREATE POLICY "org_isolation" ON alert_log FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());
GRANT SELECT, INSERT ON alert_log TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. Ensure grants are in place for all core tables
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ingredients           TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ingredient_lots       TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON dispatches            TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON suppliers             TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON production_calendar   TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON finished_goods_adjustments TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON documents             TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON wastage_log           TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON training_items        TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON training_records      TO anon, authenticated;
