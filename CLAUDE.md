# Kernel — project guide for Claude

Kernel is a **multi-tenant commercial SaaS** for small food businesses (compliance, production
records, traceability, SOPs, training, stock). Next.js (App Router) + Supabase + Tailwind, Stripe
billing, deployed from `Popped-Limited/Kernel-App.git` (main branch) via Vercel to
**kernelapp.co.uk**. Founder: Tom Palmer (non-developer).

## The one rule that matters most
**Every piece of data is scoped to `organisation_id`. RLS on every table. No cross-org access, ever.**
A user from org A must never read/write/edit/delete org B's data. When adding a table or query,
scope it by org and add an RLS policy (`USING (organisation_id = get_my_org_id())`).

- **Yep Kitchen** (org `15a33d45-…`) is a **paying customer** (£149/mo) — never treat its data as test data.
- **Popped Limited** (org `00000000-…`, login `support@kernelapp.co.uk`) is the **demo/test account**. Do test writes here, not in Yep Kitchen.

## Deploy / workflow
- Changes only go live when **committed AND pushed** to main. Vercel auto-deploys.
- End commit messages with the `Co-Authored-By:` trailer.
- Verify UI changes in a local preview before pushing when practical.

## Data conventions (learned the hard way — don't regress these)
- **NO 1000-row truncation, ever.** PostgREST silently caps un-ranged selects (and `.in()` results) at
  1000 rows. Every query on a table that grows with usage (submissions, answers, dispatches, returns,
  ingredient_lots, wastage_log, adjustments, drafts, training_records, mock_recalls, reminders) MUST use
  `fetchAll` (lib/fetchAll.ts) or `fetchAllByIn` (lib/traceability.ts), always with a stable `.order()`.
  Site-wide sweep done 2 Jul 2026 — don't reintroduce it. Deliberate UX caps use `.limit()` + a comment.
- **Submit answer payloads** to `/api/submit` must be `{ question_id, value }` (NOT `answer`).
- **Checkbox answers** are stored as the strings `"true"` / `"false"`; the submission view checks `val === "true"`.
- **Batch code / Julian code** must be read from a **text** question (`type === "text"`). Don't match by
  label alone — the "Labelling verified — correct batch code…" checkbox also contains "batch code" and
  will otherwise store its `"true"` value as a batch code.
