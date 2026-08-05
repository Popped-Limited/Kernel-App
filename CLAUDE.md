# Kernel — project guide for Claude

Kernel is a **multi-tenant commercial SaaS** for small food businesses (compliance, production
records, traceability, SOPs, training, stock). Next.js (App Router) + Supabase + Tailwind, Stripe
billing, deployed from `Popped-Limited/Kernel-App.git` (main branch) via Vercel to
**kernelapp.co.uk**. Founder: Tom Palmer (non-developer).

## The one rule that matters most
**Every piece of data is scoped to `organisation_id`. RLS on every table. No cross-org access, ever.**
A user from org A must never read/write/edit/delete org B's data. When adding a table or query,
scope it by org and add an RLS policy (`USING (organisation_id = get_my_org_id())`).
- **A migration existing in `scripts/` does NOT mean it ran in prod.** On 29 Jul 2026 a live
  cross-org leak surfaced (Yep Kitchen saw The Chocolate Society's "Milk Chocolate Honeycomb"):
  `finished_goods_adjustments` and `saq_questions` still had leftover `USING(true)` policies
  because the org-scoping fixes were never applied. Postgres OR's permissive policies, so ONE
  stray `USING(true)` silently defeats a correct `org_isolation` policy — and most list pages
  (e.g. Finished Goods) have NO app-level org filter, so they leak everything RLS lets through.
  Fixed via `scripts/fix-rls-leaks-2026-07-29.sql`.
- **Verify RLS the hard way, not by reading scripts.** Reproduce as a real login
  (`admin.generateLink` magiclink → `verifyOtp` with the anon client → query as that user).
  That has a blind spot (a table where only one org has data can't reveal a `USING(true)` hole),
  so for the definitive sweep run `scripts/rls-audit.sql` (read-only, inspects live `pg_policies`).

- **Yep Kitchen** (org `15a33d45-…`) is a **paying customer** (£149/mo) — never treat its data as test data.
- **Popped Limited** (org `00000000-…`, login `support@kernelapp.co.uk`) is the **demo/test account**. Do test writes here, not in Yep Kitchen.

## Deploy / workflow
- Changes only go live when **committed AND pushed** to main. Vercel auto-deploys.
- End commit messages with the `Co-Authored-By:` trailer.
- Verify UI changes in a local preview before pushing when practical.

## Public (unauthenticated) pages — a hard invariant
**A public page is only public if the API routes it calls are ALSO in `PUBLIC_PREFIXES`** (middleware.ts).
Outsiders with no login use `/saq/[token]` (supplier questionnaire), `/c/[token]` (public checklist),
`/accept-invite`, `/signup`. Adding a page to the allowlist is half the job — the moment its data moves
behind a route (`/api/saq/`, `/api/submit`, `/api/accept-invite`), that route must be allowlisted too.
- The failure is silent and looks device-specific: the page renders 200, its `fetch` is 307'd to `/login`,
  **the login HTML comes back as a 200 so `res.ok` passes**, and `res.json()` throws into an unhandled
  rejection — the visitor sits on "Loading…" forever. It appears to work for anyone already signed in
  (i.e. you), so it survives testing. Bitten twice: `/api/submit` (`d2e0cb5`), `/api/saq/` (`3e3e509`,
  broken 21 Jun–29 Jul 2026 and it silently blocked real suppliers the whole time).
- These routes are service-role + token-authorised by design; the token is the sole authorisation, so
  allowlisting them is correct, not a loosening. Never "fix" it by making the table anon-readable.
- Public forms must **never claim success they haven't got**: check `res.ok` on submit and show an error
  that keeps the answers. A stranger shown a thank-you page will never fill the form in again.

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
- **Stock overdraw is BLOCKED (16 Jul 2026)**: a record may never log more against a goods-in lot than
  `quantity_remaining_g` (summed across all runs/fields of the record; ingredients in grams, packaging in
  units). `/api/submit` rejects with 400 BEFORE inserting; the checklist page mirrors the check with field
  errors + live warnings. The deduction's `Math.max(0, …)` clamp stays only as a race-condition backstop —
  never rely on it: a clamped excess silently vanishes and leaves phantom stock on the lot actually poured
  (that's how Yep's rapeseed 26175 absorbed 50kg that belonged to 26182).
- **Units produced vs jars packed**: prefer the "Total units produced" answer; only fall back to packing-log
  `jars_used` when it's absent. Track them in **separate accumulators** so answer order can't make the fallback win.
- **Goods In/Out** write structured `batch_notes` that the submission view parses into tables; **production**
  batch notes render verbatim (colons in free text must not be parsed as label/value).
- **Primary packaging** (jars/lids that touch the product) is traced/deducted like ingredients: items flagged
  `ingredients.is_primary_packaging` (opt-in, default false). A `packing_runs` question's `hint` JSON maps its
  container/closure to a packaging item (`jar_ingredient`/`closure_ingredient` = exact name); when mapped, the packing
  log picks the lot (`jar_lot_id`/`lids_lot_id`) and `/api/submit` deducts `jars_used`/`lids_count` from
  `ingredient_lots`. Traceability + draft reservation treat ingredient_table and packing_runs lot refs uniformly.
  A packing entry can be **split across several jar/lid lots** (ran out mid-batch): the breakdown lives in
  `jar_lots`/`lid_lots`, with `jar_lot_id`/`jar_batch` mirroring the first allocation and `jars_used`/`lids_count`
  holding the TOTAL (the units-produced fallback reads it). Anything that deducts/reserves/traces packaging must go
  via `packLotUses` (lib/packing-runs.ts) — reading `jar_lot_id` alone under-deducts a split entry and leaves
  phantom stock on the second lot. Secondary packaging (boxes) is never mapped — no link, no deduction. Set the mapping in the production-flow builder
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
- **Supabase is on Pro** (daily backups active). The 13 Jul 2026 "first customer" (Dynamic Food
  Safety, a Beacon-referred consultancy) never completed checkout and asked to cancel — Yep Kitchen
  is still the only paying customer. The demo-first policy stands anyway: validate changes on the
  demo account (support@ = Popped) before they go live; don't push untested changes straight to `main`.
- **Billing gate live (13 Jul 2026):** middleware requires a live Stripe sub (`trialing`/`active`/
  `past_due`) to use the app; everyone else is pinned to `/account/billing?setup=1`. Free access is
  by exact email only (`support@kernelapp.co.uk`, `katie@beacon-compliance.co.uk`) — never a blanket
  status. `/account/billing/confirm` reconciles the org synchronously after Stripe checkout
  (idempotent with the webhook) so just-paid users aren't bounced. NB: DB default `trial` ≠ Stripe's
  `trialing`.
- **Trial-end reminder (14 Jul 2026):** hourly Vercel cron `/api/trial-reminders` emails every
  `trialing` Stripe sub ONCE, 48h before trial end — when the charge happens and how to cancel
  (policy: never let a trial roll into a charge unannounced). Stripe is the source of truth;
  idempotency via sub metadata `trial_reminder_sent_at` (no DB table); `cancel_at_period_end` subs
  are skipped. Trial length: **30 days for everyone** (28 Jul 2026 — was Beacon 30 / direct 7; a
  week was too short to upload everything, and the goal is catching businesses at the start of
  their SALSA journey). Checkout still falls back to the org's stored `referral_source` when
  resumed from the billing page (no body), but it now only affects attribution metadata.

## Migrations applied (for reference)
- `training-documents.sql`, `add-batch-to-finished-goods-adjustments.sql`,
  `checklist-name-unique-per-org.sql` — all run 17 Jun 2026.
- `create-mock-recalls.sql` (mock recall tool), `fix-ingredient-name-per-org.sql`
  (ingredient names now unique PER org, not globally — fixed a multi-tenancy bug;
  also grants `finished_goods_adjustments` to `service_role`) — run 21 Jun 2026.
- `add-may-contain-and-spec-review.sql` (ingredients gain `may_contain_allergens`,
  `spec_sheet_review_frequency_years`, `spec_sheet_next_review_due`) — run 24 Jun 2026.
- `add-primary-packaging.sql` (ingredients gain `is_primary_packaging`) — run 24 Jun 2026.
- `add-label-artworks.sql` (versioned label artwork per product + AI FIC-8 check results;
  grants include `service_role` — the check route writes via supabaseAdmin) —
  run 11 Jul 2026. Note: structured-output JSON schemas reject array `minItems`/`maxItems`
  other than 0 or 1 — enforce fixed-length arrays via the prompt + a `key` enum, not the schema.
  The check (14 Jul 2026) is presence AND consistency: the route loads the product's recipe
  declaration/allergens/QUID/net weight (via the user's RLS client, degrading to presence-only
  if unavailable) and a wrong-product label returns `mismatch`, never a green tick.
- `add-nutrition-calc.sql` (ingredients gain `nutrition_basis` per_100g|per_100ml default
  per_100g; new `product_nutrition_settings` keyed (org, product_name): net_weight_per_unit_g,
  units_per_batch, prep_yields jsonb) — **applied in prod** (verified 29 Jul 2026). Powers the recipe→per-100g label
  calc (`lib/nutrition/recipe-calc.ts`): reads the Production checklist ingredient_table
  definition, joins raw materials by EXACT name, converts per-100ml→per-100g via density,
  applies prep yields, gates on any missing data (never treats missing as 0), finished weight
  = units×net weight, FIC rounding at output. Raw-material nutrition is **all-or-nothing**:
  the edit panel blocks saves with a partial set of the 9 values (blanks would silently
  withhold the product's nutrition table). **QUID % is only declared for ingredients named
  in the product title** (`namedInProductTitle` in recipe-calc — word match with
  plural/compound/-ed forms; garlic/chilli/oil for "Garlic Chilli Oil", never salt) —
  don't regress to a % on every ingredient.
- `add-costing-settings.sql` (product_nutrition_settings gains `secondary_packaging` jsonb
  `[{name, units_per_pack}]` — units per pack, cost/unit = pack price ÷ units_per_pack;
  `labour_staff`, `labour_hours`, `labour_cost_per_hour`) —
  **applied in prod** (verified 29 Jul 2026). Full cost/unit = ingredients (gross × £/kg) + primary packaging + secondary
  packaging + labour. Recipe & yields and Costing tabs write DIFFERENT columns of the same
  (org, product_name) row via `saveProductSettings` (fresh select → update/insert, never clobbers
  the other tab). Note `price_per_kg` doubles as price-per-unit for `unit:"units"` items.
- `add-dispatch-status.sql` (dispatches gain `status` packed|shipped default shipped,
  `packed_date`, `packed_by`, `pack_group_id`) — **applied in prod** (verified 29 Jul 2026).
  A **packed** goods out deducts stock/batch remaining
  immediately (stock is computed live from dispatch rows; the pallet has physically left) but
  has NO Goods Out compliance record and a placeholder `dispatch_date` (= packed date) until
  **Mark shipped** stamps the real date/dispatcher and creates the compliance submission —
  dispatch checks are answered at shipping (Tom, 15 Jul 2026: labels are still verifiable
  in the warehouse) — EXCEPT photo questions, which show at packing ("Packing photos"): the
  delivery note is photographed on the pallet when packed, uploaded immediately and stored in
  `packed_answers` jsonb (question_id → URL), then pre-filled (retakeable) into the Mark
  shipped checks so the compliance record keeps them. A failed photo upload blocks the packed
  save — never silently drop the photo. `pack_group_id` groups rows packed together so a multi-product pallet
  ships as one order with one compliance record. Returns only apply once shipped; packed
  orders are edited or removed (delete is guarded by `.eq("status","packed")` — never deletes
  a shipped dispatch). Traceability tags these "Packed — not shipped" (on site, interceptable).
- `create-demo-bookings.sql` (new `demo_slots` table for the customer "Book a demo" feature)
  — **applied in prod** (verified 29 Jul 2026). CROSS-ORG by design: support@ hand-picks bookable slots, ANY org's customer can claim an
  unbooked upcoming one — so it deliberately does NOT use `organisation_id = get_my_org_id()`
  isolation. RLS is ON with NO policy (deny-all direct access); everything goes through service-role
  routes `app/api/demo-slots/{route,book}.ts` (auth + support-only checks). Booking is an atomic claim
  (`update ... where booked_at is null and starts_at > now()`), then emails support@ AND the
  customer via Resend with an `.ics` invite attached (`lib/ics.ts`) — no Google API/OAuth. Admin page
  `app/admin/demo-slots` (support-only) is a **month calendar**: click a day, set an availability
  window (from/to) + demo length, and it bulk-generates the discrete slot rows (customers still book
  one discrete slot; the calendar is just a nicer creation tool). `booked_at` (NOT `booked_by_org`) is
  the "is booked" marker — a booking with a null org must still count as taken. API: `POST` accepts
  `{ slots: ISO[], duration_mins }` (bulk, upsert `onConflict: starts_at, ignoreDuplicates`) or single
  `{ starts_at }`; `GET ?admin=1&from&to` returns a date range; `DELETE ?id=` (one) or `?from&to`
  (clear unbooked in range). Times stored as timestamptz, shown/generated in Europe/London (browser tz).
- `add-demo-settings.sql` (single-row `demo_settings` holding the demo video `meeting_url`)
  — **applied in prod** (table verified 4 Aug 2026). Kernel-global singleton (id=1), RLS on/no policy, service-role
  only; edited via `app/api/demo-slots/settings` (support-only GET/POST). The book route embeds the
  link in both ICS files (`LOCATION`/`URL`) and as a "Join the demo" button in both emails; if unset
  the support email warns to add one. One shared room is fine — demos run one at a time. Booking
  emails now send via `Promise.allSettled` so one failing doesn't block the other.
- `create-gmp-audits.sql` (GMP audits, SALSA issue 7: `gmp_areas` + `gmp_audits` + `gmp_findings`,
  all org-isolated RLS) — **applied in prod** (tables verified 4 Aug 2026).
  Model: monthly audit of ONE area on a rota (app suggests the
  longest-unaudited area; free choice allowed). Areas are seeded in-app with SALSA-shaped defaults
  on first visit (placeholder wording pending Katie's confirmation — editable per org, deactivate
  never delete). Findings are free-form: photos (reuses `compliance-photos` bucket under `gmp/`),
  description, high/medium/low risk → auto due date (7/30/90 days, editable), assignee from
  `team_members`. Assignee closes out with note + optional after photo; audits with zero findings
  are valid clean audits. Emails: `/api/gmp/notify` (assignment, called by the audit page after
  save — email failure must never look like a failed save) and daily cron `/api/gmp/overdue`
  (one nudge per finding via `overdue_notified_on`; unsent groups retry next day).
- `create-lab-tests.sql` (per-product lab test results: new `lab_tests` table, org-isolated RLS)
  — **applied in prod 30 Jul 2026, RLS verified as real logins** (support@ insert/read OK,
  cross-org insert blocked, Yep login + anon see 0 rows; demo row seeded in Popped). Keyed (organisation_id, product_name) matched case-insensitively like label artworks; one row per
  test (test_date/test_type/lab_name/batch_code/result/notes), report file optional in
  `compliance-docs` under `lab-tests/`; `result` is satisfactory|borderline|unsatisfactory|'' (= see
  report). No API route — the panel (`components/ProductLabTestsPanel.tsx`) reads/writes directly
  under RLS.
- `add-shelf-life-extensions.sql` (new org-isolated `shelf_life_extensions` table: per-lot
  internal shelf-life extensions — extended_until, required reason, created_by) — **applied in
  prod 30 Jul 2026, RLS verified as real logins** (support@ insert/read OK, cross-org insert
  blocked, Yep login + anon see 0 rows; demo extension seeded in Popped on Thai chilli lot
  26117). NB: first run silently didn't take (SQL editor showed success on re-run) — always
  verify the table actually exists after running. The supplier's `best_before_date` on
  `ingredient_lots` is IMMUTABLE — every extension is an audit row; effective BBE = latest
  extension ?? supplier date (lib/shelf-life.ts, deliberately NO default-shelf-life-days concept
  — Tom: fresh items get ~5 days typed at Goods In). Raw Materials: expiry badges (red expired /
  amber ≤7 days) + per-lot Extend panel with history; expired lots WARN, never block — the
  checklist lot picker flags "past best before" in options + a warning under the row (extending
  is the sanctioned way to keep using a lot). Pre-batch stock check (no migration): the
  production checklist page compares recipe grams × runs vs stock-minus-reserved and shows an
  amber shortfall banner before anyone starts weighing (part-batches legitimate; submit-time
  overdraw block still guards the deduction).
- `add-calendar-batches.sql` (`production_calendar` gains `batches` int default 1) — **applied
  in prod 30 Jul 2026, verified as support@** (batches write OK; NB `production_calendar` has NO
  service_role grant, like `training_sessions` — admin scripts must use a real login). Powers
  **Production Schedule** (`/production/schedule`, sidebar tab under Production): the week's
  calendar (ProductionCalendar with `showBatches` + `onWeekData`) plus an ingredient requirement
  table over a **1/2/4-week horizon, CUMULATIVE from the displayed week's Monday** (the page
  refetches the event range itself; the calendar only reports week + changes) — needed = recipe
  × planned batches; in stock = lot remainders minus draft reservations; to order = the gap,
  shortfalls sorted first. "Export order sheet" downloads the to-order rows as CSV (ingredient,
  supplier via exact-name match, to order / in stock / needed); per Tom there's deliberately NO
  "Log a delivery" link here. Ingredient matching is EXACT name (case-insensitive) — a recipe
  name missing from Raw Materials renders "Not in Raw Materials", never fuzzy-matched. The
  dashboard calendar stays and now links "Plan this week →" to the schedule page.
- **Organoleptic Checks** (30 Jul 2026, no migration): adhoc checklist in the new-org seed pack.
  Seed extras that DON'T exist in Yep live in `lib/seed/extra-checklists.json`;
  `build-salsa-baseline.mjs` merges them on every rebuild (a rebuild would otherwise drop them) —
  add future non-Yep seed checklists there, never only to the frozen JSON. Product linking: the
  optional "Production batch record" `batch_link` question ties a check to a production batch;
  the product hub's Organoleptic tab (`components/ProductOrganolepticPanel.tsx`) lists checks
  matched by the batch_link's product or, unlinked, by exact (case-insensitive) product-name
  answer — checklist matched by name `ilike %organoleptic%`. Backfilled into ALL 8 existing orgs
  5 Aug 2026 (insert-only, skip-if-present).
- **Seeded content must reach EXISTING orgs too (Tom, 5 Aug 2026).** The new-org seed pack only runs
  at signup, so adding a checklist there alone leaves every live customer without it — it looks like
  a missing feature, which is how Organoleptic Checks "disappeared". Whenever you add to the seed
  pack, also run an insert-only, skip-if-present backfill across all orgs in the same session.
- `add-spec-sheets.sql` (product spec sheet PDFs: org-singleton `spec_company_details` jsonb +
  per-product `product_spec_sheets` jsonb keyed (org, lower(product_name)), both org-isolated RLS)
  — **applied in prod** (tables verified 4 Aug 2026).
  Powers the product hub's **Spec sheet** tab: edits the non-derivable fields (doc control, shelf
  life wording, micro targets, organoleptics, packaging spec, suitability, sign-off, amendment log)
  and generates a Beacon-style "Finished Product Specification" PDF via `@react-pdf/renderer`.
  Derived content (ingredient declaration + QUID, allergen contains, nutrition per-100g, net
  quantity) is computed at download time by the SAME calc as the Declarations tab — never stored,
  so the sheet can't drift from the recipe. Pack shot uploads to `compliance-docs` under
  `spec-sheets/`, **PNG/JPEG only** (react-pdf can't embed other formats). react-pdf gotchas
  (all verified the hard way): a page-level `lineHeight` style silently blanks every Text using a
  `render` prop (kills the "Page x of y" counter); built-in Helvetica has no superscript glyphs
  (micro targets use "<1,000 cfu/g", never "10³"); auto-hyphenation is disabled via
  `Font.registerHyphenationCallback`. `SpecSheetPDF.tsx` must only ever be loaded via dynamic
  `import()` (it's heavy); `import type` from it is fine.
- **Enter data ONCE — the spec sheet pulls, it doesn't re-ask (Tom, 5 Aug 2026).** Every field that
  exists elsewhere in Kernel is read-only on the Spec sheet tab with a link to its home, because the
  alternative is re-typing the same data for every product:
  • Company information → **Account → Company details** (`/account/company`, org-singleton
    `spec_company_details`). Never edit it per product.
  • Organoleptic standard (appearance/aroma/texture/flavour) → the **Organoleptic tab**, above the
    check history (the checks are pass/fail evidence; the standard is the definition the spec declares).
  • Micro limits → **"Read from lab reports"** (`/api/extract-micro-targets`): Claude reads the
    product's most recent lab-test PDFs (max 3, newest first) and returns test/limit/result rows for
    review. Nothing is saved without a human ticking it, and a row with NO stated limit is left
    unticked — never invent a limit for a customer-facing spec. The micro table is **deliberately
    empty by default** (Tom, 5 Aug 2026 — a seeded list silently puts one product's limits on every
    product in every org) and the PDF omits the whole Microbiological Analysis section while it is.
    Same auth shape as
    `extract-spec-nutrition` (user's session → org from `organisation_members` → admin client with an
    explicit org assert).
  Both tabs write DIFFERENT keys of the same `product_spec_sheets.data` jsonb via `saveSpecPatch`
  (`components/useProductSpecSheet.ts`), which re-reads and merges — the Spec sheet tab must never
  write `organoleptic`, and the PDF re-reads the row at download so it can't ship a stale standard.
  This is the same non-clobbering pattern as `saveProductSettings`.
- **Finished-goods query perf (30 Jul 2026):** the finished-goods list + product pages and the
  dashboard's weekly-production query filter submissions server-side with
  `checklist:checklists!inner(...)` + `.eq("checklist.category", "Production")` — don't regress to
  fetching every submission and filtering client-side (Yep's daily checks made those pages crawl;
  471 → 58 rows). NB an embedded-table filter WITHOUT `!inner` does not drop parent rows — it just
  nulls the embed, so the filter silently does nothing for perf.
- `scripts/clone-yep-to-demo.mjs` clones Yep Kitchen's operational data into the
  Popped demo org (dry-run by default; `--commit` to apply). Skips logins/billing
  and the tables the admin key can't write (SOPs, calendar, wastage, training_sessions).
- Note: `training_sessions` is granted to `authenticated` (app works) but NOT `service_role`,
  so admin/Node scripts can't read/write it — use an authenticated magic-link session for that table.
- `fix-rls-leaks-2026-07-29.sql` (drops leftover `USING(true)` policies on
  `finished_goods_adjustments` + `saq_questions`, recreates org-scoped ones) — run 29 Jul 2026,
  closed a live cross-org leak. `rls-audit.sql` is a read-only whole-schema RLS sweep (keep for reuse).
