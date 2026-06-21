-- Fix "permission denied for table finished_goods_adjustments"
-- Run this in the Supabase SQL editor

-- 1. Grant table-level permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON finished_goods_adjustments TO anon, authenticated;

-- 2. RLS — enable and add permissive policy
ALTER TABLE finished_goods_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON finished_goods_adjustments;
CREATE POLICY "allow_all" ON finished_goods_adjustments FOR ALL USING (true) WITH CHECK (true);
