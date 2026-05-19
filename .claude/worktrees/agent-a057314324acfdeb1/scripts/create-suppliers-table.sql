-- Suppliers table only (traceability checklist already exists)

BEGIN;

CREATE TABLE IF NOT EXISTS suppliers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  type            text NOT NULL CHECK (type IN ('raw_material', 'packaging', 'service')),
  supplies        text NOT NULL,
  certification   text CHECK (certification IN ('BRCGS', 'SALSA', 'Hygiene Rating', 'None', 'Other')),
  hygiene_rating  int  CHECK (hygiene_rating BETWEEN 1 AND 5),
  cert_expiry     date,
  saq_completed   boolean NOT NULL DEFAULT false,
  saq_date        date,
  supplier_risk   text CHECK (supplier_risk IN ('low', 'medium', 'high')),
  raw_material_risk text CHECK (raw_material_risk IN ('low', 'medium', 'high')),
  review_frequency_years int CHECK (review_frequency_years IN (1, 2, 3)),
  next_review_due date,
  status          text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'under_review', 'unapproved')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_select" ON suppliers FOR SELECT USING (true);
CREATE POLICY "allow_insert" ON suppliers FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_update" ON suppliers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "allow_delete" ON suppliers FOR DELETE USING (true);

-- Seed known suppliers
INSERT INTO suppliers (name, type, supplies, saq_completed, status) VALUES
  ('AA Produce',                     'raw_material', 'Fresh produce',        true, 'approved'),
  ('Hill Farm',                      'raw_material', 'Rapeseed oil',         true, 'approved'),
  ('Wanahong - Oriental Essentials', 'raw_material', 'Oriental ingredients', true, 'approved'),
  ('The Chilli Doctor',              'raw_material', 'Chilli products',      true, 'approved'),
  ('Sichuan Hein Food Co',           'raw_material', 'Sichuan ingredients',  true, 'approved'),
  ('Foodnet',                        'raw_material', 'Food ingredients',     true, 'approved'),
  ('Nutricraft',                     'raw_material', 'Ingredients',          true, 'approved'),
  ('Glassworks International',       'packaging',    'Glass jars',           true, 'approved'),
  ('The Bottle Company',             'packaging',    'Bottles',              true, 'approved'),
  ('Challenge Packaging',            'packaging',    'Packaging materials',  true, 'approved');

COMMIT;
