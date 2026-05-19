-- ============================================================
-- Run this in the Supabase SQL editor (supabase.com → project → SQL Editor)
-- ============================================================

-- 1. Create batch_drafts table for in-progress production records
CREATE TABLE IF NOT EXISTS batch_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  started_by text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  last_saved_at timestamptz NOT NULL DEFAULT now(),
  answers jsonb NOT NULL DEFAULT '{}'
);

ALTER TABLE batch_drafts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON batch_drafts TO anon;
CREATE POLICY "anon_all_batch_drafts" ON batch_drafts FOR ALL TO anon USING (true) WITH CHECK (true);


-- 2. Insert the 5 Yep Kitchen production batch record checklists
DO $$
DECLARE
  cl_garlic_oil uuid;
  cl_garlic_beef uuid;
  cl_sichuan_crisp uuid;
  cl_sichuan_dh uuid;
  cl_hunan uuid;
BEGIN

-- ── Garlic Chilli Oil ─────────────────────────────────────────────────────────
INSERT INTO checklists (name, frequency, category, description, active) VALUES (
  'Garlic Chilli Oil — Production Record', 'per_batch', 'Production',
  'F3.6 Production & Packing Record. Complete all sections during and after each production run.', true
) RETURNING id INTO cl_garlic_oil;

INSERT INTO questions (checklist_id, label, type, required, order_index, options, hint) VALUES
(cl_garlic_oil, 'Batch code', 'text', true, 0, null, 'e.g. GCO-250513-01'),
(cl_garlic_oil, 'Best before date', 'date', true, 1, null, null),
(cl_garlic_oil, 'Ingredients — batch codes and actual weights', 'ingredient_table', true, 2,
  '["Cold-pressed Rapeseed oil|32100","Red chilli|18000","Peeled garlic|8000","Light soy sauce|3270","Ginger|2500","Erjingtiao chilli flakes|2500","Sichuan peppercorn powder|600","Organic Shiitake mushroom powder|300","Sea salt|240"]'::jsonb,
  'Enter the batch code and actual weight for each ingredient'),
(cl_garlic_oil, 'CCP 1 — Cooking temperature recorded (°C)', 'number', true, 3, null, 'Must reach 80°C for 5 seconds (or 70°C for 2 minutes equivalent)'),
(cl_garlic_oil, 'CP — pH recorded', 'number', true, 4, null, 'Must be ≤ 4.75'),
(cl_garlic_oil, 'CCP 2 Hot Fill — Start temperature (°C)', 'number', true, 5, null, 'Must be >82°C'),
(cl_garlic_oil, 'CCP 2 Hot Fill — Middle temperature (°C)', 'number', true, 6, null, 'Must be >82°C'),
(cl_garlic_oil, 'CCP 2 Hot Fill — Finish temperature (°C)', 'number', true, 7, null, 'Must be >82°C'),
(cl_garlic_oil, 'Corrective action taken (if any)', 'text', false, 8, null, 'Describe any corrective actions. Leave blank if none required.'),
(cl_garlic_oil, 'Packaging tare weight samples — 5 Lid & Base measurements (g)', 'text', true, 10, null, 'Weigh 5 samples and enter each separated by commas, e.g: 52.1, 51.8, 52.3, 51.9, 52.0'),
(cl_garlic_oil, 'Tare weight used (g)', 'number', true, 11, null, 'Use the lightest of the 5 samples above'),
(cl_garlic_oil, 'Finished product weight — Start of run (g)', 'number', true, 12, null, null),
(cl_garlic_oil, 'Finished product weight — Middle of run (g)', 'number', true, 13, null, null),
(cl_garlic_oil, 'Finished product weight — End of run (g)', 'number', true, 14, null, null),
(cl_garlic_oil, 'Glass check inspection completed?', 'dropdown', true, 15, '["Yes","No"]'::jsonb, null),
(cl_garlic_oil, 'All glass jars/bottles intact?', 'dropdown', true, 16, '["Yes","No"]'::jsonb, null),
(cl_garlic_oil, 'If any jars not intact — how many? (Raise NC)', 'text', false, 17, null, 'Leave blank if all jars intact'),
(cl_garlic_oil, 'Packing log', 'packing_runs', true, 18, null, 'Record each packing run with pack weight, jar count, batch numbers and packer initials'),
(cl_garlic_oil, 'Total units produced', 'number', true, 19, null, null),
(cl_garlic_oil, 'Labelling verified — correct batch code and best before date confirmed on label', 'checkbox', true, 20, null, null);


-- ── Garlic Chilli Oil with Beef ───────────────────────────────────────────────
INSERT INTO checklists (name, frequency, category, description, active) VALUES (
  'Garlic Chilli Oil with Beef — Production Record', 'per_batch', 'Production',
  'F3.6 Production & Packing Record. Complete all sections during and after each production run.', true
) RETURNING id INTO cl_garlic_beef;

