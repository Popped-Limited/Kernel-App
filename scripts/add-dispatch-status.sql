-- Packed / shipped status on goods out.
--
-- A pallet is often packed days before it ships: the stock physically leaves
-- the warehouse at packing time, but the dispatch (and its Goods Out
-- compliance record) happens later. A "packed" dispatch row deducts stock and
-- reserves its batch immediately — exactly like a shipped one, because stock
-- is computed live from dispatches — and is promoted to "shipped" from the
-- Goods Out page, which stamps the real dispatch date/dispatcher and creates
-- the Goods Out compliance submission at that point (all dispatch checks are
-- answered at shipping, per Tom 15 Jul 2026).
--
-- pack_group_id groups the rows packed together as one order, so a
-- multi-product pallet is shipped with a single confirmation and a single
-- compliance record (mirroring how a multi-product dispatch is logged today).
--
-- Existing rows all default to 'shipped' — history is untouched.

alter table dispatches
  add column if not exists status text not null default 'shipped'
    check (status in ('packed', 'shipped')),
  add column if not exists packed_date date,
  add column if not exists packed_by text,
  add column if not exists pack_group_id uuid,
  -- Photo answers captured at packing (question_id → storage URL). The photo
  -- (e.g. of the delivery note) is taken when the pallet is packed, not when
  -- it ships — Mark shipped pre-fills these into the Goods Out compliance
  -- record, where they can still be retaken/replaced.
  add column if not exists packed_answers jsonb;
