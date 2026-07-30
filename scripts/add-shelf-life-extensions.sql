-- ============================================================
-- Internal shelf-life extensions for raw-material lots
-- Run this in the Supabase SQL editor
-- ============================================================
--
-- SALSA-shaped: extending a supplier's best-before internally is a documented
-- decision, so the lot's original best_before_date is NEVER overwritten.
-- Each extension is its own audit row (new date, reason, who, when); a lot can
-- be extended more than once and the full history survives. The app computes
-- the EFFECTIVE best-before as: latest extension ?? supplier best_before_date
-- (see lib/shelf-life.ts). There is deliberately no default-shelf-life-days
-- concept — fresh items get their date typed at Goods In like everything else.

BEGIN;

CREATE TABLE IF NOT EXISTS shelf_life_extensions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),
  lot_id           uuid NOT NULL REFERENCES ingredient_lots(id) ON DELETE CASCADE,

  extended_until   date NOT NULL,              -- the new internal best-before
  reason           text NOT NULL,              -- the documented justification (required)

  created_by       text NOT NULL DEFAULT '',   -- auth user_metadata.full_name
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shelf_life_extensions_org_lot_idx
  ON shelf_life_extensions (organisation_id, lot_id, created_at DESC);

-- RLS: strict org isolation, matching the rest of the app
ALTER TABLE shelf_life_extensions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON shelf_life_extensions;
CREATE POLICY "org_isolation" ON shelf_life_extensions FOR ALL
  USING      (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- service_role grant so admin/maintenance scripts (e.g. demo cloning) can
-- read/write — mock_recalls lacks this and admin code can't touch it.
GRANT SELECT, INSERT, UPDATE, DELETE ON shelf_life_extensions TO anon, authenticated, service_role;

COMMIT;
