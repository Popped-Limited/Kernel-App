-- Improve wording, flow and consistency across cleaning and daily ops checklists
-- Uses UPDATE by ID — no deletes, no FK issues

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- DAILY CLEANING
-- ────────────────────────────────────────────────────────────────────────────

UPDATE questions SET label = 'Worktops cleaned and sanitised',
  hint = 'Jantex MSSC · 1/10 dilution · 30s contact · wipe dry with blue paper towel'
  WHERE id = 'cb65be32-9980-4141-9040-929f963be5fc';

UPDATE questions SET
  hint = 'Wash with Jantex Washing Up Liquid and hot water · rinse thoroughly · spray Jantex MSSC at 1/10 · 30s contact · wipe dry'
  WHERE id = 'fbfa4458-0ff4-44b1-973a-c1f37dafe221'; -- Cooking kettle

UPDATE questions SET
  hint = 'Jantex MSSC · 1/10 dilution · 30s contact · wipe dry with blue paper towel'
  WHERE id = '0181d118-107a-4661-ad3e-0173ee7d5189'; -- Scales

UPDATE questions SET hint = null
  WHERE id = '8820fdcb-54d0-41bc-8971-d62508c9943e'; -- Utensils

UPDATE questions SET label = 'Handwash basins cleaned and sanitised', hint = null
  WHERE id = 'daa6678e-46c8-437b-814d-e528fda755c9';

UPDATE questions SET
  hint = 'Wash with Jantex Washing Up Liquid and hot water · rinse · spray Jantex MSSC at 1/10 · 30s contact · wipe dry'
  WHERE id = '5fc4c777-444c-4f40-b912-238d67a207dc'; -- Equipment sinks

UPDATE questions SET hint = null
  WHERE id = '60b97812-e026-4d8e-ad3b-c61a0ff68302'; -- Dishwasher and baskets

UPDATE questions SET
  hint = 'Door handles, light switches, push plates · Jantex MSSC at 1/10 · 30s contact'
  WHERE id = 'd3d24236-e993-4f8f-978a-c63ab99cd801'; -- Hand contact points

UPDATE questions SET
  hint = 'Remove debris · spray Jantex MSSC at 1/10 · 30s contact · wipe dry with blue paper towel'
  WHERE id = 'a3f29c2f-d9d9-4c8d-8794-82d07560adc3'; -- Bins

UPDATE questions SET
  hint = 'Sweep first to remove debris · mop with Jantex Floor Maintainer at 1/20 in hot water · allow to air dry'
  WHERE id = 'a3460c4e-c3b1-4197-9c4f-43ec7a63a238'; -- Floor

UPDATE questions SET hint = 'Disassemble fully before cleaning · reassemble and sanitise before use'
  WHERE id = '53964a37-f5a8-43fa-a6c7-cca875ce4e2a'; -- Robo Coupe

UPDATE questions SET label = 'Hot holding tanks cleaned and sanitised', hint = null
  WHERE id = '697e8c52-e09f-40e0-8dff-b54007ccfe47';

UPDATE questions SET
  hint = 'Wash with Jantex Washing Up Liquid and hot water · rinse · spray Jantex MSSC at 1/10 · 30s contact · wipe dry'
  WHERE id = 'd5204547-1c04-4ae2-9b83-280cff236bca'; -- Hot filling line

UPDATE questions SET
  hint = 'Wash with Jantex Washing Up Liquid and hot water · rinse · spray Jantex MSSC at 1/10 · 30s contact · wipe dry'
  WHERE id = '5c7f2134-35e9-4a3d-87bc-8476287dde99'; -- Cold filling line

UPDATE questions SET label = 'Any areas not completed — state reason',
  hint = 'Leave blank if everything was done. Write N/A if an item is not in use today.'
  WHERE id = '804cd32d-1d9a-4cba-9596-b3535f8de998';

UPDATE questions SET label = 'Checked and signed off by', hint = 'Manager or supervisor name'
  WHERE id = '38a36b08-c504-44a9-8cc5-bb1675eff8d4'; -- Manager sign-off


-- ────────────────────────────────────────────────────────────────────────────
-- WEEKLY CLEANING
-- ────────────────────────────────────────────────────────────────────────────

UPDATE questions SET hint = 'Including lockers and coat hooks'
  WHERE id = '83d728a9-6ec3-4436-8c5e-69b89b22d4bf'; -- Changing area

