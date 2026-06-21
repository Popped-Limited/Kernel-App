-- ============================================================
-- POPPED LIMITED — Demo seed data
-- Account: support@kernelapp.co.uk
-- Org:     00000000-0000-0000-0000-000000000000 (Kernel Admin)
-- ============================================================
-- BEFORE RUNNING: confirm the org for support@kernelapp.co.uk:
--
--   SELECT om.organisation_id, o.name
--   FROM   organisation_members om
--   JOIN   organisations        o ON o.id = om.organisation_id
--   JOIN   auth.users           u ON u.id = om.user_id
--   WHERE  u.email = 'support@kernelapp.co.uk';
--
-- If the result differs from 00000000-0000-0000-0000-000000000000,
-- update the `org` variable at the top of the DO block below.
-- ============================================================

DO $$
DECLARE
  org uuid := '00000000-0000-0000-0000-000000000000';

  -- Checklist IDs
  cl_chilli    uuid;
  cl_sichuan   uuid;
  cl_ghost     uuid;
  cl_opening   uuid;
  cl_eod       uuid;
  cl_goods_in  uuid;
  cl_complaint uuid;
  cl_starter   uuid;

  -- Ingredient IDs
  ing_kernels  uuid;
  ing_oil      uuid;
  ing_chilli_b uuid;
  ing_sich_b   uuid;
  ing_ghost_b  uuid;
  ing_salt     uuid;
  ing_bag85    uuid;
  ing_bag150   uuid;
  ing_lbl_c    uuid;
  ing_lbl_s    uuid;
  ing_lbl_g    uuid;

  -- Supplier IDs
  sup_kernels  uuid;
  sup_oil      uuid;
  sup_spice    uuid;
  sup_pack     uuid;
  sup_labels   uuid;

  -- Submission IDs
  sub1 uuid; sub2 uuid; sub3 uuid; sub4 uuid; sub5 uuid;
  sub6 uuid; sub7 uuid; sub8 uuid;

BEGIN

-- ────────────────────────────────────────────────────────────
-- 1. Rename the demo org
-- ────────────────────────────────────────────────────────────
UPDATE organisations
SET    name = 'Popped Limited', slug = 'popped-limited'
WHERE  id = org;

-- ────────────────────────────────────────────────────────────
-- 2. Team members
-- (team_members has no org column — these are globally visible,
--  but they use fictional @poppedlimited.co.uk emails so won't
--  conflict with real Yep Kitchen staff)
-- ────────────────────────────────────────────────────────────
INSERT INTO team_members (name, email, role, active) VALUES
  ('Sarah Mitchell', 'sarah@poppedlimited.co.uk',  'admin',   true),
  ('Jake Thompson',  'jake@poppedlimited.co.uk',   'manager', true),
  ('Priya Patel',    'priya@poppedlimited.co.uk',  'staff',   true),
  ('Leo Banks',      'leo@poppedlimited.co.uk',    'staff',   true)
ON CONFLICT (email) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 3. Suppliers
-- ────────────────────────────────────────────────────────────
INSERT INTO suppliers
  (name, type, supplies, certification, cert_expiry,
   saq_completed, saq_date,
   supplier_risk, raw_material_risk, review_frequency_years, next_review_due,
   status, notes, organisation_id)
VALUES
  ('Kernels & Co',
   'raw_material', 'Mushroom popcorn kernels',
   'SALSA', '2027-02-28',
   true, '2026-02-20',
   'low', 'low', 2, '2028-02-20',
   'approved', 'Primary kernel supplier. Annual visit completed Mar 2026.', org),

  ('GoldenPress Oils',
   'raw_material', 'Cold-pressed rapeseed oil',
   'BRCGS', '2027-06-30',
   true, '2026-06-01',
   'low', 'low', 3, '2029-06-01',
   'approved', 'AA grade cold-pressed oil. No allergen risk.', org),

  ('The Spice Works',
   'raw_material', 'Dry seasoning blends',
   'SALSA', '2026-11-15',
   true, '2025-11-10',
   'medium', 'medium', 1, '2026-11-10',
   'approved', 'Blends manufactured in dedicated facility. Allergen declarations provided per batch.', org),

  ('FlexiPack Ltd',
   'packaging', 'Kraft popcorn bags (85g & 150g)',
   'None', null,
   true, '2026-01-15',
   'low', 'low', 2, '2028-01-15',
   'approved', 'Food-grade kraft bags. FDA & EU contact material approved.', org),

  ('Sheffield Labels',
   'packaging', 'Printed product labels',
   'None', null,
   false, null,
   'low', 'low', 2, '2027-06-01',
   'under_review', 'SAQ sent May 2026 — awaiting return.', org)
ON CONFLICT DO NOTHING;

SELECT id INTO sup_kernels FROM suppliers WHERE name = 'Kernels & Co'     AND organisation_id = org LIMIT 1;
SELECT id INTO sup_oil     FROM suppliers WHERE name = 'GoldenPress Oils' AND organisation_id = org LIMIT 1;
SELECT id INTO sup_spice   FROM suppliers WHERE name = 'The Spice Works'  AND organisation_id = org LIMIT 1;
SELECT id INTO sup_pack    FROM suppliers WHERE name = 'FlexiPack Ltd'    AND organisation_id = org LIMIT 1;
SELECT id INTO sup_labels  FROM suppliers WHERE name = 'Sheffield Labels' AND organisation_id = org LIMIT 1;

