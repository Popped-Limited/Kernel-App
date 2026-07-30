-- ============================================================
-- GMP Audits (SALSA issue 7) — monthly one-area internal audits
-- Run this in the Supabase SQL editor
-- ============================================================
--
-- Model: each org keeps an editable list of GMP areas (seeded in-app with
-- SALSA-shaped defaults on first visit). One audit = ONE area, done monthly
-- on a rota — the app suggests the area that's gone longest unaudited.
-- An audit holds free-form findings: photos + what was discovered + a
-- high/medium/low risk + an assignee and a due date (auto from risk:
-- high 7d / medium 30d / low 90d). The assignee closes a finding out with
-- a note and optional "after" photo.
--
-- All three tables are strictly org-isolated (the one rule that matters).
-- service_role IS granted here: the overdue-findings cron
-- (/api/gmp/overdue) and the assignment-email route read these tables
-- with the admin client.

BEGIN;

-- ── Areas ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gmp_areas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  name            text NOT NULL,
  sort            int  NOT NULL DEFAULT 0,
  active          boolean NOT NULL DEFAULT true,   -- deactivate, never delete (audits reference it)
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Unique PER ORG, never globally (see fix-ingredient-name-per-org.sql)
  CONSTRAINT gmp_areas_name_per_org UNIQUE (organisation_id, name)
);

-- ── Audits ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gmp_audits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  area_id         uuid NOT NULL REFERENCES gmp_areas(id),
  audit_date      date NOT NULL DEFAULT CURRENT_DATE,
  auditor_name    text NOT NULL DEFAULT '',        -- from user_metadata.full_name
  auditor_user    uuid,
  notes           text,                            -- general walkthrough notes
  status          text NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress', 'completed')),
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gmp_audits_org_idx  ON gmp_audits (organisation_id, audit_date DESC);
CREATE INDEX IF NOT EXISTS gmp_audits_area_idx ON gmp_audits (area_id);

-- ── Findings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gmp_findings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL REFERENCES organisations(id),
  audit_id            uuid NOT NULL REFERENCES gmp_audits(id) ON DELETE CASCADE,

  description         text NOT NULL,               -- what was discovered
  action_plan         text,                        -- what should be done about it
  risk                text NOT NULL CHECK (risk IN ('high', 'medium', 'low')),
  photos              jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [url, ...] observation photos

  assigned_to         uuid REFERENCES team_members(id),
  assigned_to_name    text,                        -- denormalised so the record survives staff changes
  due_date            date,
  assigned_notified_at timestamptz,                -- assignment email sent (once)
  overdue_notified_on  date,                       -- overdue email sent (once, by the cron)

  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  close_note          text,
  close_photos        jsonb NOT NULL DEFAULT '[]'::jsonb,  -- "after" photo(s)
  closed_by           text,
  closed_at           timestamptz,

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gmp_findings_org_status_idx ON gmp_findings (organisation_id, status, due_date);
CREATE INDEX IF NOT EXISTS gmp_findings_audit_idx      ON gmp_findings (audit_id);

-- ── RLS: strict org isolation on all three ────────────────────
ALTER TABLE gmp_areas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmp_audits   ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmp_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON gmp_areas;
CREATE POLICY "org_isolation" ON gmp_areas FOR ALL
  USING      (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

DROP POLICY IF EXISTS "org_isolation" ON gmp_audits;
CREATE POLICY "org_isolation" ON gmp_audits FOR ALL
  USING      (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

DROP POLICY IF EXISTS "org_isolation" ON gmp_findings;
CREATE POLICY "org_isolation" ON gmp_findings FOR ALL
  USING      (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON gmp_areas, gmp_audits, gmp_findings TO authenticated;
-- Cron + email routes read/write via the admin client (bypasses RLS, still needs grants)
GRANT ALL ON gmp_areas, gmp_audits, gmp_findings TO service_role;

COMMIT;