INSERT INTO questions (checklist_id, label, type, required, order_index, options, hint) VALUES
(cl_garlic_beef, 'Batch code', 'text', true, 0, null, 'e.g. GCOB-250513-01'),
(cl_garlic_beef, 'Best before date', 'date', true, 1, null, null),
(cl_garlic_beef, 'Ingredients — batch codes and actual weights', 'ingredient_table', true, 2,
  '["Cold-pressed Rapeseed oil|32100","Red chilli|18000","Peeled garlic|8000","Light soy sauce|3270","Ginger|2500","Erjingtiao chilli flakes|2500","Beef jerky|2000","Sichuan peppercorn powder|600","Organic Shiitake mushroom powder|300","Sea salt|240"]'::jsonb,
  'Enter the batch code and actual weight for each ingredient'),
(cl_garlic_beef, 'CCP 1 — Cooking temperature recorded (°C)', 'number', true, 3, null, 'Must reach 80°C for 5 seconds (or 70°C for 2 minutes equivalent)'),
(cl_garlic_beef, 'CP — pH recorded', 'number', true, 4, null, 'Must be ≤ 4.75'),
(cl_garlic_beef, 'CCP 2 Hot Fill — Start temperature (°C)', 'number', true, 5, null, 'Must be >82°C'),
(cl_garlic_beef, 'CCP 2 Hot Fill — Middle temperature (°C)', 'number', true, 6, null, 'Must be >82°C'),
(cl_garlic_beef, 'CCP 2 Hot Fill — Finish temperature (°C)', 'number', true, 7, null, 'Must be >82°C'),
(cl_garlic_beef, 'Corrective action taken (if any)', 'text', false, 8, null, 'Describe any corrective actions. Leave blank if none required.'),
(cl_garlic_beef, 'Packaging tare weight samples — 5 Lid & Base measurements (g)', 'text', true, 10, null, 'Weigh 5 samples and enter each separated by commas, e.g: 52.1, 51.8, 52.3, 51.9, 52.0'),
(cl_garlic_beef, 'Tare weight used (g)', 'number', true, 11, null, 'Use the lightest of the 5 samples above'),
(cl_garlic_beef, 'Finished product weight — Start of run (g)', 'number', true, 12, null, null),
(cl_garlic_beef, 'Finished product weight — Middle of run (g)', 'number', true, 13, null, null),
(cl_garlic_beef, 'Finished product weight — End of run (g)', 'number', true, 14, null, null),
(cl_garlic_beef, 'Glass check inspection completed?', 'dropdown', true, 15, '["Yes","No"]'::jsonb, null),
(cl_garlic_beef, 'All glass jars/bottles intact?', 'dropdown', true, 16, '["Yes","No"]'::jsonb, null),
(cl_garlic_beef, 'If any jars not intact — how many? (Raise NC)', 'text', false, 17, null, 'Leave blank if all jars intact'),
(cl_garlic_beef, 'Packing log', 'packing_runs', true, 18, null, 'Record each packing run with pack weight, jar count, batch numbers and packer initials'),
(cl_garlic_beef, 'Total units produced', 'number', true, 19, null, null),
(cl_garlic_beef, 'Labelling verified — correct batch code and best before date confirmed on label', 'checkbox', true, 20, null, null);


-- ── Sichuan Chilli Crisp ──────────────────────────────────────────────────────
INSERT INTO checklists (name, frequency, category, description, active) VALUES (
  'Sichuan Chilli Crisp — Production Record', 'per_batch', 'Production',
  'F3.6 Production & Packing Record. Complete all sections during and after each production run.', true
) RETURNING id INTO cl_sichuan_crisp;

INSERT INTO questions (checklist_id, label, type, required, order_index, options, hint) VALUES
(cl_sichuan_crisp, 'Batch code', 'text', true, 0, null, 'e.g. SCC-250513-01'),
(cl_sichuan_crisp, 'Best before date', 'date', true, 1, null, null),
(cl_sichuan_crisp, 'Ingredients — batch codes and actual weights', 'ingredient_table', true, 2,
  '["Cold-pressed Rapeseed oil|50450","Shallots|8800","Erjingtiao chilli flakes|8300","Light soy sauce|7020","Doubanjiang|5250","Sichuan peppercorn powder|1000","Mushroom powder|350","Sea salt|250"]'::jsonb,
  'Enter the batch code and actual weight for each ingredient'),
