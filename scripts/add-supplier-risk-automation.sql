-- Supplier risk automation: store the calculator's working + an auditable manual override.
-- Additive only — new nullable columns, no data touched, nothing dropped.
-- Applies to every org (Yep Kitchen, Popped demo, and any future tenant).
-- RLS: suppliers is already org-scoped; new columns inherit the existing table policies.

ALTER TABLE suppliers
  -- Free-text justification required whenever a user overrides an auto-calculated risk.
  -- NULL = no override in force (risk is auto-derived).
  ADD COLUMN IF NOT EXISTS risk_override_reason text,
  -- Snapshot of the SALSA calculator inputs so the assessment is reproducible/auditable:
  -- { material_scores: {temperature:1,...}, material_total: 12, material_band: "medium",
  --   saq_completed: true, has_valid_cert: false, assessed_at: "2026-06-25", assessed_by: "..." }
  ADD COLUMN IF NOT EXISTS risk_assessment_data jsonb;

COMMENT ON COLUMN suppliers.risk_override_reason IS
  'Justification for a manual override of the auto-calculated supplier/raw-material risk. NULL = auto-derived.';
COMMENT ON COLUMN suppliers.risk_assessment_data IS
  'Snapshot of SALSA risk-calculator inputs/outputs for audit "show the working".';
