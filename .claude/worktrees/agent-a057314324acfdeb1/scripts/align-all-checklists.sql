-- Align all remaining checklists with Yep Kitchen HACCP / SALSA documents
-- Sources: F.1.5.4b, F.1.5.4c, F.1.11b, F.1.2b/c/d/f, F.1.1.1a, FSBQ

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- SCALE CALIBRATION  (4545b0a8)
-- Fix tolerance ±0.5g → ±1g per F.1.5.4c. Add position hint.
-- ────────────────────────────────────────────────────────────────────────────

UPDATE questions SET hint = 'Use the certified calibration weight for this scale'
  WHERE id = 'f3228f75-679d-4ab4-a611-50bc40a7e2d4'; -- Calibration weight used (g)

UPDATE questions SET
  label = 'Scale reading (g)',
  hint  = 'Check 5 positions: TLH, TRH, BLH, BRH, Centre — record the highest reading'
  WHERE id = 'd07ab398-cd9c-4e5e-806f-7da0d38bafc6'; -- Reading displayed

UPDATE questions SET
  label = 'Within ±1g tolerance?',
  hint  = 'Pass: deviation ≤1g. Fail: take scale out of use and contact manager.'
  WHERE id = '369799b7-619d-43bf-ba53-8d821021700a';

UPDATE questions SET hint = 'Use the certified calibration weight for this scale'
  WHERE id = '6e16c8c3-e8aa-451f-8004-5e3fde83bc1b'; -- Scale 2 calibration weight

UPDATE questions SET
  label = 'Scale 2 reading (g)',
  hint  = 'Check 5 positions: TLH, TRH, BLH, BRH, Centre — record the highest reading'
  WHERE id = 'd5cad5d9-3508-4318-b17e-bdb0e252041a';

UPDATE questions SET
  label = 'Scale 2 within ±1g tolerance?',
  hint  = 'Pass: deviation ≤1g. Fail: take scale out of use and contact manager.'
  WHERE id = '6681541a-b5ee-4cca-b4d5-66ec658ffa66';

UPDATE questions SET
  label = 'Out of tolerance — corrective action taken',
  hint  = 'Leave blank if all scales passed'
  WHERE id = '66946286-97db-4855-b2f7-c8c979b383b1';

UPDATE questions SET label = 'Checked and signed off by', hint = 'Manager or supervisor name'
  WHERE id = 'a3883edc-e77e-4d43-8b57-65631e6fc8e0'; -- Signature


-- ────────────────────────────────────────────────────────────────────────────
-- PROBE CALIBRATION  (7b71980b) — full replacement
-- F.1.5.4b: reference vs production probe, iced water + freshly boiled water
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE checklist_id = '7b71980b-1247-475e-9074-458bfafeb009');
DELETE FROM questions WHERE checklist_id = '7b71980b-1247-475e-9074-458bfafeb009';

INSERT INTO questions (checklist_id, label, type, required, hint, order_index) VALUES
  ('7b71980b-1247-475e-9074-458bfafeb009', 'Date', 'date', true, null, 0),
  ('7b71980b-1247-475e-9074-458bfafeb009', 'Completed by', 'text', true, 'Your name', 1),
  ('7b71980b-1247-475e-9074-458bfafeb009', 'Reference probe ID', 'text', true, 'The calibrated reference probe used for comparison', 2),
  ('7b71980b-1247-475e-9074-458bfafeb009', 'Production probe ID', 'text', true, 'The probe being checked', 3),
  ('7b71980b-1247-475e-9074-458bfafeb009', 'Iced water — reference probe reading (°C)', 'number', true, 'Should read approximately 0°C', 4),
  ('7b71980b-1247-475e-9074-458bfafeb009', 'Iced water — production probe reading (°C)', 'number', true, null, 5),
  ('7b71980b-1247-475e-9074-458bfafeb009', 'Iced water — production probe within ±1°C of reference', 'checkbox', true, 'Fail: withdraw probe, label "Do Not Use", inform manager', 6),
  ('7b71980b-1247-475e-9074-458bfafeb009', 'Freshly boiled water — reference probe reading (°C)', 'number', true, 'Should read approximately 100°C', 7),
  ('7b71980b-1247-475e-9074-458bfafeb009', 'Freshly boiled water — production probe reading (°C)', 'number', true, null, 8),
  ('7b71980b-1247-475e-9074-458bfafeb009', 'Freshly boiled water — production probe within ±1°C of reference', 'checkbox', true, 'Fail: withdraw probe, label "Do Not Use", inform manager', 9),
  ('7b71980b-1247-475e-9074-458bfafeb009', 'Comments or corrective action', 'text', false, 'Leave blank if both checks passed', 10),
  ('7b71980b-1247-475e-9074-458bfafeb009', 'Checked and signed off by', 'text', true, 'Manager or supervisor name', 11);


