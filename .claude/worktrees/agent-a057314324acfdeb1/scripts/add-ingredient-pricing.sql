ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS price_per_kg decimal(10,4);
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON ingredients TO anon, authenticated;
