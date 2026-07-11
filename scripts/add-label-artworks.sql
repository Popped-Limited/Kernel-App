-- ============================================================
-- Label artworks — versioned label uploads per finished product,
-- with AI presence-check results (the "Beacon 8" / FIC particulars)
-- Run this in the Supabase SQL editor
-- ============================================================
--
-- Products have no table/uuid (they're derived from production checklist
-- names), so artwork is keyed by (organisation_id, product_name) and matched
-- case-insensitively — the same exact-name matching used for stock/dispatches.
-- Every upload is a new version (latest = current artwork); the full list is
-- the label's version history log. The AI check result is stored per version,
-- so re-uploads start unchecked and old versions keep their results.

BEGIN;

CREATE TABLE IF NOT EXISTS label_artworks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id),

  product_name     text NOT NULL,              -- exact product name as shown on the product page
  version          int  NOT NULL,              -- 1, 2, 3… latest = current artwork
  file_name        text NOT NULL,              -- original filename (user-facing)
  file_path        text NOT NULL,              -- path in the compliance-docs bucket
  uploaded_by      text NOT NULL DEFAULT '',   -- auth user_metadata.full_name
  uploaded_at      timestamptz NOT NULL DEFAULT now(),

  -- AI presence check (8 FIC mandatory particulars) — null until run.
  -- { particulars: [{ key, status: included|not_found|unclear, evidence }], overall_notes: [] }
  check_result     jsonb,
  check_run_at     timestamptz,
  check_model      text
);

CREATE INDEX IF NOT EXISTS label_artworks_org_product_idx
  ON label_artworks (organisation_id, lower(product_name), uploaded_at DESC);

-- Version numbers are stable per product (never renumbered after a delete)
CREATE UNIQUE INDEX IF NOT EXISTS label_artworks_org_product_version_idx
  ON label_artworks (organisation_id, lower(product_name), version);

-- RLS: strict org isolation, matching the rest of the app
ALTER TABLE label_artworks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON label_artworks;
CREATE POLICY "org_isolation" ON label_artworks FOR ALL
  USING      (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

-- service_role is required: /api/check-label writes check_result via the
-- admin client (RLS is bypassed but table privileges are not — mock_recalls
-- lacks this grant and admin code can't touch it).
GRANT SELECT, INSERT, UPDATE, DELETE ON label_artworks TO anon, authenticated, service_role;

COMMIT;