-- ────────────────────────────────────────────────────────────
-- 4. Ingredients
-- (global UNIQUE on name — using distinct PL-specific names)
-- ────────────────────────────────────────────────────────────
INSERT INTO ingredients (name, type, unit, supplier_id, allergens, organisation_id) VALUES
  ('Mushroom popcorn kernels',        'ingredient', 'g',     sup_kernels, null,            org),
  ('PL cold-pressed rapeseed oil',    'ingredient', 'g',     sup_oil,     null,            org),
  ('Chilli seasoning blend',          'ingredient', 'g',     sup_spice,   null,            org),
  ('Sichuan pepper seasoning blend',  'ingredient', 'g',     sup_spice,   null,            org),
  ('Ghost chilli seasoning blend',    'ingredient', 'g',     sup_spice,   null,            org),
  ('PL fine sea salt',                'ingredient', 'g',     null,        null,            org),
  ('Kraft bag 85g (natural)',         'packaging',  'units', sup_pack,    null,            org),
  ('Kraft bag 150g (natural)',        'packaging',  'units', sup_pack,    null,            org),
  ('Label — Chilli Popcorn 85g',      'packaging',  'units', sup_labels,  null,            org),
  ('Label — Sichuan Pepper 85g',      'packaging',  'units', sup_labels,  null,            org),
  ('Label — Ghost Chilli 85g',        'packaging',  'units', sup_labels,  null,            org)
ON CONFLICT (name) DO NOTHING;

SELECT id INTO ing_kernels  FROM ingredients WHERE name = 'Mushroom popcorn kernels'       LIMIT 1;
SELECT id INTO ing_oil      FROM ingredients WHERE name = 'PL cold-pressed rapeseed oil'   LIMIT 1;
SELECT id INTO ing_chilli_b FROM ingredients WHERE name = 'Chilli seasoning blend'         LIMIT 1;
SELECT id INTO ing_sich_b   FROM ingredients WHERE name = 'Sichuan pepper seasoning blend' LIMIT 1;
SELECT id INTO ing_ghost_b  FROM ingredients WHERE name = 'Ghost chilli seasoning blend'   LIMIT 1;
SELECT id INTO ing_salt     FROM ingredients WHERE name = 'PL fine sea salt'               LIMIT 1;
SELECT id INTO ing_bag85    FROM ingredients WHERE name = 'Kraft bag 85g (natural)'        LIMIT 1;
SELECT id INTO ing_bag150   FROM ingredients WHERE name = 'Kraft bag 150g (natural)'       LIMIT 1;
SELECT id INTO ing_lbl_c    FROM ingredients WHERE name = 'Label — Chilli Popcorn 85g'     LIMIT 1;
SELECT id INTO ing_lbl_s    FROM ingredients WHERE name = 'Label — Sichuan Pepper 85g'     LIMIT 1;
SELECT id INTO ing_lbl_g    FROM ingredients WHERE name = 'Label — Ghost Chilli 85g'       LIMIT 1;

-- ────────────────────────────────────────────────────────────
-- 5. Ingredient lots (recent stock deliveries — June 2026)
-- Julian code format: DDD-YY  (day of year – 2-digit year)
-- ────────────────────────────────────────────────────────────
INSERT INTO ingredient_lots
  (ingredient_id, julian_code, quantity_received_g, quantity_remaining_g,
   received_date, supplier, best_before_date, created_by, organisation_id)
VALUES
  -- Kernels (two deliveries — first nearly used up)
  (ing_kernels, '110-26', 25000,  2400,  '2026-04-20', 'Kernels & Co',        '2027-04-20', 'Kernel Mustard', org),
  (ing_kernels, '152-26', 25000, 21600,  '2026-06-01', 'Kernels & Co',        '2027-06-01', 'Kernel Sanders', org),

  -- Oil
  (ing_oil,     '130-26', 20000, 13800,  '2026-05-10', 'GoldenPress Oils',    '2027-11-10', 'Kernel Mustard', org),

  -- Seasoning blends
  (ing_chilli_b,'140-26',  5000,  3200,  '2026-05-20', 'The Spice Works',     '2027-05-20', 'Kernel Sanders', org),
  (ing_sich_b,  '140-26',  5000,  4100,  '2026-05-20', 'The Spice Works',     '2027-05-20', 'Kernel Sanders', org),
  (ing_ghost_b, '125-26',  3000,  2600,  '2026-05-05', 'The Spice Works',     '2027-05-05', 'Kernel Mustard', org),

  -- Salt
  (ing_salt,    '050-26',  5000,  4350,  '2026-02-19', null,                  '2028-02-19', 'Kernel Sanders', org),

  -- Bags (two deliveries)
  (ing_bag85,   '098-26',  2000,   820,  '2026-04-08', 'FlexiPack Ltd',       null,         'Kernel Mustard', org),
  (ing_bag85,   '152-26',  3000,  2980,  '2026-06-01', 'FlexiPack Ltd',       null,         'Kernel Mustard', org),
  (ing_bag150,  '098-26',  1000,   640,  '2026-04-08', 'FlexiPack Ltd',       null,         'Kernel Mustard', org),

  -- Labels
  (ing_lbl_c,   '098-26',  3000,  1820,  '2026-04-08', 'Sheffield Labels',    null,         'Kernel Sanders', org),
  (ing_lbl_s,   '098-26',  3000,  2240,  '2026-04-08', 'Sheffield Labels',    null,         'Kernel Sanders', org),
  (ing_lbl_g,   '098-26',  2000,  1650,  '2026-04-08', 'Sheffield Labels',    null,         'Kernel Sanders', org);