-- ────────────────────────────────────────────────────────────────────────────
-- HYGIENE SWAB  (84cd516e) — label improvements
-- ────────────────────────────────────────────────────────────────────────────

UPDATE questions SET hint = 'e.g. Hygiena SystemSURE Plus'
  WHERE id = 'b8ff248d-f935-47cf-b9a3-4fa816ffea8e'; -- Swab kit

UPDATE questions SET label = 'Surface or area swabbed — 1', hint = 'e.g. Cooking kettle inner surface'
  WHERE id = '1935072f-a6ed-466f-b242-cf17e34ebf3d';

UPDATE questions SET label = 'Surface or area swabbed — 2'
  WHERE id = 'bf79bd64-c1f9-4159-ae98-20ef647b2fac';

UPDATE questions SET label = 'Surface or area swabbed — 3'
  WHERE id = '1f414014-a4e6-4e79-873d-067abaf046fd';

UPDATE questions SET
  label = 'Any fails — corrective action taken',
  hint  = 'Describe action taken and re-swab date'
  WHERE id = 'd07a7d50-5e82-43a7-b52d-2ddeb80ea464';

UPDATE questions SET label = 'Checked and signed off by'
  WHERE id = 'ee8b3f18-5bba-425d-a1c1-dabd6d7d4bb1'; -- Signature


-- ────────────────────────────────────────────────────────────────────────────
-- LAUNDRY CHECKLIST  (e8a88903) — full replacement
-- F.1.2f: in-house laundry. Indicator strip + water filter = quarterly.
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE checklist_id = 'e8a88903-ec4f-45c3-8193-4fd915c3994c');
DELETE FROM questions WHERE checklist_id = 'e8a88903-ec4f-45c3-8193-4fd915c3994c';

INSERT INTO questions (checklist_id, label, type, required, hint, order_index) VALUES
  ('e8a88903-ec4f-45c3-8193-4fd915c3994c', 'Date', 'date', true, null, 0),
  ('e8a88903-ec4f-45c3-8193-4fd915c3994c', 'Completed by', 'text', true, 'Your name', 1),
  ('e8a88903-ec4f-45c3-8193-4fd915c3994c', 'Number of items washed', 'number', true, 'Aprons, cloths, towels etc.', 2),
  ('e8a88903-ec4f-45c3-8193-4fd915c3994c', 'Detergent used', 'text', true, null, 3),
  ('e8a88903-ec4f-45c3-8193-4fd915c3994c', 'Temperature washed at (°C)', 'number', true, 'Minimum 60°C for effective sanitisation', 4),
  ('e8a88903-ec4f-45c3-8193-4fd915c3994c', 'Drying time (minutes)', 'number', false, null, 5),
  ('e8a88903-ec4f-45c3-8193-4fd915c3994c', 'Lint and fluff filters cleaned', 'checkbox', true, 'Clean before or after each wash cycle', 6),
  ('e8a88903-ec4f-45c3-8193-4fd915c3994c', 'All PPE in good condition', 'checkbox', true, 'Check for wear, tears or damage — replace any items as needed', 7),
  ('e8a88903-ec4f-45c3-8193-4fd915c3994c', 'Laundry indicator strip used (quarterly only)', 'checkbox', false, 'Required once per quarter to verify wash temperature is being reached', 8),
  ('e8a88903-ec4f-45c3-8193-4fd915c3994c', 'Indicator strip confirmed temperature >60°C (quarterly only)', 'checkbox', false, 'Fail: do not use laundry — contact manager', 9),
  ('e8a88903-ec4f-45c3-8193-4fd915c3994c', 'Water filter and soap dispenser cleaned (quarterly only)', 'checkbox', false, 'Required once per quarter', 10),
  ('e8a88903-ec4f-45c3-8193-4fd915c3994c', 'Notes', 'text', false, null, 11),
  ('e8a88903-ec4f-45c3-8193-4fd915c3994c', 'Checked and signed off by', 'text', true, 'Manager or supervisor name', 12);


