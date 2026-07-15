-- ============================================================
-- Demo bookings — customer-facing "Book a demo" slots
-- Run this in the Supabase SQL editor
-- ============================================================
--
-- This is a CROSS-ORG table, by design. Kernel support (support@kernelapp.co.uk)
-- hand-picks bookable time slots; ANY signed-up customer (any org) can see the
-- unbooked upcoming ones and claim one. So it deliberately does NOT follow the
-- usual `organisation_id = get_my_org_id()` isolation rule — a demo slot is owned
-- by Kernel, not by a customer org.
--
-- Because it's cross-org, RLS is enabled with NO permissive policy: direct client
-- access is fully denied. Every read/write goes through the service-role API routes
-- in app/api/demo-slots/* which enforce auth (and support-only for admin actions).
-- `booked_by_*` is only ever populated via the atomic claim in the book route.

BEGIN;

CREATE TABLE IF NOT EXISTS demo_slots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_at       timestamptz NOT NULL,
  duration_mins   int NOT NULL DEFAULT 30,
  created_by      uuid,                                   -- support user who added the slot

  booked_by_org   uuid REFERENCES organisations(id),      -- null = still available
  booked_by_user  uuid,
  booked_by_name  text,
  booked_by_email text,
  booked_note     text,
  booked_at       timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- One slot per instant (prevents accidental duplicate times)
CREATE UNIQUE INDEX IF NOT EXISTS demo_slots_starts_at_key ON demo_slots (starts_at);
CREATE INDEX IF NOT EXISTS demo_slots_available_idx ON demo_slots (starts_at) WHERE booked_at IS NULL;

-- RLS on, no policies: cross-org table, all access via service-role API routes.
ALTER TABLE demo_slots ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS but still needs table privileges.
GRANT ALL ON demo_slots TO service_role;

COMMIT;
