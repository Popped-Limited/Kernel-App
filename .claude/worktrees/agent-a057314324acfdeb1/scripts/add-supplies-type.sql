-- Add 'supplies' as a valid ingredient type
ALTER TABLE ingredients DROP CONSTRAINT IF EXISTS ingredients_type_check;
ALTER TABLE ingredients ADD CONSTRAINT ingredients_type_check
  CHECK (type IN ('ingredient', 'packaging', 'supplies'));

NOTIFY pgrst, 'reload schema';