-- ────────────────────────────────────────────────────────────
-- 6. Checklists
-- ────────────────────────────────────────────────────────────

-- ── Production records ──────────────────────────────────────
INSERT INTO checklists (name, frequency, category, description, active, organisation_id, color)
VALUES (
  'Chilli Popcorn — Production Record',
  'per_batch', 'Production',
  'Complete all sections during and after each Chilli Popcorn production run.',
  true, org, '#E8916A'
) RETURNING id INTO cl_chilli;

INSERT INTO questions (checklist_id, label, type, required, order_index, options, hint, organisation_id)
VALUES
  (cl_chilli, 'Batch code',             'text',      true,  0, null, 'e.g. CP-260601-01', org),
  (cl_chilli, 'Best before date',       'date',      true,  1, null, null, org),
  (cl_chilli, 'Ingredients — batch codes and actual weights (g)', 'ingredient_table', true, 2,
   '["Mushroom popcorn kernels|12000","PL cold-pressed rapeseed oil|800","Chilli seasoning blend|1200","PL fine sea salt|50"]'::jsonb,
   'Enter the lot code and actual weight used for each ingredient', org),
  (cl_chilli, 'CCP 1 — Popping oil temperature (°C)', 'number', true, 3, null, 'Must reach ≥180°C. If below: halt, re-heat and re-check before continuing.', org),
  (cl_chilli, 'CCP 2 — Metal detection: all bags passed?', 'dropdown', true, 4, '["Yes","No — see corrective action"]'::jsonb, 'Run every bag through the metal detector. Any reject must be quarantined and investigated.', org),
  (cl_chilli, 'Weight check — start of run (g)',  'number', true, 5, null, 'Target: 85g ±3g', org),
  (cl_chilli, 'Weight check — middle of run (g)', 'number', true, 6, null, 'Target: 85g ±3g', org),
  (cl_chilli, 'Weight check — end of run (g)',    'number', true, 7, null, 'Target: 85g ±3g', org),
  (cl_chilli, 'Any underweight bags found?',      'dropdown', true, 8, '["No","Yes — reworked","Yes — destroyed"]'::jsonb, null, org),
  (cl_chilli, 'Corrective action taken (if any)', 'text', false, 9, null, 'Leave blank if no issues.', org),
  (cl_chilli, 'Total bags produced',              'number', true, 10, null, null, org),
  (cl_chilli, 'Allergen area clean-down completed before this run?', 'checkbox', true, 11, null, null, org),
  (cl_chilli, 'Labelling verified — correct batch code and best before on label', 'checkbox', true, 12, null, null, org),
  (cl_chilli, 'Completed by',                     'text', true, 13, null, 'Your full name', org),
  (cl_chilli, 'Signed off by (manager)',           'signature', true, 14, null, null, org);

INSERT INTO checklists (name, frequency, category, description, active, organisation_id, color)
VALUES (
  'Sichuan Pepper Popcorn — Production Record',
  'per_batch', 'Production',
  'Complete all sections during and after each Sichuan Pepper Popcorn production run.',
  true, org, '#7BA8D4'
) RETURNING id INTO cl_sichuan;

INSERT INTO questions (checklist_id, label, type, required, order_index, options, hint, organisation_id)
VALUES
  (cl_sichuan, 'Batch code',             'text',      true,  0, null, 'e.g. SP-260601-01', org),
  (cl_sichuan, 'Best before date',       'date',      true,  1, null, null, org),
  (cl_sichuan, 'Ingredients — batch codes and actual weights (g)', 'ingredient_table', true, 2,
   '["Mushroom popcorn kernels|12000","PL cold-pressed rapeseed oil|800","Sichuan pepper seasoning blend|1100","PL fine sea salt|50"]'::jsonb,
   'Enter the lot code and actual weight used for each ingredient', org),
  (cl_sichuan, 'CCP 1 — Popping oil temperature (°C)', 'number', true, 3, null, 'Must reach ≥180°C.', org),
  (cl_sichuan, 'CCP 2 — Metal detection: all bags passed?', 'dropdown', true, 4, '["Yes","No — see corrective action"]'::jsonb, null, org),
  (cl_sichuan, 'Weight check — start of run (g)',  'number', true, 5, null, 'Target: 85g ±3g', org),
  (cl_sichuan, 'Weight check — middle of run (g)', 'number', true, 6, null, 'Target: 85g ±3g', org),
  (cl_sichuan, 'Weight check — end of run (g)',    'number', true, 7, null, 'Target: 85g ±3g', org),
  (cl_sichuan, 'Any underweight bags found?',      'dropdown', true, 8, '["No","Yes — reworked","Yes — destroyed"]'::jsonb, null, org),
  (cl_sichuan, 'Corrective action taken (if any)', 'text', false, 9, null, 'Leave blank if no issues.', org),
  (cl_sichuan, 'Total bags produced',              'number', true, 10, null, null, org),
  (cl_sichuan, 'Allergen area clean-down completed before this run?', 'checkbox', true, 11, null, null, org),
  (cl_sichuan, 'Labelling verified — correct batch code and best before on label', 'checkbox', true, 12, null, null, org),
  (cl_sichuan, 'Completed by',                     'text', true, 13, null, 'Your full name', org),
  (cl_sichuan, 'Signed off by (manager)',           'signature', true, 14, null, null, org);

