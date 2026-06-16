-- Link finished-goods stock reconciliations to a specific production batch.
-- Run once in the Supabase SQL editor.
ALTER TABLE finished_goods_adjustments ADD COLUMN IF NOT EXISTS batch_code text;
