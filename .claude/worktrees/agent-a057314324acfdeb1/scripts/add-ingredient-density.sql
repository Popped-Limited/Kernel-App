ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS density_g_per_l decimal(8,4);

-- Seed known liquids (adjust names if they differ slightly)
UPDATE ingredients SET density_g_per_l = 917  WHERE name ILIKE '%oil%';
UPDATE ingredients SET density_g_per_l = 1170 WHERE name ILIKE '%soy%';
UPDATE ingredients SET density_g_per_l = 920  WHERE name ILIKE '%rice wine%' OR name ILIKE '%shaoxing%';

NOTIFY pgrst, 'reload schema';
