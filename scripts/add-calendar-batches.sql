-- ============================================================
-- Production calendar events gain a batch count
-- Run this in the Supabase SQL editor
-- ============================================================
--
-- A production event on the calendar now says HOW MANY batches are planned
-- that day ("3× Garlic Chilli Oil"), not just that production happens. The
-- Production Schedule page multiplies each event's recipe by its batch count
-- to compute the week's ingredient requirement vs current stock.

ALTER TABLE production_calendar
  ADD COLUMN IF NOT EXISTS batches integer NOT NULL DEFAULT 1;