INSERT INTO checklists (name, frequency, category, description, active, organisation_id, color)
VALUES (
  'Ghost Chilli Popcorn — Production Record',
  'per_batch', 'Production',
  'Complete all sections during and after each Ghost Chilli Popcorn production run.',
  true, org, '#B09FD4'
) RETURNING id INTO cl_ghost;

INSERT INTO questions (checklist_id, label, type, required, order_index, options, hint, organisation_id)
VALUES
  (cl_ghost, 'Batch code',             'text',      true,  0, null, 'e.g. GC-260601-01', org),
  (cl_ghost, 'Best before date',       'date',      true,  1, null, null, org),
  (cl_ghost, 'Ingredients — batch codes and actual weights (g)', 'ingredient_table', true, 2,
   '["Mushroom popcorn kernels|12000","PL cold-pressed rapeseed oil|800","Ghost chilli seasoning blend|900","PL fine sea salt|50"]'::jsonb,
   'Enter the lot code and actual weight used for each ingredient', org),
  (cl_ghost, 'CCP 1 — Popping oil temperature (°C)', 'number', true, 3, null, 'Must reach ≥180°C.', org),
  (cl_ghost, 'CCP 2 — Metal detection: all bags passed?', 'dropdown', true, 4, '["Yes","No — see corrective action"]'::jsonb, null, org),
  (cl_ghost, 'Weight check — start of run (g)',  'number', true, 5, null, 'Target: 85g ±3g', org),
  (cl_ghost, 'Weight check — middle of run (g)', 'number', true, 6, null, 'Target: 85g ±3g', org),
  (cl_ghost, 'Weight check — end of run (g)',    'number', true, 7, null, 'Target: 85g ±3g', org),
  (cl_ghost, 'Any underweight bags found?',      'dropdown', true, 8, '["No","Yes — reworked","Yes — destroyed"]'::jsonb, null, org),
  (cl_ghost, 'Corrective action taken (if any)', 'text', false, 9, null, 'Leave blank if no issues.', org),
  (cl_ghost, 'Total bags produced',              'number', true, 10, null, null, org),
  (cl_ghost, 'Allergen area clean-down completed before this run?', 'checkbox', true, 11, null, null, org),
  (cl_ghost, 'Labelling verified — correct batch code and best before on label', 'checkbox', true, 12, null, null, org),
  (cl_ghost, 'Completed by',                     'text', true, 13, null, 'Your full name', org),
  (cl_ghost, 'Signed off by (manager)',           'signature', true, 14, null, null, org);

-- ── Opening checks ──────────────────────────────────────────
INSERT INTO checklists (name, frequency, category, description, active, organisation_id)
VALUES (
  'Popped — Opening Checks',
  'per_shift_am', 'Food Safety',
  'Complete before any production begins. All items must pass before the shift starts.',
  true, org
) RETURNING id INTO cl_opening;

INSERT INTO questions (checklist_id, label, type, required, order_index, options, hint, organisation_id)
VALUES
  (cl_opening, 'Date',                                              'date',     true,  0, null, null, org),
  (cl_opening, 'Completed by',                                      'text',     true,  1, null, 'Your full name', org),
  (cl_opening, 'Hands washed on entry to production area?',         'checkbox', true,  2, null, null, org),
  (cl_opening, 'All PPE (hairnet, apron, gloves) worn?',            'checkbox', true,  3, null, null, org),
  (cl_opening, 'No jewellery (other than plain wedding band)?',      'checkbox', true,  4, null, null, org),
  (cl_opening, 'Production area surfaces clean and sanitised?',     'checkbox', true,  5, null, null, org),
  (cl_opening, 'Equipment inspected and in good working order?',    'checkbox', true,  6, null, null, org),
  (cl_opening, 'No signs of pest activity (droppings, damage, tracks)?', 'checkbox', true, 7, null, null, org),
  (cl_opening, 'Allergens for today confirmed — segregation plan in place?', 'checkbox', true, 8, null, null, org),
  (cl_opening, 'All cleaning records from previous shift complete?', 'checkbox', true, 9, null, null, org),
  (cl_opening, 'Any maintenance issues to report before starting?',  'text',    false, 10, null, 'Leave blank if none', org),
  (cl_opening, 'Signed off by (supervisor)',                         'text',    true,  11, null, null, org);

-- ── End of day cleaning ─────────────────────────────────────
INSERT INTO checklists (name, frequency, category, description, active, organisation_id)
VALUES (
  'Popped — End of Day Cleaning',
  'per_shift_eod', 'Cleaning',
  'Complete at the end of every production shift before leaving the site.',
  true, org
) RETURNING id INTO cl_eod;

