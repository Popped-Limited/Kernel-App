-- Fix suppliers table RLS so the app can read/write it
-- Supabase enables RLS on new tables by default — this adds permissive policies
-- matching the pattern used by all other tables in this project

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_select" ON suppliers FOR SELECT USING (true);
CREATE POLICY "allow_insert" ON suppliers FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_update" ON suppliers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "allow_delete" ON suppliers FOR DELETE USING (true);
