-- Returns: finished goods that came back from a customer and are still fit for resale.
-- A return is a "give-back" against the original dispatch's production batch — it adds
-- the units back to finished-goods stock AND to the batch's remaining, so they can be
-- dispatched again. Traceability interleaves dispatches + returns to show the full
-- round-trip (out → back → out). Mirrors the dispatches table (org-scoped, RLS).
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS goods_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid REFERENCES organisations(id),
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  product text NOT NULL,
  customer text NOT NULL DEFAULT '',
  quantity integer NOT NULL DEFAULT 0,         -- units returned to sellable stock
  dispatch_id uuid REFERENCES dispatches(id) ON DELETE SET NULL, -- the original shipment
  batch_submission_id uuid,                    -- production batch (copied from the dispatch)
  returned_by text NOT NULL DEFAULT '',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE goods_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON goods_returns;
CREATE POLICY "org_isolation" ON goods_returns FOR ALL
  USING (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON goods_returns TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
