-- ============================================================
-- Run this in the Supabase SQL editor (supabase.com → project → SQL Editor).
--
-- Fixes production records LOSING DATA when two or more people fill in the
-- SAME record from different devices at the same time.
--
-- Before: each device saved its ENTIRE local copy of the form (the whole
-- `answers` JSON blob) with an upsert. Whoever saved last overwrote everyone
-- else's edits (last-write-wins), so fields typed on device B vanished the
-- moment device A auto-saved.
--
-- After: each device sends ONLY the fields it changed (a patch). This function
-- merges that patch into the row's existing answers ATOMICALLY in the database
-- (`answers || patch`), so two people editing different fields can never clobber
-- each other. (Two people editing the *same* field is inherently a conflict —
-- last edit to that one field wins — but the rest of the form is always safe.)
-- ============================================================

CREATE OR REPLACE FUNCTION merge_batch_draft(
  p_id              uuid,
  p_checklist_id    uuid,
  p_organisation_id uuid,
  p_team_member_id  uuid,
  p_started_by      text,
  p_patch           jsonb
) RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saved_at timestamptz := now();
BEGIN
  INSERT INTO batch_drafts (
    id, checklist_id, organisation_id, team_member_id,
    started_by, last_saved_at, answers
  )
  VALUES (
    p_id, p_checklist_id, p_organisation_id, p_team_member_id,
    COALESCE(NULLIF(p_started_by, ''), 'Unknown'),
    v_saved_at,
    COALESCE(p_patch, '{}'::jsonb)
  )
  ON CONFLICT (id) DO UPDATE
    SET answers       = batch_drafts.answers || COALESCE(EXCLUDED.answers, '{}'::jsonb),
        last_saved_at = v_saved_at,
        -- keep the original author once one is recorded; only fill if blank
        started_by    = CASE
                          WHEN batch_drafts.started_by IN ('', 'Unknown')
                          THEN EXCLUDED.started_by
                          ELSE batch_drafts.started_by
                        END;

  RETURN v_saved_at;
END;
$$;

GRANT EXECUTE ON FUNCTION
  merge_batch_draft(uuid, uuid, uuid, uuid, text, jsonb)
  TO anon, authenticated;