-- ────────────────────────────────────────────────────────────────────────────
-- VISITOR SIGN IN & HEALTH QUESTIONNAIRE  (6b1d9a57) — full replacement
-- F.1.2b (sign-in log) + F.1.2c (health questionnaire)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE checklist_id = '6b1d9a57-d51c-4af3-a918-54c34af1483d');
DELETE FROM questions WHERE checklist_id = '6b1d9a57-d51c-4af3-a918-54c34af1483d';

INSERT INTO questions (checklist_id, label, type, required, hint, order_index) VALUES
  ('6b1d9a57-d51c-4af3-a918-54c34af1483d', 'Date of visit', 'date', true, null, 0),
  ('6b1d9a57-d51c-4af3-a918-54c34af1483d', 'Visitor full name', 'text', true, null, 1),
  ('6b1d9a57-d51c-4af3-a918-54c34af1483d', 'Company or organisation', 'text', true, null, 2),
  ('6b1d9a57-d51c-4af3-a918-54c34af1483d', 'Purpose of visit', 'text', true, null, 3),
  ('6b1d9a57-d51c-4af3-a918-54c34af1483d', 'Host — person being visited', 'text', true, null, 4),
  ('6b1d9a57-d51c-4af3-a918-54c34af1483d', 'Time in', 'text', true, '24hr format e.g. 09:30', 5),
  ('6b1d9a57-d51c-4af3-a918-54c34af1483d', 'Do you currently have a high temperature, persistent cough, or loss of taste or smell?', 'dropdown', true, 'If Yes, you are not permitted on site', 6),
  ('6b1d9a57-d51c-4af3-a918-54c34af1483d', 'In the past 7 days have you had food poisoning, diarrhoea or vomiting?', 'dropdown', true, null, 7),
  ('6b1d9a57-d51c-4af3-a918-54c34af1483d', 'Do you have any skin infections, boils, or discharge from eyes, ears or nose?', 'dropdown', true, null, 8),
  ('6b1d9a57-d51c-4af3-a918-54c34af1483d', 'Have you travelled abroad in the last 2 weeks?', 'dropdown', true, null, 9),
  ('6b1d9a57-d51c-4af3-a918-54c34af1483d', 'If you answered Yes to any health question — are you symptom-free for at least 48 hours?', 'dropdown', false, 'If No, you are not permitted on site', 10),
  ('6b1d9a57-d51c-4af3-a918-54c34af1483d', 'Have you read and understood the site hygiene and visitor rules?', 'dropdown', true, null, 11),
  ('6b1d9a57-d51c-4af3-a918-54c34af1483d', 'Are you aware we handle allergens on site — do you have any relevant allergies?', 'dropdown', true, 'If Yes, inform your host before entering production areas', 12),
  ('6b1d9a57-d51c-4af3-a918-54c34af1483d', 'PPE provided and worn correctly', 'checkbox', true, 'Hairnet or cap, apron, overshoes if required', 13),
  ('6b1d9a57-d51c-4af3-a918-54c34af1483d', 'Visitor briefed on emergency procedures', 'checkbox', true, 'Fire exits, assembly point, nearest first aider', 14),
  ('6b1d9a57-d51c-4af3-a918-54c34af1483d', 'Time out', 'text', false, '24hr format', 15),
  ('6b1d9a57-d51c-4af3-a918-54c34af1483d', 'Visitor signature', 'signature', true, null, 16),
  ('6b1d9a57-d51c-4af3-a918-54c34af1483d', 'Approved by (host signature)', 'signature', true, null, 17);

UPDATE questions SET options = '["No", "Yes"]'::jsonb
  WHERE checklist_id = '6b1d9a57-d51c-4af3-a918-54c34af1483d'
  AND label IN (
    'Do you currently have a high temperature, persistent cough, or loss of taste or smell?',
    'In the past 7 days have you had food poisoning, diarrhoea or vomiting?',
    'Do you have any skin infections, boils, or discharge from eyes, ears or nose?',
    'Have you travelled abroad in the last 2 weeks?',
    'Have you read and understood the site hygiene and visitor rules?'
  );

UPDATE questions SET options = '["N/A — answered No to all health questions", "Yes — symptom-free for 48+ hours", "No — not permitted on site"]'::jsonb
  WHERE checklist_id = '6b1d9a57-d51c-4af3-a918-54c34af1483d'
  AND label = 'If you answered Yes to any health question — are you symptom-free for at least 48 hours?';