INSERT INTO questions (checklist_id, label, type, required, order_index, options, hint, organisation_id)
VALUES
  (cl_eod, 'Date',                                                  'date',     true,  0, null, null, org),
  (cl_eod, 'Completed by',                                          'text',     true,  1, null, 'Your full name', org),
  (cl_eod, 'All production surfaces cleaned and sanitised?',        'checkbox', true,  2, null, null, org),
  (cl_eod, 'Popcorn machine cleaned — kettle, oil drain, exterior?','checkbox', true,  3, null, null, org),
  (cl_eod, 'Seasoning drum/applicator cleaned?',                    'checkbox', true,  4, null, null, org),
  (cl_eod, 'Metal detector cleaned and pass-test run?',             'checkbox', true,  5, null, null, org),
  (cl_eod, 'Weighing scales cleaned and zeroed?',                   'checkbox', true,  6, null, null, org),
  (cl_eod, 'Floors swept and mopped?',                              'checkbox', true,  7, null, null, org),
  (cl_eod, 'Waste bags removed and bins lined?',                    'checkbox', true,  8, null, null, org),
  (cl_eod, 'Raw materials sealed and stored correctly?',            'checkbox', true,  9, null, null, org),
  (cl_eod, 'Finished goods moved to despatch area / cold store?',   'checkbox', true, 10, null, null, org),
  (cl_eod, 'Allergen clean-down completed (if allergen change today)?', 'dropdown', true, 11, '["Yes","No — same allergen profile as yesterday","N/A — single product day"]'::jsonb, null, org),
  (cl_eod, 'Any maintenance issues noted?',                         'text',    false, 12, null, 'Leave blank if none', org),
  (cl_eod, 'Signed off by (supervisor)',                            'text',    true,  13, null, null, org);

-- ── Goods In ────────────────────────────────────────────────
INSERT INTO checklists (name, frequency, category, description, active, organisation_id)
VALUES (
  'Popped — Goods In',
  'per_delivery', 'Goods In',
  'Complete for every raw material or packaging delivery received on site.',
  true, org
) RETURNING id INTO cl_goods_in;

INSERT INTO questions (checklist_id, label, type, required, order_index, options, hint, organisation_id)
VALUES
  (cl_goods_in, 'Date',                                             'date',     true,  0, null, null, org),
  (cl_goods_in, 'Supplier name',                                    'text',     true,  1, null, null, org),
  (cl_goods_in, 'Delivery note / reference number',                 'text',     true,  2, null, null, org),
  (cl_goods_in, 'Products received (list all items)',               'text',     true,  3, null, 'e.g. Mushroom popcorn kernels ×2 sacks', org),
  (cl_goods_in, 'Packaging intact and undamaged?',                  'dropdown', true,  4, '["Yes","No — see notes"]'::jsonb, null, org),
  (cl_goods_in, 'Correct quantities received?',                     'dropdown', true,  5, '["Yes","No — shortage noted","No — excess noted"]'::jsonb, null, org),
  (cl_goods_in, 'Batch codes / lot numbers recorded in stock?',     'checkbox', true,  6, null, null, org),
  (cl_goods_in, 'Best before / use by dates checked?',              'checkbox', true,  7, null, null, org),
  (cl_goods_in, 'Temperature of chilled goods on arrival (°C)',     'number',   false, 8, null, 'Only required for chilled/frozen deliveries. Leave blank if ambient.', org),
  (cl_goods_in, 'Any rejections?',                                  'dropdown', true,  9, '["No","Yes — see notes"]'::jsonb, null, org),
  (cl_goods_in, 'Rejection or shortfall details',                   'text',     false, 10, null, 'Leave blank if no issues', org),
  (cl_goods_in, 'Goods accepted and put away?',                     'checkbox', true,  11, null, null, org),
  (cl_goods_in, 'Received by',                                      'text',     true,  12, null, 'Your full name', org);

-- ── Complaint record ────────────────────────────────────────
INSERT INTO checklists (name, frequency, category, description, active, organisation_id)
VALUES (
  'Popped — Complaint Record',
  'per_complaint', 'Compliance',
  'Complete for every customer or consumer complaint received. Retain a copy in the compliance file.',
  true, org
) RETURNING id INTO cl_complaint;

INSERT INTO questions (checklist_id, label, type, required, order_index, options, hint, organisation_id)
VALUES
  (cl_complaint, 'Date complaint received',     'date',     true,  0, null, null, org),
  (cl_complaint, 'Customer / consumer name',    'text',     true,  1, null, null, org),
  (cl_complaint, 'Contact details',             'text',     true,  2, null, 'Phone or email', org),
  (cl_complaint, 'Product name',                'dropdown', true,  3, '["Chilli Popcorn 85g","Sichuan Pepper Popcorn 85g","Ghost Chilli Popcorn 85g","Other"]'::jsonb, null, org),
  (cl_complaint, 'Batch code',                  'text',     true,  4, null, null, org),
  (cl_complaint, 'Best before date on pack',    'date',     false, 5, null, null, org),
  (cl_complaint, 'Nature of complaint',         'text',     true,  6, null, 'Describe the issue in the customer''s own words', org),
  (cl_complaint, 'Complaint category',          'dropdown', true,  7,
   '["Foreign body","Quality / taste issue","Weight short","Labelling error","Allergen concern","Illness / food poisoning","Packaging failure","Other"]'::jsonb, null, org),
  (cl_complaint, 'Investigation findings',      'text',     true,  8, null, null, org),
  (cl_complaint, 'Root cause identified',       'text',     true,  9, null, null, org),
  (cl_complaint, 'Corrective action taken',     'text',     true, 10, null, null, org),
  (cl_complaint, 'Customer response sent?',     'dropdown', true, 11, '["Yes","Pending","No — not required"]'::jsonb, null, org),
  (cl_complaint, 'Allergy alert or RASFF notification required?', 'dropdown', true, 12, '["No","Yes — notified FSA"]'::jsonb, null, org),
  (cl_complaint, 'Closed by',                   'text',     true, 13, null, 'Manager name', org);

