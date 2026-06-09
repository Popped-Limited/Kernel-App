-- Add per-product colour to checklists
-- Stored as a hex string e.g. '#7FBA9A'
-- NULL means "not yet set" — the client auto-assigns from the palette
ALTER TABLE checklists ADD COLUMN IF NOT EXISTS color TEXT;
