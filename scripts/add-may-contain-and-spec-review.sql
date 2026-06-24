-- Raw materials: "may contain" (cross-contamination) allergens, listed on packaging,
-- alongside the existing direct allergens. Plus spec-sheet review scheduling
-- (mirrors supplier accreditation review_frequency_years / next_review_due).
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS may_contain_allergens text[] DEFAULT '{}';
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS spec_sheet_review_frequency_years int;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS spec_sheet_next_review_due date;

NOTIFY pgrst, 'reload schema';
