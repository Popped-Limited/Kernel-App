-- Make checklist names unique PER ORGANISATION, not globally.
--
-- The original constraint (checklists_name_key) was a GLOBAL unique on `name`,
-- which meant two different customers could never both have a checklist with
-- the same name (e.g. "Corrective Action Report", "Opening Checks"). That's a
-- multi-tenancy bug — names should only need to be unique within one org.
--
-- Safe to run: there are currently no checklist names shared across orgs and no
-- duplicate (organisation_id, name) pairs, so the new constraint applies cleanly.
--
-- Run once in the Supabase SQL editor.

ALTER TABLE checklists DROP CONSTRAINT IF EXISTS checklists_name_key;

ALTER TABLE checklists
  ADD CONSTRAINT checklists_org_name_key UNIQUE (organisation_id, name);
