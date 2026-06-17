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
- **Finished-goods stock** is product-level: `produced − dispatched + adjustments`, matched by **exact product name**.
  Dispatches link to a production batch via `batch_submission_id`; per-batch "remaining" = produced − dispatched-against-that-batch.

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
- **Two DB migrations not yet confirmed run** (Supabase SQL editor):
  `scripts/training-documents.sql` and `scripts/add-batch-to-finished-goods-adjustments.sql`.
- **Vercel Pro + Supabase Pro upgrades** pending (commercial terms; Supabase Free = no daily backups).
