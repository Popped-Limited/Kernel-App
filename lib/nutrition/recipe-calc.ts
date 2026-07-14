// Recipe → per-100g label calculation.
//
// Computes a product's FIC nutrition declaration, ingredient list and QUID
// percentages from its recipe DEFINITION (the production checklist's
// ingredient_table, "Name|grams") joined to each raw material's stored
// per-100g nutrition. Pure and deterministic — no I/O; the caller supplies the
// recipe, the ingredient lookup and the product settings.
//
// Rules that must not regress:
//  - Recipe ingredient → raw material links by EXACT (trimmed, case-insensitive)
//    name only, never fuzzy (Tom's rule). Callers normalise with `normaliseName`.
//  - A missing nutrient value is NEVER treated as 0 — if any declared ingredient
//    lacks complete data the per-100g table is withheld and the gaps are listed.
//  - Liquids whose spec was per 100ml are converted to per 100g via density.
//  - Finished weight = units_per_batch × net_weight_per_unit_g (captures cooking
//    loss). per-100g = batch nutrient total ÷ finished weight × 100.

import type { NutritionPer100g } from "@/lib/types";

export const NUTRIENT_KEYS = [
  "energy_kj", "energy_kcal", "fat_g", "saturates_g",
  "carbohydrate_g", "sugars_g", "fibre_g", "protein_g", "salt_g",
] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export function normaliseName(name: string): string {
  return name.trim().toLowerCase();
}

// ── QUID ────────────────────────────────────────────────────────────────────
// QUID % is declared only for ingredients emphasised in the product's name
// (FIC Art. 22): "Garlic Chilli Oil" needs a % for garlic, chilli and oil —
// not for salt. Word-level match with basic plural handling ("chilli" matches
// "Long red chillies"). Shared by the Declarations tab and the label checker
// so both surfaces agree on which ingredients need a %.

const TITLE_STOP_WORDS = new Set(["and", "the", "with", "for", "our", "style"]);

function titleWords(s: string): string[] {
  return s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && !TITLE_STOP_WORDS.has(w));
}

function wordVariants(w: string): string[] {
  const v = new Set([w]);
  if (w.endsWith("ies")) v.add(w.slice(0, -3) + "y"); // berries → berry
  if (w.endsWith("es")) v.add(w.slice(0, -2));        // chillies → chilli, tomatoes → tomato
  if (w.endsWith("s")) v.add(w.slice(0, -1));         // onions → onion
  if (w.endsWith("ed")) {
    v.add(w.slice(0, -2));                            // salted → salt, smoked → smoke…
    v.add(w.slice(0, -1));                            // …pickled → pickle
  }
  return [...v];
}

function wordsMatch(a: string, b: string): boolean {
  for (const va of wordVariants(a)) {
    for (const vb of wordVariants(b)) {
      if (va === vb) return true;
      // Compound nouns: "Strawberries" is named by "Berry" in the title. The
      // ≥4 guard stops short suffixes ("oil", "nut") matching everything.
      if (vb.length >= 4 && va.endsWith(vb)) return true;
      if (va.length >= 4 && vb.endsWith(va)) return true;
    }
  }
  return false;
}

/** True when any word of the ingredient's name appears in the product title. */
export function namedInProductTitle(productName: string, ingredientName: string): boolean {
  const product = titleWords(productName);
  return titleWords(ingredientName).some((iw) => product.some((pw) => wordsMatch(iw, pw)));
}

/** A recipe line from the checklist definition. */
export interface RecipeRow {
  name: string;
  grams: number;
}

/** What the calc needs to know about one raw material. */
export interface IngredientData {
  nutrition: NutritionPer100g | null;
  basis: "per_100g" | "per_100ml";
  densityGPerL: number | null;
  allergens: string[];
  mayContain: string[];
  // Costing: price_per_kg for weight items, price-per-unit for `units` items.
  pricePerKg: number | null;
  unit: "g" | "units";
}

export interface CalcInput {
  recipe: RecipeRow[];
  /** Keyed by normaliseName(name). */
  ingredients: Map<string, IngredientData>;
  /** Keyed by normaliseName(name) → prep yield fraction (missing = 1). */
  prepYields: Map<string, number>;
  netWeightPerUnitG: number | null;
  unitsPerBatch: number | null;
  /** When set, flags which ingredients need a QUID % (named in the title). */
  productName?: string;
}

export interface DeclarationRow {
  name: string;
  effectiveG: number;
  /** effectiveG ÷ total effective grams × 100. */
  percent: number;
  /** True when this ingredient is named in the product title, so its % must be declared (QUID). */
  quid: boolean;
  allergens: string[];
}

