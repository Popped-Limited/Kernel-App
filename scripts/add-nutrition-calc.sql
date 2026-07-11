-- ============================================================
-- Nutrition calc — per-product label calculation inputs
-- Run this in the Supabase SQL editor. Idempotent; safe to re-run.
-- ============================================================
--
-- Two changes for the recipe → per-100g label calculation:
--
-- 1. ingredients.nutrition_basis — the extraction stores spec-sheet values
--    "as printed", which for liquids may be per 100ml (oil, vinegar). The
--    stored numbers alone don't say which, so the calc couldn't convert.
--    This records the basis; the calc converts per_100ml → per_100g using
--    density_g_per_l. Existing rows default to per_100g (CoFID and most
--    specs are by weight).
--
-- 2. product_nutrition_settings — products have no table (derived from
--    production checklist names), so the per-product calc inputs are keyed
--    by (organisation_id, product_name), matched case-insensitively like
--    stock/dispatches. Finished weight = units_per_batch × net_weight_per_unit_g
--    (captures cooking loss vs the raw recipe weights). prep_yields maps a
--    recipe ingredient name → its net-into-pot ÷ gross fraction (missing = 1.0).

BEGIN;

ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS nutrition_basis text
    CHECK (nutrition_basis IN ('per_100g', 'per_100ml'))
    DEFAULT 'per_100g';

CREATE TABLE IF NOT EXISTS product_nutrition_settings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id        uuid NOT NULL REFERENCES organisations(id),

  product_name           text NOT NULL,           -- exact product name (matches the checklist)
  net_weight_per_unit_g  numeric,                 -- declared net weight of one unit, grams
  units_per_batch        numeric,                 -- units a standard recipe batch yields
  -- { "Ingredient name": 0.95, ... } — prep yield fraction per recipe ingredient (missing = 1.0)
  prep_yields            jsonb NOT NULL DEFAULT '{}'::jsonb,

  updated_by             text NOT NULL DEFAULT '',
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- One settings row per product per org
CREATE UNIQUE INDEX IF NOT EXISTS product_nutrition_settings_org_product_idx
  ON product_nutrition_settings (organisation_id, lower(product_name));

ALTER TABLE product_nutrition_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON product_nutrition_settings;
CREATE POLICY "org_isolation" ON product_nutrition_settings FOR ALL
  USING      (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- The calc runs client-side (org-scoped reads); service_role granted for
-- consistency / future admin tooling.
GRANT SELECT, INSERT, UPDATE, DELETE ON product_nutrition_settings TO anon, authenticated, service_role;

COMMIT;
