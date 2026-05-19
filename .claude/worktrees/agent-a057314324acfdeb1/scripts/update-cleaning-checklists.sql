-- Replace cleaning checklist questions with Yep Kitchen HACCP-aligned versions
-- Based on F.1.3a, F.1.5.2 Daily Checks Record, and CIC cards (Dec 2025)

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- DAILY CLEANING  (9cd2f549-a084-4a44-aa70-01c9cfa61034)
-- Source: F.1.3a — Daily section + CIC cards
-- ────────────────────────────────────────────────────────────────────────────
DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE checklist_id = '9cd2f549-a084-4a44-aa70-01c9cfa61034');
DELETE FROM questions WHERE checklist_id = '9cd2f549-a084-4a44-aa70-01c9cfa61034';

INSERT INTO questions (checklist_id, label, type, required, hint, order_index) VALUES
  ('9cd2f549-a084-4a44-aa70-01c9cfa61034', 'Date', 'date', true, null, 0),
  ('9cd2f549-a084-4a44-aa70-01c9cfa61034', 'Completed by', 'text', true, 'Your name', 1),
  ('9cd2f549-a084-4a44-aa70-01c9cfa61034', 'Worktop surfaces cleaned and sanitised', 'checkbox', true, 'Jantex Multi Surface Sanitiser Cleaner 1/10 · 30s contact · wipe dry with blue paper towel', 2),
  ('9cd2f549-a084-4a44-aa70-01c9cfa61034', 'Cooking kettle cleaned and sanitised', 'checkbox', true, 'Hot soapy water (Jantex Washing Up Liquid) · scrub · rinse · spray Jantex MSSC 1/10 · leave 30s · wipe dry', 3),
  ('9cd2f549-a084-4a44-aa70-01c9cfa61034', 'Scales cleaned and sanitised', 'checkbox', true, 'Jantex MSSC 1/10 · 30s contact · wipe dry with blue paper towel', 4),
  ('9cd2f549-a084-4a44-aa70-01c9cfa61034', 'Utensils cleaned and sanitised', 'checkbox', true, null, 5),
  ('9cd2f549-a084-4a44-aa70-01c9cfa61034', 'Hand wash basins cleaned and sanitised', 'checkbox', true, null, 6),
  ('9cd2f549-a084-4a44-aa70-01c9cfa61034', 'Equipment sinks cleaned and sanitised', 'checkbox', true, 'Hot soapy water (Jantex Washing Up Liquid) · scrub · rinse · spray Jantex MSSC 1/10 · leave 30s · wipe dry', 7),
  ('9cd2f549-a084-4a44-aa70-01c9cfa61034', 'Dishwasher and baskets cleaned and sanitised', 'checkbox', true, null, 8),
  ('9cd2f549-a084-4a44-aa70-01c9cfa61034', 'Hand contact points cleaned and sanitised', 'checkbox', true, 'Handles, light switches, door push plates etc. · Jantex MSSC 1/10 · 30s contact', 9),
  ('9cd2f549-a084-4a44-aa70-01c9cfa61034', 'Bins cleaned and sanitised', 'checkbox', true, 'Remove debris · spray Jantex MSSC 1/10 · scrub · leave 30s · wipe dry with blue paper towel', 10),
  ('9cd2f549-a084-4a44-aa70-01c9cfa61034', 'Production floor swept and mopped', 'checkbox', true, 'Sweep first to remove debris · mop with Jantex Concentrate Floor Maintainer 1/20 in hot water · air dry', 11),
  ('9cd2f549-a084-4a44-aa70-01c9cfa61034', 'Robo Coupe cleaned and sanitised', 'checkbox', true, null, 12),
  ('9cd2f549-a084-4a44-aa70-01c9cfa61034', 'Mobile hot holding tanks cleaned and sanitised', 'checkbox', true, null, 13),
  ('9cd2f549-a084-4a44-aa70-01c9cfa61034', 'Hot filling line cleaned and sanitised', 'checkbox', true, 'Hot soapy water (Jantex Washing Up Liquid) · scrub · rinse · spray Jantex MSSC 1/10 · leave 30s · wipe dry', 14),
  ('9cd2f549-a084-4a44-aa70-01c9cfa61034', 'Cold filling line cleaned and sanitised', 'checkbox', true, 'Hot soapy water (Jantex Washing Up Liquid) · scrub · rinse · spray Jantex MSSC 1/10 · leave 30s · wipe dry', 15),
  ('9cd2f549-a084-4a44-aa70-01c9cfa61034', 'Any areas not cleaned — reason', 'text', false, 'Leave blank if all areas completed. Write N/A if not required today.', 16),
  ('9cd2f549-a084-4a44-aa70-01c9cfa61034', 'Manager sign-off', 'text', true, 'Manager name', 17);