-- ── New starter training sign-off ───────────────────────────
INSERT INTO checklists (name, frequency, category, description, active, organisation_id)
VALUES (
  'Popped — New Starter Sign-Off',
  'per_new_start', 'HR',
  'Complete for every new team member on or before their first production shift.',
  true, org
) RETURNING id INTO cl_starter;

INSERT INTO questions (checklist_id, label, type, required, order_index, options, hint, organisation_id)
VALUES
  (cl_starter, 'Employee name',                           'text',     true,  0, null, null, org),
  (cl_starter, 'Start date',                              'date',     true,  1, null, null, org),
  (cl_starter, 'Role',                                    'dropdown', true,  2, '["Production operative","Packer","Driver","Supervisor","Other"]'::jsonb, null, org),
  (cl_starter, 'Level 2 Food Hygiene certificate held?',  'dropdown', true,  3, '["Yes — copy on file","No — booked","No — to be arranged"]'::jsonb, null, org),
  (cl_starter, 'Allergen awareness training completed?',  'checkbox', true,  4, null, 'Walk through the allergen matrix and confirm understanding', org),
  (cl_starter, 'HACCP / food safety principles covered?', 'checkbox', true,  5, null, null, org),
  (cl_starter, 'Metal detection procedure demonstrated?', 'checkbox', true,  6, null, null, org),
  (cl_starter, 'Weight checking procedure demonstrated?', 'checkbox', true,  7, null, null, org),
  (cl_starter, 'Emergency procedures covered?',           'checkbox', true,  8, null, 'Fire exits, first aid kit location, incident reporting', org),
  (cl_starter, 'Manual handling guidance given?',         'checkbox', true,  9, null, null, org),
  (cl_starter, 'Employee signature',                      'signature',true, 10, null, null, org),
  (cl_starter, 'Signed off by (manager)',                 'text',     true, 11, null, 'e.g. Kernel Sanders', org);

-- ────────────────────────────────────────────────────────────
-- 7. Production calendar — current week (9–14 Jun 2026)
--    + a few events from last week
-- ────────────────────────────────────────────────────────────
INSERT INTO production_calendar (event_date, title, type, checklist_id, organisation_id, created_by) VALUES
  -- Last week
  ('2026-06-02', 'Chilli Popcorn',         'production', cl_chilli,  org, 'Priya Patel'),
  ('2026-06-03', 'Sichuan Pepper Popcorn', 'production', cl_sichuan, org, 'Priya Patel'),
  ('2026-06-04', 'Ghost Chilli Popcorn',   'production', cl_ghost,   org, 'Jake Thompson'),
  ('2026-06-05', 'Packing day',            'custom',     null,       org, 'Jake Thompson'),
  -- This week
  ('2026-06-09', 'Chilli Popcorn',         'production', cl_chilli,  org, 'Sarah Mitchell'),
  ('2026-06-09', 'Sichuan Pepper Popcorn', 'production', cl_sichuan, org, 'Sarah Mitchell'),
  ('2026-06-10', 'Ghost Chilli Popcorn',   'production', cl_ghost,   org, 'Sarah Mitchell'),
  ('2026-06-11', 'Packing & despatch',     'custom',     null,       org, 'Jake Thompson'),
  ('2026-06-12', 'Chilli Popcorn',         'production', cl_chilli,  org, 'Priya Patel'),
  ('2026-06-13', 'Farmers market — Sheffield', 'custom', null,       org, 'Jake Thompson');

-- ────────────────────────────────────────────────────────────
-- 8. Dispatches (past 6 weeks — Apr 28 to Jun 9 2026)
-- ────────────────────────────────────────────────────────────
INSERT INTO dispatches
  (dispatch_date, product, customer, cases_of_6, cases_of_3, singles, total_units, reference, dispatched_by, notes, organisation_id)