(cl_sichuan_crisp, 'CCP 1 — Cooking temperature recorded (°C)', 'number', true, 3, null, 'Must reach 80°C for 5 seconds (or 70°C for 2 minutes equivalent)'),
(cl_sichuan_crisp, 'CP — pH recorded', 'number', true, 4, null, 'Must be ≤ 4.75'),
(cl_sichuan_crisp, 'CCP 2 Hot Fill — Start temperature (°C)', 'number', true, 5, null, 'Must be >82°C'),
(cl_sichuan_crisp, 'CCP 2 Hot Fill — Middle temperature (°C)', 'number', true, 6, null, 'Must be >82°C'),
(cl_sichuan_crisp, 'CCP 2 Hot Fill — Finish temperature (°C)', 'number', true, 7, null, 'Must be >82°C'),
(cl_sichuan_crisp, 'Corrective action taken (if any)', 'text', false, 8, null, 'Describe any corrective actions. Leave blank if none required.'),
(cl_sichuan_crisp, 'Packaging tare weight samples — 5 Lid & Base measurements (g)', 'text', true, 10, null, 'Weigh 5 samples and enter each separated by commas, e.g: 52.1, 51.8, 52.3, 51.9, 52.0'),
(cl_sichuan_crisp, 'Tare weight used (g)', 'number', true, 11, null, 'Use the lightest of the 5 samples above'),
(cl_sichuan_crisp, 'Finished product weight — Start of run (g)', 'number', true, 12, null, null),
(cl_sichuan_crisp, 'Finished product weight — Middle of run (g)', 'number', true, 13, null, null),
(cl_sichuan_crisp, 'Finished product weight — End of run (g)', 'number', true, 14, null, null),
(cl_sichuan_crisp, 'Glass check inspection completed?', 'dropdown', true, 15, '["Yes","No"]'::jsonb, null),
(cl_sichuan_crisp, 'All glass jars/bottles intact?', 'dropdown', true, 16, '["Yes","No"]'::jsonb, null),
(cl_sichuan_crisp, 'If any jars not intact — how many? (Raise NC)', 'text', false, 17, null, 'Leave blank if all jars intact'),
(cl_sichuan_crisp, 'Packing log', 'packing_runs', true, 18, null, 'Record each packing run with pack weight, jar count, batch numbers and packer initials'),
(cl_sichuan_crisp, 'Total units produced', 'number', true, 19, null, null),
(cl_sichuan_crisp, 'Labelling verified — correct batch code and best before date confirmed on label', 'checkbox', true, 20, null, null);


-- ── Sichuan Chilli Crisp Double Heat ─────────────────────────────────────────
INSERT INTO checklists (name, frequency, category, description, active) VALUES (
  'Sichuan Chilli Crisp Double Heat — Production Record', 'per_batch', 'Production',
  'F3.6 Production & Packing Record. Complete all sections during and after each production run.', true
) RETURNING id INTO cl_sichuan_dh;

INSERT INTO questions (checklist_id, label, type, required, order_index, options, hint) VALUES
(cl_sichuan_dh, 'Batch code', 'text', true, 0, null, 'e.g. SCCDH-250513-01'),
(cl_sichuan_dh, 'Best before date', 'date', true, 1, null, null),
(cl_sichuan_dh, 'Ingredients — batch codes and actual weights', 'ingredient_table', true, 2,
  '["Cold-pressed Rapeseed oil|50450","Shallots|8800","Erjingtiao chilli flakes|7200","Light soy sauce|7020","Doubanjiang|5250","Naga chilli flakes|1100","Sichuan peppercorn powder|1000","Organic Shiitake mushroom powder|350","Sea salt|250"]'::jsonb,
  'Enter the batch code and actual weight for each ingredient'),