-- ────────────────────────────────────────────────────────────────────────────
-- WEEKLY CLEANING  (c3ec947b-259e-4dc0-98d6-469201c88dda)
-- Source: F.1.3a — Weekly section + CIC cards
-- ────────────────────────────────────────────────────────────────────────────
DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE checklist_id = 'c3ec947b-259e-4dc0-98d6-469201c88dda');
DELETE FROM questions WHERE checklist_id = 'c3ec947b-259e-4dc0-98d6-469201c88dda';

INSERT INTO questions (checklist_id, label, type, required, hint, order_index) VALUES
  ('c3ec947b-259e-4dc0-98d6-469201c88dda', 'Week commencing', 'date', true, null, 0),
  ('c3ec947b-259e-4dc0-98d6-469201c88dda', 'Completed by', 'text', true, 'Your name', 1),
  ('c3ec947b-259e-4dc0-98d6-469201c88dda', 'Changing area cleaned', 'checkbox', true, null, 2),
  ('c3ec947b-259e-4dc0-98d6-469201c88dda', 'Offices and staff area cleaned', 'checkbox', true, null, 3),
  ('c3ec947b-259e-4dc0-98d6-469201c88dda', 'Toilets cleaned', 'checkbox', true, 'Toilet cleaner as per pack instructions · sweep floor · mop with Jantex Concentrate Floor Maintainer 1/20 · use red mop bucket only', 4),
  ('c3ec947b-259e-4dc0-98d6-469201c88dda', 'Chiller / fridge cleaned and sanitised', 'checkbox', true, 'Move stock to one side · remove debris · spray Jantex MSSC 1/10 · scrub · leave 30s · rinse · wipe dry', 5),
  ('c3ec947b-259e-4dc0-98d6-469201c88dda', 'Walk-in freezer cleaned', 'checkbox', true, null, 6),
  ('c3ec947b-259e-4dc0-98d6-469201c88dda', 'Warehouse / storage area cleaned', 'checkbox', true, 'Surfaces: Jantex MSSC 1/10 · Floors: Jantex Concentrate Floor Maintainer 1/20', 7),
  ('c3ec947b-259e-4dc0-98d6-469201c88dda', 'Production shoes cleaned', 'checkbox', true, null, 8),
  ('c3ec947b-259e-4dc0-98d6-469201c88dda', 'Cleaning verification swab completed', 'checkbox', true, 'Hygiene swab test — record result below', 9),
  ('c3ec947b-259e-4dc0-98d6-469201c88dda', 'Swab result', 'dropdown', true, null, 10),
  ('c3ec947b-259e-4dc0-98d6-469201c88dda', 'Corrective action required?', 'dropdown', true, 'If result is Grey or Purple, a corrective action report must be completed', 11),
  ('c3ec947b-259e-4dc0-98d6-469201c88dda', 'Notes', 'text', false, null, 12),
  ('c3ec947b-259e-4dc0-98d6-469201c88dda', 'Manager sign-off', 'text', true, 'Manager name', 13);

UPDATE questions SET options = '["Green (pass)", "Grey (borderline)", "Purple (fail)"]'::jsonb
  WHERE checklist_id = 'c3ec947b-259e-4dc0-98d6-469201c88dda' AND label = 'Swab result';

UPDATE questions SET options = '["No", "Yes — corrective action report raised"]'::jsonb
  WHERE checklist_id = 'c3ec947b-259e-4dc0-98d6-469201c88dda' AND label = 'Corrective action required?';


