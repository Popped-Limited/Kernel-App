-- ============================================================
-- Mock Recalls — saved forward/backward traceability tests
-- Run this in the Supabase SQL editor
-- ============================================================
--
-- A mock recall is NOT a checklist submission. It stores a frozen snapshot
-- of the traceability chain at the moment the test was run (so the report is
-- immutable for auditors even if live stock/dispatches change later), plus the
-- human findings, corrective actions, customers contacted and sign-off.
--
-- Forward  = pick a raw-material lot → trace to every production batch →
--            every dispatch/customer.
-- Backward = pick a finished product/batch → trace to every raw-material lot →
--            supplier.

BEGIN;

CREATE TABLE IF NOT EXISTS mock_recalls (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL REFERENCES organisations(id),

  direction           text NOT NULL CHECK (direction IN ('forward', 'backward')),
  trigger_type        text NOT NULL CHECK (trigger_type IN ('ingredient_lot', 'finished_product')),
  trigger_label       text NOT NULL,              -- e.g. "Naga chilli — Julian 26124" / "Garlic Chilli Oil"

  trace_snapshot      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- frozen { lots, batches, dispatches }
  mass_balance        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { produced, dispatched, remaining, reconciled }

  findings            text,
  corrective_actions  text,
  customers_contacted jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{ customer, contacted_by, response, contacted_at }]

  time_started        timestamptz,                -- when "Begin" was pressed
  time_completed      timestamptz,                -- when saved → gives time-to-complete
  outcome             text CHECK (outcome IN ('pass', 'pass_with_actions', 'fail')),

  conducted_by        text NOT NULL DEFAULT '',
  signed_off_by       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mock_recalls_org_idx ON mock_recalls (organisation_id, created_at DESC);

-- RLS: strict org isolation, matching the rest of the app
ALTER TABLE mock_recalls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON mock_recalls;
CREATE POLICY "org_isolation" ON mock_recalls FOR ALL
  USING      (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON mock_recalls TO anon, authenticated;

COMMIT;
