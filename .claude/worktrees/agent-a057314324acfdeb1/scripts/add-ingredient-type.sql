ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'ingredient' CHECK (type IN ('ingredient', 'packaging'));
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'g' CHECK (unit IN ('g', 'units'));

NOTIFY pgrst, 'reload schema';
