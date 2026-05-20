-- Add allergens array column to ingredients table
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS allergens text[] DEFAULT '{}';