UPDATE questions SET options = '["No allergies", "Yes — host has been informed"]'::jsonb
  WHERE checklist_id = '6b1d9a57-d51c-4af3-a918-54c34af1483d'
  AND label = 'Are you aware we handle allergens on site — do you have any relevant allergies?';


-- ────────────────────────────────────────────────────────────────────────────
-- RETURN TO WORK — SELF ASSESSMENT  (ea0dc315)
-- Add nature of illness + travel question. F.1.2d Part 1.
-- ────────────────────────────────────────────────────────────────────────────

-- Shift questions from index 3 onwards up by 2 to insert after "absent since"
UPDATE questions SET order_index = order_index + 2
  WHERE checklist_id = 'ea0dc315-75c6-4c7b-8336-20921490bc02'
  AND order_index >= 3;

INSERT INTO questions (checklist_id, label, type, required, hint, order_index) VALUES
  ('ea0dc315-75c6-4c7b-8336-20921490bc02', 'Nature of illness or reason for absence', 'text', true, 'Be specific — e.g. "vomiting and diarrhoea" not just "illness"', 3),
  ('ea0dc315-75c6-4c7b-8336-20921490bc02', 'Have you travelled abroad in the last 2 weeks?', 'dropdown', true, 'If Yes and you were ill during the trip, you must be symptom-free for 48 hours before returning to food handling duties', 4);

UPDATE questions SET options = '["No", "Yes"]'::jsonb
  WHERE checklist_id = 'ea0dc315-75c6-4c7b-8336-20921490bc02'
  AND label = 'Have you travelled abroad in the last 2 weeks?';

UPDATE questions SET label = 'Checked and signed off by', hint = 'Manager or supervisor name'
  WHERE id = 'ae14ed2e-8cb6-47d4-bf8e-6800c8dc3260'; -- Employee signature → manager confirms


-- ────────────────────────────────────────────────────────────────────────────
-- RETURN TO WORK — MANAGER APPROVAL  (90b84710)
-- Add medical advice sought + total sick days. F.1.2d Part 2.
-- ────────────────────────────────────────────────────────────────────────────

UPDATE questions SET
  label = 'Nature of illness or absence',
  hint  = null
  WHERE id = 'fedf614f-3bb3-4474-b53b-0811281cb962';

-- Shift from index 9 onwards to make room after "Cleared to return" (index 8)
UPDATE questions SET order_index = order_index + 2
  WHERE checklist_id = '90b84710-abea-4d43-9edc-fcf0867abcdf'
  AND order_index >= 9;

INSERT INTO questions (checklist_id, label, type, required, hint, order_index) VALUES
  ('90b84710-abea-4d43-9edc-fcf0867abcdf', 'Medical advice sought?', 'dropdown', true, 'Required if symptoms suggest a notifiable illness', 9),
  ('90b84710-abea-4d43-9edc-fcf0867abcdf', 'Total sickness absences this year (including this one)', 'number', true, null, 10);

UPDATE questions SET options = '["No — not required", "Yes — GP consulted", "Yes — FSA guidance consulted"]'::jsonb
  WHERE checklist_id = '90b84710-abea-4d43-9edc-fcf0867abcdf'
  AND label = 'Medical advice sought?';

UPDATE questions SET label = 'Checked and signed off by', hint = 'Manager or supervisor name'
  WHERE id = '479d83c6-1e3b-42df-ab17-4975de01eef5'; -- Manager signature


-- ────────────────────────────────────────────────────────────────────────────
-- MAINTENANCE REPORT  (c4324534) — full replacement
-- F.1.11b: scheduled/unscheduled/temporary, start/end times,
--          parts required, 4-part hygiene clearance
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE checklist_id = 'c4324534-34f4-4608-9059-4a3e5202961a');
DELETE FROM questions WHERE checklist_id = 'c4324534-34f4-4608-9059-4a3e5202961a';

