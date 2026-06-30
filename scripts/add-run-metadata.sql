-- Multi-run production records: a submission can roll up several production runs.
-- run_count is how many runs the record captured (1 = a normal single-run record);
-- run_meta holds per-run info the report shows (currently each run's good units
-- produced). Additive and nullable — existing submissions read as single-run.

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS run_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS run_meta jsonb;
