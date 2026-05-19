-- ============================================================
-- Run this in the Supabase SQL editor
-- ============================================================

DROP TABLE IF EXISTS dispatches;

CREATE TABLE dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_date date NOT NULL DEFAULT CURRENT_DATE,
  product text NOT NULL,
  customer text NOT NULL,
  cases_of_6 integer NOT NULL DEFAULT 0,
  cases_of_3 integer NOT NULL DEFAULT 0,
  singles integer NOT NULL DEFAULT 0,
  total_units integer NOT NULL DEFAULT 0,
  reference text,
  dispatched_by text NOT NULL DEFAULT '',
  notes text,
  batch_submission_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dispatches ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE dispatches TO anon;
CREATE POLICY "anon_all_dispatches" ON dispatches FOR ALL TO anon USING (true) WITH CHECK (true);