-- ────────────────────────────────────────────────────────────────────────────
-- MONTHLY CLEANING  (56db48c6-999d-49ad-95b5-838a304288b2)
-- Source: F.1.3a — Monthly section + CIC cards
-- ────────────────────────────────────────────────────────────────────────────
DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE checklist_id = '56db48c6-999d-49ad-95b5-838a304288b2');
DELETE FROM questions WHERE checklist_id = '56db48c6-999d-49ad-95b5-838a304288b2';

INSERT INTO questions (checklist_id, label, type, required, hint, order_index) VALUES
  ('56db48c6-999d-49ad-95b5-838a304288b2', 'Month / year', 'text', true, 'e.g. May 2026', 0),
  ('56db48c6-999d-49ad-95b5-838a304288b2', 'Completed by', 'text', true, 'Your name', 1),
  ('56db48c6-999d-49ad-95b5-838a304288b2', 'Floors (inaccessible areas) cleaned', 'checkbox', true, 'Areas not covered in daily clean — behind/under equipment, corners etc.', 2),
  ('56db48c6-999d-49ad-95b5-838a304288b2', 'Extraction unit cleaned and sanitised', 'checkbox', true, 'Ensure working environment is safe before using ladder · Jantex MSSC 1/10 · allow 5–10 min contact · wash all surfaces and corners with sponge or brush · remove all chemical residues · visually inspect', 3),
  ('56db48c6-999d-49ad-95b5-838a304288b2', 'Shelves cleaned and sanitised', 'checkbox', true, 'Remove debris · spray Jantex MSSC 1/10 · scrub · leave 30s · rinse · wipe dry with blue paper towel', 4),
  ('56db48c6-999d-49ad-95b5-838a304288b2', 'Walls cleaned', 'checkbox', true, 'Sweep/mop floors first (Jantex Floor Maintainer 1/20) · then spray Jantex MSSC 1/10 on walls · leave 30s · dry with blue paper towel or air dry', 5),
  ('56db48c6-999d-49ad-95b5-838a304288b2', 'Windows cleaned', 'checkbox', true, null, 6),
  ('56db48c6-999d-49ad-95b5-838a304288b2', 'Strip curtains cleaned', 'checkbox', true, null, 7),
  ('56db48c6-999d-49ad-95b5-838a304288b2', 'Doors cleaned', 'checkbox', true, null, 8),
  ('56db48c6-999d-49ad-95b5-838a304288b2', 'Plug sockets cleaned', 'checkbox', true, null, 9),
  ('56db48c6-999d-49ad-95b5-838a304288b2', 'Notes', 'text', false, null, 10),
  ('56db48c6-999d-49ad-95b5-838a304288b2', 'Manager sign-off', 'text', true, 'Manager name', 11);


-- ────────────────────────────────────────────────────────────────────────────
-- OPENING CHECKS  (aa15e411-bd26-4ba5-a8a5-7fdd16c03273)
-- Source: F.1.5.2 Daily Checks Record — Opening Checks section
-- ────────────────────────────────────────────────────────────────────────────
DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE checklist_id = 'aa15e411-bd26-4ba5-a8a5-7fdd16c03273');
DELETE FROM questions WHERE checklist_id = 'aa15e411-bd26-4ba5-a8a5-7fdd16c03273';

