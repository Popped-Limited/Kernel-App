-- Traceability Test checklist + Suppliers table
-- Run in Supabase SQL editor

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- TRACEABILITY TEST (MOCK RECALL) CHECKLIST
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO checklists (id, name, frequency, description, category, active)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Traceability Test (Mock Recall)',
  'adhoc',
  'Formal forward and/or backward traceability test. Complete at least quarterly or whenever required.',
  'Compliance',
  true
);

INSERT INTO questions (id, checklist_id, label, type, required, order_index, options, hint) VALUES
  ('b1000001-0000-0000-0000-000000000001', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'Test type', 'dropdown', true, 1,
   '["Backward", "Forward", "Both"]'::jsonb,
   'Backward = finished product → raw materials. Forward = raw material lot → finished product → dispatch.'),

  ('b1000001-0000-0000-0000-000000000002', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'Product being tested', 'text', true, 2, null,
   'Full product name e.g. Sichuan Chilli Crisp Double Heat'),

  ('b1000001-0000-0000-0000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'Batch / coding details', 'text', true, 3, null,
   'Julian code on the product e.g. 26012'),

  ('b1000001-0000-0000-0000-000000000004', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'Best before date on product', 'text', true, 4, null, null),

  ('b1000001-0000-0000-0000-000000000005', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'Quantity in test (units / jars)', 'text', true, 5, null, null),

  ('b1000001-0000-0000-0000-000000000006', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'Start time', 'text', true, 6, null, 'HH:MM'),

  ('b1000001-0000-0000-0000-000000000007', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'End time', 'text', true, 7, null, 'HH:MM'),

  ('b1000001-0000-0000-0000-000000000008', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'Raw material lot codes traced', 'text', true, 8, null,
   'List every lot code traced e.g. Rapeseed oil 26007 · Shallots 26012 · Chilli flakes 25057'),

  ('b1000001-0000-0000-0000-000000000009', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'Goods-in records available?', 'dropdown', true, 9,
   '["Yes", "No"]'::jsonb, null),

  ('b1000001-0000-0000-0000-000000000010', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'Production records available?', 'dropdown', true, 10,
   '["Yes", "No"]'::jsonb, null),

  ('b1000001-0000-0000-0000-000000000011', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'Product matches across all documents?', 'dropdown', true, 11,
   '["Yes", "No"]'::jsonb, null),

  ('b1000001-0000-0000-0000-000000000012', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'Trace successful?', 'dropdown', true, 12,
   '["Yes", "No"]'::jsonb, null),

  ('b1000001-0000-0000-0000-000000000013', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'Actions required', 'text', false, 13, null,
   'Leave blank if none'),

  ('b1000001-0000-0000-0000-000000000014', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'Completed by', 'signature', true, 14, null, null);


-- ─────────────────────────────────────────────────────────────────────────────
-- SUPPLIERS TABLE
-- ─────────────────────────────────────────────────────────────────────────────

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

-- Seed known suppliers (details to be completed in the admin UI)
INSERT INTO suppliers (name, type, supplies, saq_completed, status) VALUES
  ('AA Produce',                    'raw_material', 'Fresh produce',        true,  'approved'),
  ('Hill Farm',                     'raw_material', 'Rapeseed oil',         true,  'approved'),
  ('Wanahong - Oriental Essentials','raw_material', 'Oriental ingredients', true,  'approved'),
  ('The Chilli Doctor',             'raw_material', 'Chilli products',      true,  'approved'),
  ('Sichuan Hein Food Co',          'raw_material', 'Sichuan ingredients',  true,  'approved'),
  ('Foodnet',                       'raw_material', 'Food ingredients',     true,  'approved'),
  ('Nutricraft',                    'raw_material', 'Ingredients',          true,  'approved'),
  ('Glassworks International',      'packaging',    'Glass jars',           true,  'approved'),
  ('The Bottle Company',            'packaging',    'Bottles',              true,  'approved'),
  ('Challenge Packaging',           'packaging',    'Packaging materials',  true,  'approved');

COMMIT;