VALUES
  ('2026-04-29', 'Chilli Popcorn 85g',           'Selfridges Food Hall',          4,  2,  6,  36,  'SF-2604-001', 'Jake Thompson',  null, org),
  ('2026-04-29', 'Sichuan Pepper Popcorn 85g',   'Selfridges Food Hall',          2,  1,  0,  15,  'SF-2604-001', 'Jake Thompson',  null, org),
  ('2026-05-06', 'Chilli Popcorn 85g',           'Whole Foods Market Kensington', 6,  0,  12, 48,  'WF-2605-003', 'Priya Patel',    null, org),
  ('2026-05-06', 'Ghost Chilli Popcorn 85g',     'Whole Foods Market Kensington', 2,  0,  6,  18,  'WF-2605-003', 'Priya Patel',    null, org),
  ('2026-05-13', 'Sichuan Pepper Popcorn 85g',   'Harvey Nichols Food Market',    3,  2,  0,  24,  'HN-2605-007', 'Jake Thompson',  null, org),
  ('2026-05-13', 'Chilli Popcorn 85g',           'Harvey Nichols Food Market',    3,  0,  6,  24,  'HN-2605-007', 'Jake Thompson',  null, org),
  ('2026-05-20', 'Ghost Chilli Popcorn 85g',     'The Deli Box — Manchester',     2,  1,  0,  15,  'DB-2605-012', 'Priya Patel',    null, org),
  ('2026-05-20', 'Chilli Popcorn 85g',           'The Deli Box — Manchester',     4,  0,  0,  24,  'DB-2605-012', 'Priya Patel',    null, org),
  ('2026-05-27', 'Chilli Popcorn 85g',           'Fortnum & Mason',               6,  2,  0,  42,  'FM-2605-019', 'Jake Thompson',  'Fortnum summer range launch', org),
  ('2026-05-27', 'Sichuan Pepper Popcorn 85g',   'Fortnum & Mason',               4,  0,  6,  30,  'FM-2605-019', 'Jake Thompson',  'Fortnum summer range launch', org),
  ('2026-05-27', 'Ghost Chilli Popcorn 85g',     'Fortnum & Mason',               2,  2,  0,  18,  'FM-2605-019', 'Jake Thompson',  'Fortnum summer range launch', org),
  ('2026-06-03', 'Chilli Popcorn 85g',           'Nordic Provisions — Edinburgh', 3,  1,  0,  21,  'NP-2606-002', 'Priya Patel',    null, org),
  ('2026-06-03', 'Sichuan Pepper Popcorn 85g',   'Nordic Provisions — Edinburgh', 2,  1,  6,  21,  'NP-2606-002', 'Priya Patel',    null, org),
  ('2026-06-05', 'Chilli Popcorn 85g',           'Selfridges Food Hall',          4,  2,  0,  30,  'SF-2606-005', 'Jake Thompson',  null, org),
  ('2026-06-05', 'Ghost Chilli Popcorn 85g',     'Selfridges Food Hall',          2,  0,  6,  18,  'SF-2606-005', 'Jake Thompson',  null, org);

-- ────────────────────────────────────────────────────────────
-- 9. Submissions — completed opening checks (Mon–Fri this week
--    + last week) and one full production batch record
-- ────────────────────────────────────────────────────────────

-- Opening check — Mon 2 Jun
INSERT INTO submissions (checklist_id, submitted_by, submitted_at, signed_off_by, signed_off_at, organisation_id)
VALUES (cl_opening, 'Priya Patel', '2026-06-02 07:48:00+00', 'Jake Thompson', '2026-06-02 07:55:00+00', org)
RETURNING id INTO sub1;
INSERT INTO answers (submission_id, question_id, value, organisation_id)
SELECT sub1, id, CASE order_index
  WHEN 0  THEN '"2026-06-02"'
  WHEN 1  THEN '"Priya Patel"'
  WHEN 11 THEN '"Jake Thompson"'
  ELSE 'true'
END, org
FROM questions WHERE checklist_id = cl_opening;

-- Opening check — Tue 3 Jun
INSERT INTO submissions (checklist_id, submitted_by, submitted_at, signed_off_by, signed_off_at, organisation_id)
VALUES (cl_opening, 'Leo Banks', '2026-06-03 07:52:00+00', 'Jake Thompson', '2026-06-03 07:58:00+00', org)
RETURNING id INTO sub2;
INSERT INTO answers (submission_id, question_id, value, organisation_id)
SELECT sub2, id, CASE order_index
  WHEN 0  THEN '"2026-06-03"'
  WHEN 1  THEN '"Leo Banks"'
  WHEN 11 THEN '"Jake Thompson"'
  ELSE 'true'
END, org
FROM questions WHERE checklist_id = cl_opening;

-- Opening check — Wed 4 Jun
INSERT INTO submissions (checklist_id, submitted_by, submitted_at, signed_off_by, signed_off_at, organisation_id)
VALUES (cl_opening, 'Priya Patel', '2026-06-04 07:45:00+00', 'Jake Thompson', '2026-06-04 07:53:00+00', org)
RETURNING id INTO sub3;
INSERT INTO answers (submission_id, question_id, value, organisation_id)
SELECT sub3, id, CASE order_index
  WHEN 0  THEN '"2026-06-04"'
  WHEN 1  THEN '"Priya Patel"'
  WHEN 11 THEN '"Jake Thompson"'
  ELSE 'true'
END, org
FROM questions WHERE checklist_id = cl_opening;

-- Opening check — Mon 9 Jun (today)
INSERT INTO submissions (checklist_id, submitted_by, submitted_at, signed_off_by, signed_off_at, organisation_id)
VALUES (cl_opening, 'Leo Banks', '2026-06-09 07:50:00+00', 'Jake Thompson', '2026-06-09 07:57:00+00', org)
RETURNING id INTO sub4;
INSERT INTO answers (submission_id, question_id, value, organisation_id)
SELECT sub4, id, CASE order_index
  WHEN 0  THEN '"2026-06-09"'
  WHEN 1  THEN '"Leo Banks"'
  WHEN 11 THEN '"Jake Thompson"'
  ELSE 'true'
