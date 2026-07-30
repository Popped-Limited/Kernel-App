-- ============================================================
-- Lab test results — per-product lab reports with full history
-- Run this in the Supabase SQL editor
-- ============================================================
--
-- Products have no table/uuid (they're derived from production checklist
-- names), so results are keyed by (organisation_id, product_name) and matched
-- case-insensitively — the same exact-name matching used for stock/dispatches
-- and label artworks. Every test is its own row (no versioning — a history of
-- discrete tests, newest first). The report file lives in the compliance-docs
-- bucket under lab-tests/, and is optional: a result can be logged before the
-- certificate arrives, or for historic tests whose paperwork is elsewhere.

BEGIN;

CREATE TABLE IF NOT EXISTS lab_tests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),

  product_name     text NOT NULL,              -- exact product name as shown on the product page
  test_date        date NOT NULL,              -- date on the lab report (not the upload date)
  test_type        text NOT NULL DEFAULT '',   -- e.g. Microbiological, Nutritional analysis, Shelf life
  lab_name         text NOT NULL DEFAULT '',
  batch_code       text NOT NULL DEFAULT '',   -- batch tested, if the report names one
  result           text NOT NULL DEFAULT '',   -- satisfactory | borderline | unsatisfactory | '' (see report)
  notes            text NOT NULL DEFAULT '',

  file_name        text,                       -- original report filename (null = no file attached)
  file_path        text,                       -- path in the compliance-docs bucket

  uploaded_by      text NOT NULL DEFAULT '',   -- auth user_metadata.full_name
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lab_tests_org_product_idx
  ON lab_tests (organisation_id, lower(product_name), test_date DESC);

-- RLS: strict org isolation, matching the rest of the app
ALTER TABLE lab_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON lab_tests;
CREATE POLICY "org_isolation" ON lab_tests FOR ALL
  USING      (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- service_role grant so admin/maintenance scripts (e.g. demo cloning) can
-- read/write — mock_recalls lacks this and admin code can't touch it.
GRANT SELECT, INSERT, UPDATE, DELETE ON lab_tests TO anon, authenticated, service_role;

COMMIT;
