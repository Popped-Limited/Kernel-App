-- Wastage / stock reconciliation log
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS wastage_log (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organisation_id       uuid REFERENCES organisations(id) ON DELETE CASCADE,
  lot_id                uuid REFERENCES ingredient_lots(id) ON DELETE SET NULL,
  ingredient_id         uuid REFERENCES ingredients(id) ON DELETE SET NULL,
  julian_code           text NOT NULL,
  ingredient_name       text NOT NULL,
  adjusted_from_g       numeric NOT NULL,
  adjusted_to_g         numeric NOT NULL,
  quantity_written_off_g numeric GENERATED ALWAYS AS (adjusted_from_g - adjusted_to_g) STORED,
  reason                text NOT NULL CHECK (reason IN ('wastage', 'damaged', 'expired', 'other')),
  notes                 text,
  created_by            text,
  created_at            timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE wastage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage wastage_log"
  ON wastage_log
  FOR ALL
  USING (
    organisation_id IN (
      SELECT organisation_id FROM team_members WHERE email = auth.email()
    )
  );