END, org
FROM questions WHERE checklist_id = cl_opening;

-- EOD cleaning — Fri 6 Jun
INSERT INTO submissions (checklist_id, submitted_by, submitted_at, signed_off_by, signed_off_at, organisation_id)
VALUES (cl_eod, 'Priya Patel', '2026-06-06 17:30:00+00', 'Jake Thompson', '2026-06-06 17:40:00+00', org)
RETURNING id INTO sub5;
INSERT INTO answers (submission_id, question_id, value, organisation_id)
SELECT sub5, id, CASE order_index
  WHEN 0  THEN '"2026-06-06"'
  WHEN 1  THEN '"Priya Patel"'
  WHEN 11 THEN '"Yes"'
  WHEN 13 THEN '"Jake Thompson"'
  ELSE 'true'
END, org
FROM questions WHERE checklist_id = cl_eod;

-- Goods in — Jun 1 (kernels + oil delivery)
INSERT INTO submissions (checklist_id, submitted_by, submitted_at, signed_off_by, signed_off_at, organisation_id)
VALUES (cl_goods_in, 'Jake Thompson', '2026-06-01 09:15:00+00', 'Jake Thompson', '2026-06-01 09:30:00+00', org)
RETURNING id INTO sub6;
INSERT INTO answers (submission_id, question_id, value, organisation_id)
SELECT sub6, id, CASE order_index
  WHEN 0  THEN '"2026-06-01"'
  WHEN 1  THEN '"Kernels & Co"'
  WHEN 2  THEN '"KC-DN-260601"'
  WHEN 3  THEN '"Mushroom popcorn kernels ×1 sack (25 kg)"'
  WHEN 4  THEN '"Yes"'
  WHEN 5  THEN '"Yes"'
  WHEN 9  THEN '"No"'
  WHEN 12 THEN '"Jake Thompson"'
  ELSE 'true'
END, org
FROM questions WHERE checklist_id = cl_goods_in;

-- Completed Chilli Popcorn production record — 2 Jun 2026
INSERT INTO submissions (checklist_id, submitted_by, submitted_at, signed_off_by, signed_off_at, notes, organisation_id)
VALUES (cl_chilli, 'Priya Patel', '2026-06-02 14:30:00+00', 'Jake Thompson', '2026-06-02 14:45:00+00',
        'Good run. All CCPs passed first time.', org)
RETURNING id INTO sub7;
INSERT INTO answers (submission_id, question_id, value, organisation_id)
SELECT sub7, id, CASE order_index
  WHEN 0  THEN '"CP-260602-01"'
  WHEN 1  THEN '"2027-06-02"'
  WHEN 2  THEN '[{"name":"Mushroom popcorn kernels","lotCode":"152-26","actual":12050},{"name":"PL cold-pressed rapeseed oil","lotCode":"130-26","actual":805},{"name":"Chilli seasoning blend","lotCode":"140-26","actual":1198},{"name":"PL fine sea salt","lotCode":"050-26","actual":51}]'
  WHEN 3  THEN '192'
  WHEN 4  THEN '"Yes"'
  WHEN 5  THEN '85.4'
  WHEN 6  THEN '85.1'
  WHEN 7  THEN '84.8'
  WHEN 8  THEN '"No"'
  WHEN 10 THEN '138'
  WHEN 13 THEN '"Priya Patel"'
  ELSE 'true'
END, org
FROM questions WHERE checklist_id = cl_chilli;

-- Sichuan Pepper production record — 3 Jun 2026
INSERT INTO submissions (checklist_id, submitted_by, submitted_at, signed_off_by, signed_off_at, notes, organisation_id)
VALUES (cl_sichuan, 'Leo Banks', '2026-06-03 13:55:00+00', 'Jake Thompson', '2026-06-03 14:05:00+00',
        'Slightly lower yield than usual — kernels were a touch drier. Within spec.', org)
RETURNING id INTO sub8;
INSERT INTO answers (submission_id, question_id, value, organisation_id)
SELECT sub8, id, CASE order_index
  WHEN 0  THEN '"SP-260603-01"'
  WHEN 1  THEN '"2027-06-03"'
  WHEN 2  THEN '[{"name":"Mushroom popcorn kernels","lotCode":"152-26","actual":12000},{"name":"PL cold-pressed rapeseed oil","lotCode":"130-26","actual":800},{"name":"Sichuan pepper seasoning blend","lotCode":"140-26","actual":1095},{"name":"PL fine sea salt","lotCode":"050-26","actual":50}]'
  WHEN 3  THEN '188'
  WHEN 4  THEN '"Yes"'
  WHEN 5  THEN '85.2'
  WHEN 6  THEN '85.6'
  WHEN 7  THEN '84.7'
  WHEN 8  THEN '"No"'
  WHEN 10 THEN '124'
  WHEN 13 THEN '"Leo Banks"'
  ELSE 'true'
END, org
FROM questions WHERE checklist_id = cl_sichuan;

END $$;