INSERT INTO questions (checklist_id, label, type, required, hint, order_index) VALUES
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Date', 'date', true, null, 0),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Reported by', 'text', true, 'Your name', 1),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Equipment or area', 'text', true, 'e.g. Cooking kettle, hot filling line, production floor drain', 2),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Type of maintenance', 'dropdown', true, null, 3),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Maintenance start time', 'text', false, '24hr format e.g. 08:30', 4),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Maintenance end time', 'text', false, '24hr format', 5),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Description of problem', 'text', true, null, 6),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Action taken', 'text', true, null, 7),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Temporary repair details', 'text', false, 'If a permanent fix is still required, describe the interim measure used', 8),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Parts required', 'text', false, 'Description, quantity and part number if known', 9),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Food safety risk?', 'dropdown', true, 'If Yes — take equipment out of service immediately', 10),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Equipment taken out of service during maintenance', 'checkbox', true, null, 11),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Photo of fault or repair', 'photo', false, null, 12),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Contractor or engineer required?', 'dropdown', false, null, 13),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Contractor name', 'text', false, 'Leave blank if in-house repair', 14),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Estimated completion date', 'date', false, null, 15),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Repair completed date', 'date', false, null, 16),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'HYGIENE CLEARANCE: All machine parts accounted for', 'checkbox', true, 'Confirm no parts left inside or near the equipment', 17),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'HYGIENE CLEARANCE: Equipment cleared of all maintenance debris', 'checkbox', true, 'Tools, swarf, packaging, rags etc. all removed', 18),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'HYGIENE CLEARANCE: Equipment cleaned and sanitised prior to use', 'checkbox', true, null, 19),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Equipment accepted back into production use', 'checkbox', true, null, 20),
  ('c4324534-34f4-4608-9059-4a3e5202961a', 'Checked and signed off by', 'text', true, 'Production manager name', 21);

UPDATE questions SET options = '["Scheduled", "Unscheduled", "Temporary repair"]'::jsonb
  WHERE checklist_id = 'c4324534-34f4-4608-9059-4a3e5202961a' AND label = 'Type of maintenance';

UPDATE questions SET options = '["No", "Yes — equipment taken out of service"]'::jsonb
  WHERE checklist_id = 'c4324534-34f4-4608-9059-4a3e5202961a' AND label = 'Food safety risk?';

UPDATE questions SET options = '["No — in-house repair", "Yes — booked", "Yes — pending"]'::jsonb
  WHERE checklist_id = 'c4324534-34f4-4608-9059-4a3e5202961a' AND label = 'Contractor or engineer required?';


-- ────────────────────────────────────────────────────────────────────────────
-- EMPLOYEE INDUCTION CHECKLIST  (f51bf6b1) — full replacement
-- F.1.1.1a: document receipt and competency confirmation
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE checklist_id = 'f51bf6b1-6b2f-400e-b308-f8a17ca071f7');
DELETE FROM questions WHERE checklist_id = 'f51bf6b1-6b2f-400e-b308-f8a17ca071f7';

INSERT INTO questions (checklist_id, label, type, required, hint, order_index) VALUES
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Employee name', 'text', true, null, 0),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Start date', 'date', true, null, 1),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Job title / role', 'text', true, null, 2),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Induction completed by', 'text', true, 'Trainer or manager name', 3),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Visitor Sign In Log — explained and understood', 'checkbox', true, null, 4),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Pre-Employment Medical Questionnaire — completed', 'checkbox', true, null, 5),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Personal Hygiene Rules — explained and understood', 'checkbox', true, 'Including handwashing, PPE, jewellery policy, illness reporting', 6),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'PPE requirements — explained and issued', 'checkbox', true, 'Hairnet, apron, gloves — correct donning and doffing demonstrated', 7),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Visitor and Contractors Policy — explained', 'checkbox', true, null, 8),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Quality Policy — read and understood', 'checkbox', true, null, 9),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Food Safety Booklet — received and read', 'checkbox', true, null, 10),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Food Safety Booklet Quiz — completed and passed (≥80%)', 'checkbox', true, 'Must be passed before commencing food handling duties', 11),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Allergen awareness training — completed', 'checkbox', true, 'Allergens handled on site explained. Cross-contamination risks covered.', 12),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'HACCP and food safety basics — explained', 'checkbox', true, 'SALSA standard, HACCP principles, CCPs, temperature control', 13),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Cleaning procedures — explained', 'checkbox', true, 'Daily, weekly and monthly schedules. Chemicals and correct dilutions.', 14),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Return to Work procedure — explained', 'checkbox', true, '48-hour rule, self-assessment form, manager approval required', 15),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Premises orientation and safety briefing — completed', 'checkbox', true, 'Site tour, storage areas, welfare facilities, restricted areas', 16),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Fire safety — explained', 'checkbox', true, 'Fire exits, assembly point, extinguisher locations, evacuation procedure', 17),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Additional comments', 'text', false, null, 18),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'I confirm the above has been received and fully understood', 'checkbox', true, null, 19),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Employee signature', 'signature', true, null, 20),
  ('f51bf6b1-6b2f-400e-b308-f8a17ca071f7', 'Trainer / manager signature', 'signature', true, null, 21);