- **BBE/best-before** extraction must ignore checkbox `"true"`/`"false"` values and require a date-shaped value.
- **`multi_number`** question = count of input boxes stored as a string in `options[0]`.
- **`ingredient_table`** recipes store `"Name|grams"` per `options[]` entry; editable in Manage Checklists.
- **Recipe ingredient → stock** links by **EXACT** (case-insensitive, trimmed) name only. Never fuzzy/substring
  match — similar names like "Long red chilli" vs "Red chilli powder" must not collide. (Tom's explicit rule.)
- **Units produced vs jars packed**: prefer the "Total units produced" answer; only fall back to packing-log
  `jars_used` when it's absent. Track them in **separate accumulators** so answer order can't make the fallback win.
- **Goods In/Out** write structured `batch_notes` that the submission view parses into tables; **production**
  batch notes render verbatim (colons in free text must not be parsed as label/value).
- **Primary packaging** (jars/lids that touch the product) is traced/deducted like ingredients: items flagged
  `ingredients.is_primary_packaging` (opt-in, default false). A `packing_runs` question's `hint` JSON maps its
  container/closure to a packaging item (`jar_ingredient`/`closure_ingredient` = exact name); when mapped, the packing
  log picks the lot (`jar_lot_id`/`lids_lot_id`) and `/api/submit` deducts `jars_used`/`lids_count` from
  `ingredient_lots`. Traceability + draft reservation treat ingredient_table and packing_runs lot refs uniformly.
  Secondary packaging (boxes) is never mapped — no link, no deduction. Set the mapping in the production-flow builder
  OR the existing-checklist editor (so live records link without rebuilding).
- **Finished-goods stock** is product-level: `produced − dispatched + adjustments`, matched by **exact product name**.
  Dispatches link to a production batch via `batch_submission_id`; per-batch "remaining" = produced − dispatched-against-that-batch.
- **Backward mock recall is batch-level**: product name → pick ONE batch code (`searchProductBatches` groups
  production submissions by batch code — the code on the jar is the unit of recall) → `traceFromBatchGroup`.
  Never trace a product's whole history for a recall. Customer + supplier contact rows are pre-filled from the
  trace; both live in `mock_recalls.customers_contacted` jsonb tagged `kind: "customer" | "supplier"` (legacy
  rows without `kind` are customers). `mock_recalls` has NO service_role grant — admin scripts can't touch it.
- **Every trace surfaces gaps**: `enrich()` in lib/traceability.ts attaches batch-tagged
  `finished_goods_adjustments` and `unlinked_dispatches` (same product, no batch link) to every TraceResult —
  a recall can't rule unlinked dispatches in or out, so they render as a red warning, never hidden.
- **wastage_log is the raw-material write-off ledger** (created in prod 2 Jul 2026 — history before then is lost).
  The Reconcile panel has three modes: write off / counted stock / **explain variance** (logs a historical
  write-off WITHOUT touching `quantity_remaining_g`, closing a lot's unaccounted gap truthfully; auto-selected
  for depleted lots with a gap). Always set `created_by`. "Recalculate stock" replays production usage AND
  subtracts wastage_log write-offs — replaying usage alone would resurrect written-off stock.

## Product/name integrity
- Dispatch product must be **selected from the products dropdown** (create AND edit), never free-typed — a typo
  silently breaks the stock figure (it matches by exact name).

## In-progress production batches (`batch_drafts`)
- A draft is created/auto-saved while filling a per-batch production checklist; no limit; reserves stock until submitted.
- The resume prompt lists **all** in-progress batches for that product to choose from.
- **"Start a new batch" must NEVER delete an existing draft** (it once did, and lost a live batch). Drafts are only
  deleted via the dashboard's explicit trash button.

## UI / styling
- Brand palette (Tailwind): `brand` `#F5C65A`, `brand-dark` `#C9A24A`, `brand-light` `#EDE5D0`, `brand-cream` `#F7F2E8`,
  `brown` `#3A3520`, `brown-light` `#7A7050`. Marketing-page accents: gold `#C89A18`, bright gold on dark `#F0D870`,
  dark `#1C1A10`.
- Form fields must be **≥16px on mobile** — sub-16px inputs make iOS Safari auto-zoom and stay zoomed (breaks layout).
- User display names come from auth `user_metadata.full_name`; fall back to that (not a generic "Staff") for submitted_by.

## Local dev / verifying as a user
- DB checks/fixes: run Node scripts inside the repo using `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`
  (service role **bypasses RLS** — to test isolation use the anon key or a magic-link session).
- Preview: launch config `kernel-dev` (`~/.claude/launch.json`). To view as a user, mint a magic-link session
  and set the `sb-dudchdacsrgdnenkqmyo-auth-token` cookie. Use `support@` for writes; only read-only nav as Yep Kitchen logins.

## Pending / TODO
- **Supabase is on Pro** (daily backups active). First real paying customer beyond Yep Kitchen
  signed 13 Jul 2026 — validate changes on the demo account (support@ = Popped) before they go live;
  don't push untested changes straight to `main`.

## Migrations applied (for reference)
- `training-documents.sql`, `add-batch-to-finished-goods-adjustments.sql`,
  `checklist-name-unique-per-org.sql` — all run 17 Jun 2026.
- `create-mock-recalls.sql` (mock recall tool), `fix-ingredient-name-per-org.sql`
  (ingredient names now unique PER org, not globally — fixed a multi-tenancy bug;
  also grants `finished_goods_adjustments` to `service_role`) — run 21 Jun 2026.
- `add-may-contain-and-spec-review.sql` (ingredients gain `may_contain_allergens`,
  `spec_sheet_review_frequency_years`, `spec_sheet_next_review_due`) — run 24 Jun 2026.
- `add-primary-packaging.sql` (ingredients gain `is_primary_packaging`) — run 24 Jun 2026.
- `add-label-artworks.sql` (versioned label artwork per product + AI FIC-8 presence-check
  results; grants include `service_role` — the check route writes via supabaseAdmin) —
  run 11 Jul 2026. Note: structured-output JSON schemas reject array `minItems`/`maxItems`
  other than 0 or 1 — enforce fixed-length arrays via the prompt + a `key` enum, not the schema.
- `add-nutrition-calc.sql` (ingredients gain `nutrition_basis` per_100g|per_100ml default
  per_100g; new `product_nutrition_settings` keyed (org, product_name): net_weight_per_unit_g,
  units_per_batch, prep_yields jsonb) — **PENDING: run in the Supabase SQL editor** (the
  Labelling tab's nutrition calc fails to load until then). Powers the recipe→per-100g label
  calc (`lib/nutrition/recipe-calc.ts`): reads the Production checklist ingredient_table
  definition, joins raw materials by EXACT name, converts per-100ml→per-100g via density,
  applies prep yields, gates on any missing data (never treats missing as 0), finished weight
  = units×net weight, FIC rounding at output.
- `add-costing-settings.sql` (product_nutrition_settings gains `secondary_packaging` jsonb
  `[{name, units_per_pack}]` — units per pack, cost/unit = pack price ÷ units_per_pack;
  `labour_staff`, `labour_hours`, `labour_cost_per_hour`) —
  **PENDING: run in the Supabase SQL editor** (Costing tab's secondary-packaging/labour save
  fails until then). Full cost/unit = ingredients (gross × £/kg) + primary packaging + secondary
  packaging + labour. Recipe & yields and Costing tabs write DIFFERENT columns of the same
  (org, product_name) row via `saveProductSettings` (fresh select → update/insert, never clobbers
  the other tab). Note `price_per_kg` doubles as price-per-unit for `unit:"units"` items.
- `create-demo-bookings.sql` (new `demo_slots` table for the customer "Book a demo" feature)
  — **PENDING: run in the Supabase SQL editor** (Book a demo + admin Demo availability fail until
  then). CROSS-ORG by design: support@ hand-picks bookable slots, ANY org's customer can claim an
  unbooked upcoming one — so it deliberately does NOT use `organisation_id = get_my_org_id()`
  isolation. RLS is ON with NO policy (deny-all direct access); everything goes through service-role
  routes `app/api/demo-slots/{route,book}.ts` (auth + support-only checks). Booking is an atomic claim
  (`update ... where booked_by_org is null and starts_at > now()`), then emails support@ AND the
  customer via Resend with an `.ics` invite attached (`lib/ics.ts`) — no Google API/OAuth. Admin page
  `app/admin/demo-slots` (support-only). Times stored as timestamptz, shown in Europe/London.
- `scripts/clone-yep-to-demo.mjs` clones Yep Kitchen's operational data into the
  Popped demo org (dry-run by default; `--commit` to apply). Skips logins/billing
  and the tables the admin key can't write (SOPs, calendar, wastage, training_sessions).
- Note: `training_sessions` is granted to `authenticated` (app works) but NOT `service_role`,
  so admin/Node scripts can't read/write it — use an authenticated magic-link session for that table.