(cl_sichuan_dh, 'CCP 1 — Cooking temperature recorded (°C)', 'number', true, 3, null, 'Must reach 80°C for 5 seconds (or 70°C for 2 minutes equivalent)'),
(cl_sichuan_dh, 'CP — pH recorded', 'number', true, 4, null, 'Must be ≤ 4.75'),
(cl_sichuan_dh, 'CCP 2 Hot Fill — Start temperature (°C)', 'number', true, 5, null, 'Must be >82°C'),
(cl_sichuan_dh, 'CCP 2 Hot Fill — Middle temperature (°C)', 'number', true, 6, null, 'Must be >82°C'),
(cl_sichuan_dh, 'CCP 2 Hot Fill — Finish temperature (°C)', 'number', true, 7, null, 'Must be >82°C'),
(cl_sichuan_dh, 'Corrective action taken (if any)', 'text', false, 8, null, 'Describe any corrective actions. Leave blank if none required.'),
(cl_sichuan_dh, 'Packaging tare weight samples — 5 Lid & Base measurements (g)', 'text', true, 10, null, 'Weigh 5 samples and enter each separated by commas, e.g: 52.1, 51.8, 52.3, 51.9, 52.0'),
(cl_sichuan_dh, 'Tare weight used (g)', 'number', true, 11, null, 'Use the lightest of the 5 samples above'),
(cl_sichuan_dh, 'Finished product weight — Start of run (g)', 'number', true, 12, null, null),
(cl_sichuan_dh, 'Finished product weight — Middle of run (g)', 'number', true, 13, null, null),
(cl_sichuan_dh, 'Finished product weight — End of run (g)', 'number', true, 14, null, null),
(cl_sichuan_dh, 'Glass check inspection completed?', 'dropdown', true, 15, '["Yes","No"]'::jsonb, null),
(cl_sichuan_dh, 'All glass jars/bottles intact?', 'dropdown', true, 16, '["Yes","No"]'::jsonb, null),
(cl_sichuan_dh, 'If any jars not intact — how many? (Raise NC)', 'text', false, 17, null, 'Leave blank if all jars intact'),
(cl_sichuan_dh, 'Packing log', 'packing_runs', true, 18, null, 'Record each packing run with pack weight, jar count, batch numbers and packer initials'),
(cl_sichuan_dh, 'Total units produced', 'number', true, 19, null, null),
(cl_sichuan_dh, 'Labelling verified — correct batch code and best before date confirmed on label', 'checkbox', true, 20, null, null);


-- ── Hunan Salted Chillies (different CCP 2 — cooling, not hot fill) ───────────
INSERT INTO checklists (name, frequency, category, description, active) VALUES (
  'Hunan Salted Chillies — Production Record', 'per_batch', 'Production',
  'F3.6 Production & Packing Record. Complete all sections during and after each production run.', true
) RETURNING id INTO cl_hunan;

INSERT INTO questions (checklist_id, label, type, required, order_index, options, hint) VALUES
(cl_hunan, 'Batch code', 'text', true, 0, null, 'e.g. HSC-250513-01'),
(cl_hunan, 'Best before date', 'date', true, 1, null, null),
(cl_hunan, 'Ingredients — batch codes and actual weights', 'ingredient_table', true, 2,
  '["Long red chilli|21000","Thai chilli|1500","Salt|1125","Ginger|1000","Garlic|1000","Rice wine|920","Sugar|562"]'::jsonb,
  'Enter the batch code and actual weight for each ingredient'),
(cl_hunan, 'CCP 1 — Cooking temperature recorded (°C)', 'number', true, 3, null, 'Must reach 80°C for 5 seconds (or 70°C for 2 minutes equivalent)'),
(cl_hunan, 'CP — pH recorded', 'number', true, 4, null, 'Must be ≤ 4.75'),
(cl_hunan, 'CCP 2 Cooling — Start time', 'datetime', true, 5, null, 'Record the time cooling began'),
(cl_hunan, 'CCP 2 Cooling — End time', 'datetime', true, 6, null, 'Record the time cooling completed'),
(cl_hunan, 'CCP 2 Cooling — Blast chiller temperature recorded (°C)', 'number', true, 7, null, 'Must reach <8°C within 4 hours'),
(cl_hunan, 'Jars rinsed in dishwasher at 82°C?', 'dropdown', true, 8, '["Yes","No"]'::jsonb, null),
(cl_hunan, 'Corrective action taken (if any)', 'text', false, 9, null, 'Describe any corrective actions. Leave blank if none required.'),
(cl_hunan, 'Packaging tare weight samples — 5 Lid & Base measurements (g)', 'text', true, 10, null, 'Weigh 5 samples and enter each separated by commas, e.g: 52.1, 51.8, 52.3, 51.9, 52.0'),
(cl_hunan, 'Tare weight used (g)', 'number', true, 11, null, 'Use the lightest of the 5 samples above'),
(cl_hunan, 'Finished product weight — Start of run (g)', 'number', true, 12, null, null),
(cl_hunan, 'Finished product weight — Middle of run (g)', 'number', true, 13, null, null),
(cl_hunan, 'Finished product weight — End of run (g)', 'number', true, 14, null, null),
(cl_hunan, 'Glass check inspection completed?', 'dropdown', true, 15, '["Yes","No"]'::jsonb, null),
(cl_hunan, 'All glass jars/bottles intact?', 'dropdown', true, 16, '["Yes","No"]'::jsonb, null),
(cl_hunan, 'If any jars not intact — how many? (Raise NC)', 'text', false, 17, null, 'Leave blank if all jars intact'),
(cl_hunan, 'Packing log', 'packing_runs', true, 18, null, 'Record each packing run with pack weight, jar count, batch numbers and packer initials'),
(cl_hunan, 'Total units produced', 'number', true, 19, null, null),
(cl_hunan, 'Labelling verified — correct batch code and best before date confirmed on label', 'checkbox', true, 20, null, null);

END $$;
