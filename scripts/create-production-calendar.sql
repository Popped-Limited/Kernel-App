-- Production Calendar table
CREATE TABLE IF NOT EXISTS production_calendar (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date      DATE        NOT NULL,
  title           TEXT        NOT NULL,
  type            TEXT        NOT NULL DEFAULT 'custom', -- 'production' | 'custom'
  checklist_id    UUID        REFERENCES checklists(id) ON DELETE SET NULL,
  notes           TEXT,
  created_by      TEXT        NOT NULL DEFAULT '',
  organisation_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE production_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON production_calendar
  FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON production_calendar TO anon, authenticated;