UPDATE questions SET hint = null
  WHERE id = 'da56e7f1-4d9f-4142-b7dc-9cc405fe82ec'; -- Offices and staff area

UPDATE questions SET
  hint = 'Toilet cleaner as per pack instructions · sweep floor · red mop bucket only · Jantex Floor Maintainer at 1/20'
  WHERE id = '436d0028-38d5-4b1e-8b31-8c8f417ceb17'; -- Toilets

UPDATE questions SET label = 'Chiller, fridge and blast chiller cleaned and sanitised',
  hint = 'Move stock to one side · remove debris · spray Jantex MSSC at 1/10 · 30s contact · rinse · wipe dry'
  WHERE id = '3a4101c4-9203-459e-ba9a-dba99deeda67';

UPDATE questions SET hint = null
  WHERE id = 'c6e3b8cf-655d-4b97-a9c6-04aea31cbee5'; -- Walk-in freezer

UPDATE questions SET label = 'Warehouse and storage area cleaned',
  hint = 'Surfaces: Jantex MSSC at 1/10 · Floors: Jantex Floor Maintainer at 1/20'
  WHERE id = 'a52cd464-25f1-4ebc-b3b6-4ef1f1028d64';

UPDATE questions SET hint = null
  WHERE id = '940bcf4e-017a-4633-bbde-2ca1d1bae28c'; -- Production shoes

UPDATE questions SET hint = 'Record result in the field below'
  WHERE id = '1946c091-7a0a-4c1b-863c-8d0f43777af3'; -- Swab completed

UPDATE questions SET label = 'Corrective action raised?',
  hint = 'Required if swab result is Grey or Purple'
  WHERE id = 'bc5132cd-55e0-4a56-a4b9-6bf0c2e9a597';

UPDATE questions SET hint = null
  WHERE id = 'c6ac571f-c20a-4d65-a04c-a7d0247a6a08'; -- Notes

UPDATE questions SET label = 'Checked and signed off by', hint = 'Manager or supervisor name'
  WHERE id = '228026ab-6244-42b7-bf11-3a5296802faf';


-- ────────────────────────────────────────────────────────────────────────────
-- MONTHLY CLEANING
-- ────────────────────────────────────────────────────────────────────────────

UPDATE questions SET label = 'Inaccessible floor areas cleaned',
  hint = 'Behind and under large equipment, corners, drains'
  WHERE id = '80ca1a33-ef9d-443b-b5cf-f69ea5349983';

UPDATE questions SET
  hint = 'Ensure ladder is safe to use · Jantex MSSC at 1/10 · 5–10 min contact time · scrub all surfaces and corners · remove all chemical residue · visually inspect when done'
  WHERE id = '84ab799f-5e92-4e02-8f5a-9acba6ce215f'; -- Extraction unit

UPDATE questions SET
  hint = 'Jantex MSSC at 1/10 · 30s contact · rinse · dry with blue paper towel'
  WHERE id = '4d312f6c-0b2b-4cbc-a24c-c0902bd84089'; -- Shelves

UPDATE questions SET
  hint = 'Jantex MSSC at 1/10 · 30s contact · dry with blue paper towel or air dry'
  WHERE id = '52bcc3d8-dfa2-4733-be89-76f4b4ae307e'; -- Walls

UPDATE questions SET hint = null WHERE id = 'bc56e224-45e1-49e4-b831-497a02624894'; -- Windows
UPDATE questions SET hint = null WHERE id = '0b76e109-77cd-4aef-b2a8-afdda3354c3f'; -- Strip curtains
UPDATE questions SET hint = null WHERE id = 'ead72751-a412-4e22-bc7d-13d56a72bf07'; -- Doors

UPDATE questions SET hint = 'Ensure power is isolated before cleaning'
  WHERE id = '7af15da6-e0de-4a98-b1d9-f6349c6e76ea'; -- Plug sockets

UPDATE questions SET hint = null WHERE id = '881350b8-c68b-4a48-9c1a-5712262d6ae4'; -- Notes

UPDATE questions SET label = 'Checked and signed off by', hint = 'Manager or supervisor name'
  WHERE id = 'ad0b8710-deb4-4fb0-a10b-15714af9ac96';


-- ────────────────────────────────────────────────────────────────────────────
-- OPENING CHECKS — reorder and improve wording
-- ────────────────────────────────────────────────────────────────────────────

UPDATE questions SET label = 'Handwash basins stocked with soap and paper towels', hint = null
  WHERE id = '016e97d4-965b-47bb-9382-031e19c6f607';

