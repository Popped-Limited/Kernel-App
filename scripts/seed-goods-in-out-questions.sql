-- ============================================================
-- Seed compliance questions into Goods In and Goods Out
-- checklists for all existing organisations.
-- Safe to run multiple times — skips orgs that already have
-- questions on their Goods In / Goods Out checklist.
-- ============================================================

DO $$
DECLARE
  org RECORD;
  goods_in_cl_id  uuid;
  goods_out_cl_id uuid;
  existing_count  int;
BEGIN

  FOR org IN SELECT id, name FROM organisations LOOP

    -- --------------------------------------------------------
    -- GOODS IN questions
    -- --------------------------------------------------------
    SELECT id INTO goods_in_cl_id
    FROM checklists
    WHERE organisation_id = org.id
      AND name ILIKE '%goods in%'
      AND active = true
    LIMIT 1;

    IF goods_in_cl_id IS NOT NULL THEN
      SELECT COUNT(*) INTO existing_count
      FROM questions WHERE checklist_id = goods_in_cl_id;

      IF existing_count = 0 THEN
        RAISE NOTICE 'Seeding Goods In questions for org: %', org.name;
        INSERT INTO questions (checklist_id, organisation_id, label, type, required, order_index, options, hint, follow_up) VALUES
          (goods_in_cl_id, org.id, 'Was the delivery vehicle clean and in good repair?',     'checkbox', true,  1, NULL, NULL, NULL),
          (goods_in_cl_id, org.id, 'Was all packaging intact and undamaged on arrival?',      'checkbox', true,  2, NULL, NULL, NULL),
          (goods_in_cl_id, org.id, 'Were all items correctly labelled?',                       'checkbox', true,  3, NULL, NULL, NULL),
          (goods_in_cl_id, org.id, 'Were all items within their best before date?',            'checkbox', true,  4, NULL, NULL, NULL),
          (goods_in_cl_id, org.id, 'Were any items rejected? If yes, please specify.',         'text',     false, 5, NULL, 'List any rejected items and reason', NULL),
          (goods_in_cl_id, org.id, 'Any other notes?',                                         'text',     false, 6, NULL, 'Optional', NULL);
      ELSE
        RAISE NOTICE 'Skipping Goods In for org % — already has % question(s)', org.name, existing_count;
      END IF;
    ELSE
      RAISE NOTICE 'No active Goods In checklist found for org: %', org.name;
    END IF;

    -- --------------------------------------------------------
    -- GOODS OUT questions
    -- --------------------------------------------------------
    SELECT id INTO goods_out_cl_id
    FROM checklists
    WHERE organisation_id = org.id
      AND name ILIKE '%goods out%'
      AND active = true
    LIMIT 1;

    IF goods_out_cl_id IS NOT NULL THEN
      SELECT COUNT(*) INTO existing_count
      FROM questions WHERE checklist_id = goods_out_cl_id;

      IF existing_count = 0 THEN
        RAISE NOTICE 'Seeding Goods Out questions for org: %', org.name;
        INSERT INTO questions (checklist_id, organisation_id, label, type, required, order_index, options, hint, follow_up) VALUES
          (goods_out_cl_id, org.id, 'Was the dispatch vehicle clean and in good condition?',        'checkbox', true,  1, NULL, NULL, NULL),
          (goods_out_cl_id, org.id, 'Were all products correctly labelled with batch code and BBE?','checkbox', true,  2, NULL, NULL, NULL),
          (goods_out_cl_id, org.id, 'Were any products rejected or held back? If yes, specify.',    'text',     false, 3, NULL, 'List any held or rejected products and reason', NULL);
      ELSE
        RAISE NOTICE 'Skipping Goods Out for org % — already has % question(s)', org.name, existing_count;
      END IF;
    ELSE
      RAISE NOTICE 'No active Goods Out checklist found for org: %', org.name;
    END IF;

  END LOOP;

END $$;