-- ────────────────────────────────────────────────────────────────────────────
-- FOOD SAFETY BOOKLET QUIZ  (c12bbfce) — full replacement
-- Aligned to FSBQ topics. 10 scored questions. Pass = ≥80%.
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE checklist_id = 'c12bbfce-6cc2-4d25-bcb7-60375dffa8e3');
DELETE FROM questions WHERE checklist_id = 'c12bbfce-6cc2-4d25-bcb7-60375dffa8e3';

INSERT INTO questions (checklist_id, label, type, required, hint, options, order_index) VALUES
  ('c12bbfce-6cc2-4d25-bcb7-60375dffa8e3', 'Employee name', 'text', true, null, null, 0),
  ('c12bbfce-6cc2-4d25-bcb7-60375dffa8e3', 'Date', 'date', true, null, null, 1),
  ('c12bbfce-6cc2-4d25-bcb7-60375dffa8e3', 'Job title', 'text', true, null, null, 2),
  ('c12bbfce-6cc2-4d25-bcb7-60375dffa8e3', 'Q1. What food safety standard does Yep Kitchen work towards?', 'dropdown', true, null, '["SALSA", "BRCGS", "ISO 22000", "Red Tractor"]'::jsonb, 3),
  ('c12bbfce-6cc2-4d25-bcb7-60375dffa8e3', 'Q2. What does HACCP stand for?', 'dropdown', true, null, '["Hazard Analysis Critical Control Points", "Hard Analysis Complete Control Procedures", "Hygiene And Cleaning Control Plan", "Hazardous Activity Compliance Check Protocol"]'::jsonb, 4),
  ('c12bbfce-6cc2-4d25-bcb7-60375dffa8e3', 'Q3. What is the bacterial danger zone?', 'dropdown', true, 'The temperature range where bacteria multiply rapidly', '["8°C to 60°C", "0°C to 8°C", "0°C to 60°C", "5°C to 100°C"]'::jsonb, 5),
  ('c12bbfce-6cc2-4d25-bcb7-60375dffa8e3', 'Q4. How long must you be free from diarrhoea or vomiting before returning to food handling duties?', 'dropdown', true, null, '["48 hours", "24 hours", "12 hours", "72 hours"]'::jsonb, 6),
  ('c12bbfce-6cc2-4d25-bcb7-60375dffa8e3', 'Q5. Where must you wash your hands?', 'dropdown', true, null, '["At the handwash sink only", "At any sink available", "In the dishwasher area", "At the equipment wash sink"]'::jsonb, 7),
  ('c12bbfce-6cc2-4d25-bcb7-60375dffa8e3', 'Q6. Which PPE must you wear in the production area?', 'dropdown', true, null, '["Hairnet or cap, protective coat and gloves", "Hard hat and safety boots", "Gloves only", "Cap and gloves only"]'::jsonb, 8),
  ('c12bbfce-6cc2-4d25-bcb7-60375dffa8e3', 'Q7. What should you do if there is a glass or brittle plastic breakage?', 'dropdown', true, null, '["Stop work, isolate the area, inform your manager immediately", "Clear it up yourself and carry on", "Ignore it and finish the task", "Wait until end of shift to report it"]'::jsonb, 9),
  ('c12bbfce-6cc2-4d25-bcb7-60375dffa8e3', 'Q8. What does cross-contamination mean?', 'dropdown', true, null, '["The transfer of harmful substances or allergens from one surface, food or person to another", "Mixing two food products intentionally", "Cleaning equipment between uses", "Using the wrong cleaning chemical"]'::jsonb, 10),
  ('c12bbfce-6cc2-4d25-bcb7-60375dffa8e3', 'Q9. What is the definition of malicious contamination?', 'dropdown', true, null, '["Deliberate contamination of a product or raw material with intent to cause harm", "Accidental contamination during production", "A pest infestation on site", "A failed cleaning verification swab"]'::jsonb, 11),
  ('c12bbfce-6cc2-4d25-bcb7-60375dffa8e3', 'Q10. How can you reduce the risk of pest infestation?', 'dropdown', true, null, '["Clean spills immediately, keep waste in bins, report any damage to building fabric", "Move pest control bait boxes to a better location", "Ignore signs of pest activity unless very obvious", "Keep doors open for ventilation"]'::jsonb, 12),
  ('c12bbfce-6cc2-4d25-bcb7-60375dffa8e3', 'Score (out of 10)', 'number', true, 'For manager use — total number of correct answers', null, 13),
  ('c12bbfce-6cc2-4d25-bcb7-60375dffa8e3', 'Result', 'dropdown', true, 'Pass = 8 or more correct (80%). Fail = further training required before commencing duties.', '["Pass (≥80%)", "Fail — further training required"]'::jsonb, 14),
  ('c12bbfce-6cc2-4d25-bcb7-60375dffa8e3', 'Employee signature', 'signature', true, null, null, 15),
  ('c12bbfce-6cc2-4d25-bcb7-60375dffa8e3', 'Assessed by', 'text', true, 'Manager or trainer name', null, 16);


