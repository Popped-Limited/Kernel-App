-- Change tare weight samples to multi_number with 5 boxes
UPDATE questions
SET type = 'multi_number', options = '["5"]'
WHERE label ILIKE '%tare weight%' AND label ILIKE '%5%';

-- Change finished product weight questions to multi_number with 3 boxes
UPDATE questions
SET type = 'multi_number', options = '["3"]'
WHERE label ILIKE '%finished product weight%';

-- Confirm changes
SELECT id, label, type, options FROM questions
WHERE type = 'multi_number';
