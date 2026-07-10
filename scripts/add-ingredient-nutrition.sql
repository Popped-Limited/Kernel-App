-- Nutrition per 100g on raw materials (nutrition/labelling feature).
--
-- Values are FIC by-weight per 100g, copied onto the ingredient when the user
-- confirms a CoFID match or types them from a supplier spec sheet. The label
-- calculation always reads from here — never live from the CoFID dataset — so
-- a dataset update can't silently change an existing product's declaration.
--
-- Run in the Supabase SQL editor. Safe to run more than once (idempotent).

ALTER TABLE ingredients
  -- { energy_kcal, energy_kj, fat_g, saturates_g, carbohydrate_g, sugars_g,
  --   fibre_g, protein_g, salt_g } — numbers or null (null = not available;
  --   the app must never treat a missing value as 0)
  ADD COLUMN IF NOT EXISTS nutrition_per_100g jsonb,
  ADD COLUMN IF NOT EXISTS nutrition_source text
    CHECK (nutrition_source IN ('cofid', 'spec_sheet', 'manual')),
  -- CoFID food code when source = 'cofid' (e.g. "13-145") — lets us flag if a
  -- future CoFID release changes the values behind an existing link
  ADD COLUMN IF NOT EXISTS nutrition_cofid_code text,
  ADD COLUMN IF NOT EXISTS nutrition_updated_at timestamptz;
