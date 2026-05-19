-- STEP 1: Preview — see which text questions will become signatures
SELECT q.id, cl.name AS checklist, q.label, q.type
FROM questions q
JOIN checklists cl ON cl.id = q.checklist_id
WHERE q.type = 'text'
  AND (
    q.label ILIKE '%sign%'
    OR q.label ILIKE '%name%'
    OR q.label ILIKE '%operator%'
    OR q.label ILIKE '%logged by%'
    OR q.label ILIKE '%completed by%'
    OR q.label ILIKE '%checked by%'
    OR q.label ILIKE '%verified by%'
    OR q.label ILIKE '%authoris%'
  )
ORDER BY cl.name, q.order_index;

-- STEP 2: Preview — see which questions in scales calibration should become multi_number
SELECT q.id, cl.name AS checklist, q.label, q.type, q.options
FROM questions q
JOIN checklists cl ON cl.id = q.checklist_id
WHERE cl.name ILIKE '%scale%' OR cl.name ILIKE '%calibrat%'
ORDER BY q.order_index;

-- ============================================================
-- Once you've reviewed the previews above, run these updates:
-- ============================================================

-- Convert name/signature text fields to signature type
UPDATE questions
SET type = 'signature'
WHERE type = 'text'
  AND (
    label ILIKE '%sign%'
    OR label ILIKE '%name%'
    OR label ILIKE '%operator%'
    OR label ILIKE '%logged by%'
    OR label ILIKE '%completed by%'
    OR label ILIKE '%checked by%'
    OR label ILIKE '%verified by%'
    OR label ILIKE '%authoris%'
  );

-- Convert scales calibration weight entries to 5-box multi_number
-- (adjust the label pattern below to match your exact question label)
UPDATE questions
SET type = 'multi_number', options = '["5"]'
WHERE type = 'text'
  AND (
    label ILIKE '%test weight%'
    OR label ILIKE '%calibration weight%'
    OR label ILIKE '%scale reading%'
    OR label ILIKE '%weight reading%'
    OR (label ILIKE '%weight%' AND label ILIKE '%5%')
  )
  AND checklist_id IN (
    SELECT id FROM checklists WHERE name ILIKE '%scale%' OR name ILIKE '%calibrat%'
  );
