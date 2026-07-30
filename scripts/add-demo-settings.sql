-- ============================================================
-- Demo settings — a single global row holding the video meeting link
-- Run this in the Supabase SQL editor
-- ============================================================
--
-- The demo meeting link (Google Meet / Zoom / Teams / Whereby room) that gets
-- embedded in every booking's calendar invite + confirmation emails. One shared
-- room is fine — demos run one at a time. Kernel-global (owned by support@), not
-- org-scoped. Like demo_slots: RLS on, no policy; edited via the support-only
-- settings API route.

BEGIN;

CREATE TABLE IF NOT EXISTS demo_settings (
  id          int PRIMARY KEY DEFAULT 1,
  meeting_url text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_settings_singleton CHECK (id = 1)
);

INSERT INTO demo_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE demo_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON demo_settings TO service_role;

COMMIT;