INSERT INTO questions (checklist_id, label, type, required, hint, order_index) VALUES
  ('aa15e411-bd26-4ba5-a8a5-7fdd16c03273', 'Date', 'date', true, null, 0),
  ('aa15e411-bd26-4ba5-a8a5-7fdd16c03273', 'Completed by', 'text', true, 'Your name', 1),
  ('aa15e411-bd26-4ba5-a8a5-7fdd16c03273', 'Hand wash basins stocked', 'checkbox', true, 'Soap and paper towels present', 2),
  ('aa15e411-bd26-4ba5-a8a5-7fdd16c03273', 'Hot water available', 'checkbox', true, null, 3),
  ('aa15e411-bd26-4ba5-a8a5-7fdd16c03273', 'All worktops clean', 'checkbox', true, null, 4),
  ('aa15e411-bd26-4ba5-a8a5-7fdd16c03273', 'Key equipment working', 'checkbox', true, 'Visually inspect — report any faults in the maintenance report', 5),
  ('aa15e411-bd26-4ba5-a8a5-7fdd16c03273', 'Staff fit for work', 'checkbox', true, 'No illness, cuts or infections — PPE worn correctly', 6),
  ('aa15e411-bd26-4ba5-a8a5-7fdd16c03273', 'No signs of pest activity', 'checkbox', true, 'Check bait stations, droppings, gnaw marks', 7),
  ('aa15e411-bd26-4ba5-a8a5-7fdd16c03273', 'Daily glass and brittle plastic check — all items present and intact', 'checkbox', true, 'Check against the glass and brittle plastic register', 8),
  ('aa15e411-bd26-4ba5-a8a5-7fdd16c03273', 'All knives and sharps present and intact', 'checkbox', true, null, 9),
  ('aa15e411-bd26-4ba5-a8a5-7fdd16c03273', 'Fridge temperature (°C)', 'number', true, 'Must be 1–5°C', 10),
  ('aa15e411-bd26-4ba5-a8a5-7fdd16c03273', 'Freezer temperature (°C)', 'number', false, 'Must be -18°C or below', 11),
  ('aa15e411-bd26-4ba5-a8a5-7fdd16c03273', 'Any issues to report?', 'text', false, 'Leave blank if none', 12),
  ('aa15e411-bd26-4ba5-a8a5-7fdd16c03273', 'Manager sign-off', 'text', true, 'Manager name', 13);


-- ────────────────────────────────────────────────────────────────────────────
-- CLOSING CHECKS  (2fc08038-c9e4-479a-a1cd-324ba2e1e8b3)
-- Source: F.1.5.2 Daily Checks Record — Closing Checks section
-- ────────────────────────────────────────────────────────────────────────────
DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE checklist_id = '2fc08038-c9e4-479a-a1cd-324ba2e1e8b3');
DELETE FROM questions WHERE checklist_id = '2fc08038-c9e4-479a-a1cd-324ba2e1e8b3';

INSERT INTO questions (checklist_id, label, type, required, hint, order_index) VALUES
  ('2fc08038-c9e4-479a-a1cd-324ba2e1e8b3', 'Date', 'date', true, null, 0),
  ('2fc08038-c9e4-479a-a1cd-324ba2e1e8b3', 'Completed by', 'text', true, 'Your name', 1),
  ('2fc08038-c9e4-479a-a1cd-324ba2e1e8b3', 'Stock rotation completed', 'checkbox', true, 'FIFO — first in, first out', 2),
  ('2fc08038-c9e4-479a-a1cd-324ba2e1e8b3', 'Records completed correctly', 'checkbox', true, 'All checklists and batch records filled in and signed off', 3),
  ('2fc08038-c9e4-479a-a1cd-324ba2e1e8b3', 'All worktops clean', 'checkbox', true, null, 4),
  ('2fc08038-c9e4-479a-a1cd-324ba2e1e8b3', 'All knives and sharps present and intact', 'checkbox', true, null, 5),
  ('2fc08038-c9e4-479a-a1cd-324ba2e1e8b3', 'Bins changed', 'checkbox', true, null, 6),
  ('2fc08038-c9e4-479a-a1cd-324ba2e1e8b3', 'Fridge temperature (°C)', 'number', true, 'Must be 1–5°C', 7),
  ('2fc08038-c9e4-479a-a1cd-324ba2e1e8b3', 'Any equipment faults to report?', 'text', false, 'Leave blank if none — add to maintenance report if needed', 8),
  ('2fc08038-c9e4-479a-a1cd-324ba2e1e8b3', 'Notes / anything to hand over', 'text', false, null, 9),
  ('2fc08038-c9e4-479a-a1cd-324ba2e1e8b3', 'Manager sign-off', 'text', true, 'Manager name', 10);

COMMIT;