-- ────────────────────────────────────────────────────────────────────────────
-- COMPLAINT FORM  (63f32773) — label and hint improvements
-- ────────────────────────────────────────────────────────────────────────────

UPDATE questions SET hint = 'Your name'
  WHERE id = '0a061ed4-6f38-422e-9015-21d7405903cd'; -- Recorded by

UPDATE questions SET hint = 'Phone and/or email'
  WHERE id = '75ee5fe2-b61a-422d-9d5e-381addb01763'; -- Contact details

UPDATE questions SET hint = 'Include Julian code / lot number if known'
  WHERE id = '74d831f1-3907-4e09-936f-6e397f666809'; -- Product name and batch

UPDATE questions SET hint = 'Investigate and document — a corrective action may be required'
  WHERE id = 'afcd82b4-a8d2-4d96-aaae-0d0cc33b4e66'; -- Root cause

UPDATE questions SET label = 'Corrective action raised'
  WHERE id = 'f98cc136-fd65-423a-9daf-af9ea4554bb7';

UPDATE questions SET label = 'Response sent to customer'
  WHERE id = '259538c2-c045-4c0a-9d16-2cf7f08bb2fe';

UPDATE questions SET label = 'Checked and signed off by', hint = 'Manager name'
  WHERE id = '7255b8fa-8352-44ff-80fc-a0d4b3c2ab2c'; -- Manager sign-off


-- ────────────────────────────────────────────────────────────────────────────
-- CORRECTIVE ACTION REPORT  (dcbbff5e) — label and hint improvements
-- ────────────────────────────────────────────────────────────────────────────

UPDATE questions SET hint = 'Use sequential numbering e.g. CAR-001'
  WHERE id = '6fc2b89f-c9c9-4742-8046-613196b4f483'; -- Reference number

UPDATE questions SET hint = 'What happened? Include product, process, date and location.'
  WHERE id = '43f59cda-c43e-41d8-a4f3-5e71605c70cf'; -- Description

UPDATE questions SET hint = 'Include batch/lot numbers and quantities'
  WHERE id = '39899726-6ab5-45ab-ab07-d10e3b50ddfd'; -- Batches affected

UPDATE questions SET
  label = 'Immediate containment action',
  hint  = 'What was done straight away to prevent further risk?'
  WHERE id = 'e7d3be05-ac44-4f8c-bc8b-f9a14de026da';

UPDATE questions SET hint = 'Why did this happen? Use 5-Whys or similar approach.'
  WHERE id = '49a05b08-0f0a-48ff-addb-62a4e26122f9'; -- Root cause

UPDATE questions SET hint = 'Date to verify the corrective action has been effective'
  WHERE id = 'afbc869e-c432-432a-afbc-69cbd43c02e0'; -- Effectiveness review

UPDATE questions SET label = 'Closed out', hint = 'Tick when corrective action is verified as effective'
  WHERE id = 'abab7aa7-e37a-46ff-b20a-017ea780d9e0';

UPDATE questions SET label = 'Checked and signed off by', hint = 'Manager name'
  WHERE id = 'dd06867a-620b-4708-b68c-9426e7e23329'; -- Manager sign-off

COMMIT;