export interface CalcGaps {
  /** Recipe names with no matching raw material. */
  unmatched: string[];
  /** Matched, but missing one or more of the 9 nutrient values. */
  missingNutrition: string[];
  /** per-100ml basis but no density set, so it can't be converted. */
  missingDensity: string[];
}

export interface CalcResult {
  gaps: CalcGaps;
  /** True when every declared ingredient has complete, convertible data. */
  nutritionComplete: boolean;
  finishedWeightG: number | null;
  /** Rounded per-100g values (FIC). null when data incomplete or no finished weight. */
  per100g: NutritionPer100g | null;
  /** Rounded per-unit values, if a net weight is set. */
  perUnit: NutritionPer100g | null;
  /** Descending weight order, with QUID %. Always available (needs only the recipe). */
  declaration: DeclarationRow[];
  contains: string[];
  mayContain: string[];
}

/** Convert one raw per-100(g|ml) value to per-100g using density when needed. */
function toPer100g(value: number, basis: IngredientData["basis"], densityGPerL: number | null): number | null {
  if (basis === "per_100g") return value;
  if (!densityGPerL || densityGPerL <= 0) return null;
  // 100 ml weighs densityGPerL/10 grams; scale the per-100ml figure up to per-100g.
  return (value * 1000) / densityGPerL;
}

function nutritionIsComplete(n: NutritionPer100g | null): n is NutritionPer100g {
  if (!n) return false;
  return NUTRIENT_KEYS.every((k) => typeof n[k] === "number" && n[k] !== null);
}

export function computeNutrition(input: CalcInput): CalcResult {
  const { recipe, ingredients, prepYields, netWeightPerUnitG, unitsPerBatch, productName } = input;

  const gaps: CalcGaps = { unmatched: [], missingNutrition: [], missingDensity: [] };
  const containsSet = new Set<string>();
  const mayContainSet = new Set<string>();

  const declaration: DeclarationRow[] = [];
  let totalEffectiveG = 0;

  // Batch nutrient totals (grams / kcal / kJ for the whole recipe batch).
  const totals: Record<NutrientKey, number> = {
    energy_kj: 0, energy_kcal: 0, fat_g: 0, saturates_g: 0,
    carbohydrate_g: 0, sugars_g: 0, fibre_g: 0, protein_g: 0, salt_g: 0,
  };
  let allConvertible = true;

  for (const row of recipe) {
    const key = normaliseName(row.name);
    const grams = Number(row.grams) || 0;
    if (grams <= 0) continue;

    const ing = ingredients.get(key);
    const yieldFrac = prepYields.get(key);
    const effectiveG = grams * (typeof yieldFrac === "number" ? yieldFrac : 1);

    if (!ing) {
      gaps.unmatched.push(row.name);
      allConvertible = false;
    } else {
      for (const a of ing.allergens) containsSet.add(a);
      for (const a of ing.mayContain) mayContainSet.add(a);

      if (!nutritionIsComplete(ing.nutrition)) {
        gaps.missingNutrition.push(row.name);
        allConvertible = false;
      } else {
        // Accumulate each nutrient, converting per-100ml → per-100g first.
        let rowConvertible = true;
        const contribution: Partial<Record<NutrientKey, number>> = {};
        for (const nk of NUTRIENT_KEYS) {
          const per100g = toPer100g(ing.nutrition[nk] as number, ing.basis, ing.densityGPerL);
          if (per100g === null) { rowConvertible = false; break; }
          contribution[nk] = (per100g * effectiveG) / 100;
        }
        if (!rowConvertible) {
          gaps.missingDensity.push(row.name);
          allConvertible = false;
        } else {
          for (const nk of NUTRIENT_KEYS) totals[nk] += contribution[nk] as number;
        }
      }
    }

    declaration.push({
      name: row.name,
      effectiveG,
      percent: 0,
      quid: productName ? namedInProductTitle(productName, row.name) : false,
      allergens: ing?.allergens ?? [],
    });
    totalEffectiveG += effectiveG;
  }

  // QUID % against total mixing-bowl weight; descending weight order.
  for (const d of declaration) {
    d.percent = totalEffectiveG > 0 ? (d.effectiveG / totalEffectiveG) * 100 : 0;
  }
  declaration.sort((a, b) => b.effectiveG - a.effectiveG);

  const contains = Array.from(containsSet).sort();
  const mayContain = Array.from(mayContainSet).filter((a) => !containsSet.has(a)).sort();

  const finishedWeightG =
    netWeightPerUnitG && unitsPerBatch && netWeightPerUnitG > 0 && unitsPerBatch > 0
      ? netWeightPerUnitG * unitsPerBatch
      : null;

  const nutritionComplete =
    recipe.length > 0 &&
    gaps.unmatched.length === 0 &&
    gaps.missingNutrition.length === 0 &&
    gaps.missingDensity.length === 0 &&
    allConvertible;

  let per100g: NutritionPer100g | null = null;
  let perUnit: NutritionPer100g | null = null;
  if (nutritionComplete && finishedWeightG) {
    const raw = {} as NutritionPer100g;
    for (const nk of NUTRIENT_KEYS) raw[nk] = roundNutrient(nk, (totals[nk] / finishedWeightG) * 100);
    per100g = raw;
    if (netWeightPerUnitG && netWeightPerUnitG > 0) {
      const perU = {} as NutritionPer100g;
      for (const nk of NUTRIENT_KEYS) {
        perU[nk] = roundNutrient(nk, (totals[nk] / finishedWeightG) * netWeightPerUnitG);
      }
      perUnit = perU;
    }
  }

  return { gaps, nutritionComplete, finishedWeightG, per100g, perUnit, declaration, contains, mayContain };
}

