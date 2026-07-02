-- wastage_log: raw-material stock reconciliation / write-off history.
--
-- IMPORTANT: the original add-wastage-log.sql was NEVER applied in production, so
-- the table did not exist. Every Raw Materials "Reconcile" updated ingredient_lots
-- but its insert into wastage_log failed silently (the app didn't check the error),
-- so no reconciliation history was ever recorded. Run this in the Supabase SQL editor
-- to create the table with correct per-org RLS + grants. Historical reconciliations
-- before this point are unfortunately not recoverable (they were never written).
--
-- Safe to run more than once (idempotent).

CREATE TABLE IF NOT EXISTS wastage_log (
  id                     uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organisation_id        uuid REFERENCES organisations(id) ON DELETE CASCADE,
  lot_id                 uuid REFERENCES ingredient_lots(id) ON DELETE SET NULL,
  ingredient_id          uuid REFERENCES ingredients(id) ON DELETE SET NULL,
  julian_code            text NOT NULL,
  ingredient_name        text NOT NULL,
  adjusted_from_g        numeric NOT NULL,
  adjusted_to_g          numeric NOT NULL,
  quantity_written_off_g numeric GENERATED ALWAYS AS (adjusted_from_g - adjusted_to_g) STORED,
  reason                 text NOT NULL CHECK (reason IN ('wastage', 'damaged', 'expired', 'other')),
  notes                  text,
  created_by             text,
  created_at             timestamptz DEFAULT now()
);

ALTER TABLE wastage_log ENABLE ROW LEVEL SECURITY;

-- Per-org isolation (mirrors every other tenant table). get_my_org_id() already exists.
DROP POLICY IF EXISTS "org members can manage wastage_log" ON wastage_log;
DROP POLICY IF EXISTS "org_isolation"                      ON wastage_log;
CREATE POLICY "org_isolation" ON wastage_log FOR ALL
  USING      (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- Without these grants PostgREST hides the table from the authenticated role
-- ("Could not find the table 'public.wastage_log' in the schema cache").
GRANT SELECT, INSERT, UPDATE, DELETE ON wastage_log TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS wastage_log_org_idx        ON wastage_log(organisation_id);
CREATE INDEX IF NOT EXISTS wastage_log_ingredient_idx ON wastage_log(ingredient_id);
