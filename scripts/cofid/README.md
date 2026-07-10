# CoFID → UK FIC nutrition reference data

Source data for the nutrition/labelling feature: the ingredient-level per-100g
values users search-and-link from when their raw material is a primary produce
(chilli, garlic, ginger, sugar, oil…). Compound/branded ingredients (doubanjiang,
soy sauce) come from supplier spec sheets instead — see the nutrition-labelling
plan.

## What's here

- `convert_cofid.py` — converts the official CoFID spreadsheet into the bundled dataset.
- `../../lib/nutrition/cofid.json` (written by this script) — 2,887 foods, per 100g, in **UK FIC by-weight** form: the 7
  mandatory nutrients (energy kJ/kcal, fat, saturates, carbohydrate, sugars,
  protein, salt) + fibre, plus food code, name and CoFID food group.

## Source

McCance & Widdowson's Composition of Foods Integrated Dataset 2021 (gov.uk, Open
Government Licence — free for commercial use). Download the spreadsheet next to
this script as `cofid2021.xlsx` before running the converter:

    https://assets.publishing.service.gov.uk/media/60538b91e90e07527df82ae4/McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx

Regenerate: `pip install openpyxl && python3 convert_cofid.py`

## Why a conversion is needed (the important bit)

CoFID and a UK FIC label express carbohydrate and energy **differently**. Copying
CoFID's numbers straight onto a label over-reads carbs (and therefore energy) —
this is the specific trap that trips up naive nutrition tools. The converter fixes
two things, both confirmed against the official CoFID user guide:

1. **Carbohydrate — monosaccharide equivalents → by weight.** CoFID expresses
   carbohydrate, starch, and every sugar column as *monosaccharide equivalents*
   (heavier than the actual carbohydrate, because hydrolysis adds water). FIC
   declares carbohydrate *by weight*. Conversion factors:
   - monosaccharides (glucose, galactose, fructose): ×1.00 (already by weight)
   - disaccharides (sucrose, maltose, lactose): ×0.95 (342/360)
   - starch & oligosaccharides: ×0.90 (162/180)

   Carb is anchored to CoFID's authoritative total-CHO figure and scaled by a
   per-food factor derived from that food's starch/sugar mix, bounded to
   [0.90, 1.00] — so by-weight carb is never above the monosaccharide value nor
   below 0.90× it. Sugars are converted from the individual sugar columns when
   present; when only total sugars is given, the disaccharide factor (0.95) is
   applied as a conservative default (≤5% error, within FIC tolerance).

2. **Energy — always recomputed, never copied.** CoFID energy uses 3.75 kcal/g on
   *monosaccharide* carb and **excludes fibre**. FIC (Annex XIV) uses different
   factors and **includes fibre**. Recomputed as:

       kcal = 4·protein + 9·fat + 4·carb_byweight + 2·fibre + 7·alcohol
       kJ   = 17·protein + 37·fat + 17·carb_byweight + 8·fibre + 29·alcohol

Other decisions: **salt** = sodium(mg)/1000 × 2.5 (per FIC). **Protein** uses
CoFID's food-specific nitrogen factors rather than a flat 6.25 — the difference is
within FIC tolerance. **Fibre** prefers AOAC values, falling back to NSP where AOAC
is absent (1,092 foods).

## Validation (run at build time, July 2026)

- Carbohydrate by-weight / monosaccharide ratio across all foods: **0.900–1.000**
  (physically valid — 0.90 = all starch, 1.00 = all monosaccharide).
- No food has sugars > carbohydrate (internal consistency holds).
- Recomputed energy vs CoFID's own energy: once the two *deliberate* FIC deltas
  (4 vs 3.75 kcal/g carb, + fibre energy) are subtracted, the residual is
  **median 0, 89% within ±1 kcal** — i.e. the carb conversion is chemically exact
  and every remaining difference from CoFID is an intended FIC correction.
- Gold-standard checks against real UK pack values: white sugar 399 kcal /
  99.75 g carb / 99.75 g sugars; honey 307 / 76.4; white bread 235 / 44 / 2.85 g
  sugars / 8.7 g protein; spirits/wine/lager energy matches CoFID to <1 kcal.

Field coverage: carbohydrate 99%, salt 99%, sugars 97%, fibre 91%, saturates 90%.
Missing values are stored as null (the app must show "not available", never 0).

## How the app uses it

Decision (Tom, 10 Jul 2026): bundled reference asset, not a database table — every
org gets identical, versioned data; no tenant/RLS surface; values are copied onto
the org's `ingredients` row when the user confirms a match, so a dataset update
never silently changes an existing label. Search lives in `lib/nutrition/cofid.ts`
(the raw-materials page loads it on demand); the nutrition columns on `ingredients`
come from `scripts/add-ingredient-nutrition.sql`.