UPDATE questions SET hint = null
  WHERE id = '67426e03-ca85-446e-8c6f-bcb8ff41c748'; -- Hot water available

UPDATE questions SET label = 'Worktops clean from previous shift', hint = null
  WHERE id = 'c5f55fd0-0cc9-45cc-a1f5-2f81101006c3';

-- Reorder: pest check moves up to 5, fridge to 6, freezer to 7, equipment to 8, glass to 9, knives to 10, staff to 11
UPDATE questions SET order_index = 5, hint = 'Check bait stations, look for droppings or gnaw marks'
  WHERE id = '645272b7-615b-491b-b087-afc930147853'; -- No signs of pest activity

UPDATE questions SET order_index = 6, hint = 'Must be 1–5°C. If outside range, do not use and contact manager immediately.'
  WHERE id = '1d00bdb6-2ff4-4910-b2d5-0bf06033ca88'; -- Fridge temp

UPDATE questions SET order_index = 7, hint = '-18°C or below. If outside range, contact manager immediately.'
  WHERE id = '999553a3-63ed-4fc0-9c9c-fda1f0c489ba'; -- Freezer temp

UPDATE questions SET order_index = 8, label = 'Key equipment in working order',
  hint = 'Any faults — raise a Maintenance Report'
  WHERE id = '503365e6-dab7-4d62-bf86-65e246fd6331';

UPDATE questions SET order_index = 9, label = 'Glass and brittle plastic register checked — all items present and intact',
  hint = null
  WHERE id = 'ad633b44-e901-407c-83e8-beccd177a96c';

UPDATE questions SET order_index = 10, hint = null
  WHERE id = 'a47710a2-106b-431c-905a-02089b3c115e'; -- Knives and sharps

UPDATE questions SET order_index = 11, label = 'All staff fit for work and PPE worn correctly',
  hint = 'No illness, cuts, or infections · hair covered · apron and gloves on'
  WHERE id = '947f0eb0-011b-4074-9f9c-356dfda49fae';

UPDATE questions SET label = 'Any issues to report', hint = 'Leave blank if none'
  WHERE id = 'fe7dd0de-d26f-4ae2-82b7-29ed697ba306';

UPDATE questions SET label = 'Checked and signed off by', hint = 'Manager or supervisor name'
  WHERE id = '1045fada-5f7e-422b-8f4a-f58f45b39b37';


-- ────────────────────────────────────────────────────────────────────────────
-- CLOSING CHECKS — reorder records to top, improve wording
-- ────────────────────────────────────────────────────────────────────────────

-- Records come first (most important end-of-day check)
UPDATE questions SET order_index = 2, label = 'All records completed and signed off',
  hint = 'All batch records, cleaning logs and checklists filled in for today'
  WHERE id = '85b78934-bc41-47fa-adea-51b4100d41e8';

UPDATE questions SET order_index = 3, label = 'Stock rotation completed',
  hint = 'First In, First Out — oldest stock to the front'
  WHERE id = 'd871ecae-0afe-41ef-9dad-b317b00cfba2';

UPDATE questions SET label = 'Worktops clean and clear', hint = null
  WHERE id = '2043ffa2-6fc8-4561-ae9d-a38f0c7cff54';

UPDATE questions SET hint = null
  WHERE id = '5576bd0a-3f0b-4583-b72c-ef14f32feefb'; -- Knives and sharps

UPDATE questions SET label = 'Bin bags changed and bins cleaned', hint = null
  WHERE id = '0c825ecb-183f-4408-af34-e56d16588c6f';

UPDATE questions SET hint = 'Must be 1–5°C. If outside range, do not store product and contact manager.'
  WHERE id = '0a48324e-5263-4949-bfdc-e0930c4ea623'; -- Fridge temp

UPDATE questions SET label = 'Equipment faults or maintenance issues',
  hint = 'Leave blank if none — raise a Maintenance Report if needed'
  WHERE id = '7dd2165e-4b45-4e17-8f22-122b61ccace5';

UPDATE questions SET label = 'Notes and handover',
  hint = 'Anything the next shift or manager needs to know'
  WHERE id = '366eeec2-25fb-44d9-a45a-4241762b38c1';

UPDATE questions SET label = 'Checked and signed off by', hint = 'Manager or supervisor name'
  WHERE id = '468e1283-4d9d-4528-b974-6a8328f20f57';

COMMIT;
