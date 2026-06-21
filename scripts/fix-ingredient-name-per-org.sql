-- Two fixes needed before the Yep→demo clone (and both are correct in their own right):
--
-- 1. ingredients.name is GLOBALLY unique, which breaks multi-tenancy: two
--    organisations can't both have an ingredient called "Salt". Make it unique
--    PER organisation instead — consistent with the one rule that matters most.
--
-- 2. The admin/service role has no write grant on finished_goods_adjustments, so
--    admin scripts can't manage it. Grant it like the other operational tables.
--
-- Run in the Supabase SQL editor.

BEGIN;

ALTER TABLE ingredients DROP CONSTRAINT IF EXISTS ingredients_name_key;
ALTER TABLE ingredients ADD  CONSTRAINT ingredients_name_org_key UNIQUE (organisation_id, name);

GRANT SELECT, INSERT, UPDATE, DELETE ON finished_goods_adjustments TO service_role;

COMMIT;
