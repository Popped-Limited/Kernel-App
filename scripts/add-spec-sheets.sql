-- ============================================================
-- Product spec sheets — Beacon-style Finished Product Specification PDFs
-- Run this in the Supabase SQL editor
-- ============================================================
--
-- Two stores:
--  1. spec_company_details — ONE row per org: the Company Information block
--     (address, phone, commercial/technical contacts). Shared by every
--     product's spec sheet. jsonb so the block can evolve without migrations.
--  2. product_spec_sheets — one row per (org, product), matched
--     case-insensitively by exact product name like lab_tests/label_artworks.
--     Holds ONLY the spec fields Kernel can't derive (doc control, shelf life
--     wording, micro targets, organoleptics, packaging spec, sign-off,
--     amendment log) in jsonb `data`, plus the uploaded pack shot path.
--     Everything derivable (ingredient declaration, QUID, allergens,
--     nutrition, net quantity) is computed live at PDF time from the recipe
--     and product settings — never duplicated here.

BEGIN;

CREATE TABLE IF NOT EXISTS spec_company_details (
  organisation_id  uuid PRIMARY KEY REFERENCES organisations(id),
  data             jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by       text NOT NULL DEFAULT '',
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE spec_company_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON spec_company_details;
CREATE POLICY "org_isolation" ON spec_company_details FOR ALL
  USING      (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON spec_company_details TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS product_spec_sheets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),
  product_name     text NOT NULL,               -- exact product name as shown on the product page
  data             jsonb NOT NULL DEFAULT '{}'::jsonb,
  pack_shot_path   text,                        -- compliance-docs bucket, spec-sheets/ prefix
  updated_by       text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_spec_sheets_org_product_idx
  ON product_spec_sheets (organisation_id, lower(product_name));

ALTER TABLE product_spec_sheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON product_spec_sheets;
CREATE POLICY "org_isolation" ON product_spec_sheets FOR ALL
  USING      (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON product_spec_sheets TO anon, authenticated, service_role;

COMMIT;