// ── FIC rounding ────────────────────────────────────────────────────────────
// EU/UK rounding guidance for the mandatory declaration. Applied at output.
// Energy: nearest whole kJ/kcal. Macros: <0.5 g → 0, ≤10 g → 0.1 g steps,
// >10 g → whole grams. Salt: <0.0125 g → 0, ≤1 g → 0.01 g steps, else 0.1 g.

function round(value: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

export function roundNutrient(key: NutrientKey, value: number): number {
  if (!isFinite(value) || value < 0) return 0;
  if (key === "energy_kj" || key === "energy_kcal") return Math.round(value);
  if (key === "salt_g") {
    if (value < 0.0125) return 0;
    return value <= 1 ? round(value, 2) : round(value, 1);
  }
  // fat, saturates, carbohydrate, sugars, fibre, protein
  if (value < 0.5) return 0;
  return value <= 10 ? round(value, 1) : Math.round(value);
}

/** Display string for a rounded value: applies the "<0.5 g" style thresholds. */
export function formatNutrient(key: NutrientKey, value: number, rawValue?: number): string {
  if (key === "energy_kj") return `${Math.round(value)} kJ`;
  if (key === "energy_kcal") return `${Math.round(value)} kcal`;
  const src = typeof rawValue === "number" ? rawValue : value;
  if (key === "salt_g") {
    if (src > 0 && src < 0.0125) return "<0.01 g";
    return `${value} g`;
  }
  if (src > 0 && src < 0.5) return "<0.5 g";
  return `${value} g`;
}

// ── Costing ───────────────────────────────────────────────────────────────
// Same recipe loop, but on GROSS weights — costing pays for prep waste, so it
// ignores prep yields (unlike nutrition). Ingredient cost = grams/1000 × £/kg;
// primary packaging (jar + closure, priced per unit) adds a per-unit cost.

export interface CostLine {
  name: string;
  grams: number;
  pricePerKg: number | null;
  cost: number | null; // batch cost for this line (null = no price)
}

export interface PackagingLine {
  name: string;
  role: "Container" | "Closure";
  pricePerUnit: number | null;
}

export interface SecondaryPackInput {
  name: string;
  unitsPerPack: number; // how many finished units fit in one pack (e.g. box of 6 → 6)
}

export interface SecondaryPackLineResult {
  name: string;
  unitsPerPack: number;
  pricePerUnit: number | null;
  perUnitCost: number | null; // pack price ÷ units per pack (null = no price)
}

export interface LabourInput {
  staff: number | null;
  hours: number | null;
  costPerHour: number | null;
}

export interface CostingInput {
  recipe: RecipeRow[];
  ingredients: Map<string, IngredientData>;
  unitsPerBatch: number | null;
  /** Primary packaging mapped on the packing_runs question (exact names). */
  packaging: { jar: string | null; closure: string | null };
  secondaryPackaging: SecondaryPackInput[];
  labour: LabourInput;
}

export interface CostingResult {
  lines: CostLine[];
  packagingLines: PackagingLine[];
  secondaryLines: SecondaryPackLineResult[];
  ingredientBatchCost: number;      // sum of priced lines
  ingredientPerUnitCost: number | null; // ÷ units per batch
  packagingPerUnitCost: number;     // jar + closure per unit
  secondaryPerUnitCost: number;     // Σ(pack price ÷ units per pack), intrinsic per unit
  labourBatchCost: number | null;   // staff × hours × £/hour
  labourPerUnitCost: number | null; // ÷ units per batch
  totalPerUnitCost: number | null;  // ingredients + primary + secondary + labour per unit
  /** Ingredient/packaging names with no price set — cost is understated until fixed. */
  missingPrices: string[];
  hasUnitsPerBatch: boolean;
}

export function computeCosting(input: CostingInput): CostingResult {
  const { recipe, ingredients, unitsPerBatch, packaging, secondaryPackaging, labour } = input;
  const missingPrices: string[] = [];

  const lines: CostLine[] = [];
  let ingredientBatchCost = 0;
  for (const row of recipe) {
    const grams = Number(row.grams) || 0;
    if (grams <= 0) continue;
    const ing = ingredients.get(normaliseName(row.name));
    const pricePerKg = ing?.pricePerKg ?? null;
    let cost: number | null = null;
    if (pricePerKg != null) {
      // Mirror the site's stock valuation: `units` items priced per unit, else per kg.
      cost = (ing?.unit === "units" ? grams : grams / 1000) * pricePerKg;
      ingredientBatchCost += cost;
    } else {
      missingPrices.push(row.name);
    }
    lines.push({ name: row.name, grams, pricePerKg, cost });
  }

  const packagingLines: PackagingLine[] = [];
  let packagingPerUnitCost = 0;
  const addPackaging = (name: string | null, role: PackagingLine["role"]) => {
    if (!name) return;
    const ing = ingredients.get(normaliseName(name));
    const pricePerUnit = ing?.pricePerKg ?? null; // per-unit price for `units` items
    packagingLines.push({ name, role, pricePerUnit });
    if (pricePerUnit != null) packagingPerUnitCost += pricePerUnit;
    else missingPrices.push(name);
  };
  addPackaging(packaging.jar, "Container");
  addPackaging(packaging.closure, "Closure");

  // Secondary packaging: per-unit cost = pack price ÷ how many units the pack
  // holds (e.g. a £0.50 box of 6 → £0.083/unit). Independent of batch size.
  const secondaryLines: SecondaryPackLineResult[] = [];
  let secondaryPerUnitCost = 0;
  for (const s of secondaryPackaging) {
    const per = Number(s.unitsPerPack) || 0;
    if (!s.name || per <= 0) continue;
    const ing = ingredients.get(normaliseName(s.name));
    const pricePerUnit = ing?.pricePerKg ?? null;
    const perUnitCost = pricePerUnit != null ? pricePerUnit / per : null;
    if (perUnitCost != null) secondaryPerUnitCost += perUnitCost;
    else missingPrices.push(s.name);
    secondaryLines.push({ name: s.name, unitsPerPack: per, pricePerUnit, perUnitCost });
  }

  const hasUnitsPerBatch = !!unitsPerBatch && unitsPerBatch > 0;
  const perUnit = (batch: number) => (hasUnitsPerBatch ? batch / (unitsPerBatch as number) : null);

  const ingredientPerUnitCost = perUnit(ingredientBatchCost);

  const labourBatchCost =
    labour.staff != null && labour.hours != null && labour.costPerHour != null
      ? labour.staff * labour.hours * labour.costPerHour
      : null;
  const labourPerUnitCost = labourBatchCost != null ? perUnit(labourBatchCost) : null;

  // Total per unit needs the batch-based components (ingredients, labour) to have
  // a per-unit basis; secondary packaging is already per unit.
  const totalPerUnitCost = hasUnitsPerBatch
    ? (ingredientPerUnitCost ?? 0) + packagingPerUnitCost + secondaryPerUnitCost + (labourPerUnitCost ?? 0)
    : null;

  return {
    lines, packagingLines, secondaryLines, ingredientBatchCost, ingredientPerUnitCost,
    packagingPerUnitCost, secondaryPerUnitCost,
    labourBatchCost, labourPerUnitCost, totalPerUnitCost, missingPrices, hasUnitsPerBatch,
  };
}

export const NUTRIENT_LABELS: Record<NutrientKey, string> = {
  energy_kj: "Energy",
  energy_kcal: "Energy",
  fat_g: "Fat",
  saturates_g: "of which saturates",
  carbohydrate_g: "Carbohydrate",
  sugars_g: "of which sugars",
  fibre_g: "Fibre",
  protein_g: "Protein",
  salt_g: "Salt",
};
