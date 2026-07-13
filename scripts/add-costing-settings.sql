-- ============================================================
-- Full product costing — secondary packaging + labour inputs
-- Run this in the Supabase SQL editor. Idempotent; safe to re-run.
-- ============================================================
--
-- Extends product_nutrition_settings (the per-product (org, product_name)
-- settings row) with the remaining cost components so the Costing tab can show
-- a full cost per unit: ingredients + primary packaging (already computed) +
-- secondary packaging + labour.
--
--   secondary_packaging — [{ "name": "Outer box (6)", "qty_per_batch": 4 }, …]
--     names are secondary (non-primary) packaging raw materials; cost per unit
--     = Σ(qty_per_batch × price-per-unit) ÷ units_per_batch.
--   labour_* — a standard batch's labour: staff × hours × £/hour, ÷ units.

BEGIN;

ALTER TABLE product_nutrition_settings
  ADD COLUMN IF NOT EXISTS secondary_packaging  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS labour_staff         numeric,
  ADD COLUMN IF NOT EXISTS labour_hours         numeric,
  ADD COLUMN IF NOT EXISTS labour_cost_per_hour numeric;

COMMIT;
