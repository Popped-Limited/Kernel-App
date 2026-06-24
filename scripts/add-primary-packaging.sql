-- Primary packaging (things that touch the product — jars, lids) must be traced
-- through production records and deducted from stock, like ingredients. Secondary
-- packaging (boxes, etc.) is NOT traced and never enters production records.
-- Opt-in per item, default false, so orgs start clean and tick only their primary items.
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS is_primary_packaging boolean DEFAULT false;

NOTIFY pgrst, 'reload schema';
