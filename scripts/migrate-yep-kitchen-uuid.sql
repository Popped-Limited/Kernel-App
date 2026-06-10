-- ============================================================
-- Migrate Yep Kitchen from placeholder UUID to a proper random UUID
-- Run in Supabase SQL Editor
-- ============================================================

DO $$
DECLARE
  old_id uuid := '11111111-1111-1111-1111-111111111111';
  new_id uuid := gen_random_uuid();
BEGIN

  -- 1. Insert new org row with proper UUID, copying all data
  INSERT INTO organisations (id, name, slug, plan, created_at, stripe_customer_id, subscription_status, trial_ends_at, current_period_end, stripe_subscription_id)
  SELECT new_id, name, slug, plan, created_at, stripe_customer_id, subscription_status, trial_ends_at, current_period_end, stripe_subscription_id
  FROM organisations WHERE id = old_id;

  -- 2. Update every table that references the old org ID
  UPDATE organisation_members        SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE checklists                  SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE questions                   SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE submissions                 SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE answers                     SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE suppliers                   SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE saq_responses               SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE ingredients                 SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE ingredient_lots             SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE dispatches                  SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE production_calendar         SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE finished_goods_adjustments  SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE batch_drafts                SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE sops                        SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE training_items              SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE training_records            SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE documents                   SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE alert_log                   SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE team_members                SET organisation_id = new_id WHERE organisation_id = old_id;
  UPDATE org_invites                 SET organisation_id = new_id WHERE organisation_id = old_id;

  -- 3. Delete the old placeholder org row
  DELETE FROM organisations WHERE id = old_id;

  -- 4. Print the new ID so you can record it
  RAISE NOTICE 'Yep Kitchen UUID migrated from % to %', old_id, new_id;

END $$;
