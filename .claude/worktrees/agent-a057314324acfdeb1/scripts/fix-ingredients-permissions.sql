-- Run this in Supabase SQL editor to fix ingredient save issues

-- 1. Ensure columns exist
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS price_per_kg decimal(10,4);
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;

-- 2. Grant table-level permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ingredients TO anon, authenticated;

-- 3. RLS — drop and recreate permissive policy
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON ingredients;
DROP POLICY IF EXISTS "allow_select" ON ingredients;
DROP POLICY IF EXISTS "allow_insert" ON ingredients;
DROP POLICY IF EXISTS "allow_update" ON ingredients;
DROP POLICY IF EXISTS "allow_delete" ON ingredients;
CREATE POLICY "allow_all" ON ingredients FOR ALL USING (true) WITH CHECK (true);
