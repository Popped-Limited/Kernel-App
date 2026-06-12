-- Training documents + training sessions
-- Run once in the Supabase SQL editor.

-- 1. Each training item can have one uploaded policy document.
--    The file itself lives in the private "team-documents" storage bucket
--    under training/{organisation_id}/...; this column stores the path.
ALTER TABLE training_items ADD COLUMN IF NOT EXISTS document_path text;

-- 2. Audit log of group training sessions (who was trained, on what, by whom).
--    The matrix itself is driven by training_records — this table exists so a
--    SALSA auditor can see that a sign-off came from a run-through session.
CREATE TABLE IF NOT EXISTS training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  signed_off_by text NOT NULL,
  team_member_ids uuid[] NOT NULL,
  training_item_ids uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON training_sessions;
CREATE POLICY "org_isolation" ON training_sessions FOR ALL
  USING  (organisation_id = get_my_org_id())
  WITH CHECK (organisation_id = get_my_org_id());

GRANT ALL ON training_sessions TO authenticated;
