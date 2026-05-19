-- Remove duplicate suppliers, keeping the earliest-created row for each name
DELETE FROM suppliers
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at ASC) AS rn
    FROM suppliers
  ) t
  WHERE rn > 1
);
