-- ============================================================
-- Run this in the Supabase SQL editor
-- ============================================================

-- Ingredient master list
CREATE TABLE IF NOT EXISTS ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Stock lots — one row per delivery
CREATE TABLE IF NOT EXISTS ingredient_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  julian_code text NOT NULL,
  quantity_received_g numeric NOT NULL,
  quantity_remaining_g numeric NOT NULL,
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier text,
  best_before_date date,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ingredients TO anon;
CREATE POLICY "anon_read_ingredients" ON ingredients FOR SELECT TO anon USING (true);

ALTER TABLE ingredient_lots ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ingredient_lots TO anon;
CREATE POLICY "anon_all_ingredient_lots" ON ingredient_lots FOR ALL TO anon USING (true) WITH CHECK (true);

-- Seed all 20 ingredients from the 5 batch records
INSERT INTO ingredients (name) VALUES
  ('Cold-pressed Rapeseed oil'),
  ('Red chilli'),
  ('Peeled garlic'),
  ('Light soy sauce'),
  ('Ginger'),
  ('Erjingtiao chilli flakes'),
  ('Sichuan peppercorn powder'),
  ('Organic Shiitake mushroom powder'),
  ('Sea salt'),
  ('Beef jerky'),
  ('Shallots'),
  ('Doubanjiang'),
  ('Mushroom powder'),
  ('Naga chilli flakes'),
  ('Long red chilli'),
  ('Thai chilli'),
  ('Salt'),
  ('Garlic'),
  ('Rice wine'),
  ('Sugar')
ON CONFLICT (name) DO NOTHING;
