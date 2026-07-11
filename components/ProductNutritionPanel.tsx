"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { fetchAll } from "@/lib/fetchAll";
import { useOrganisation } from "@/contexts/OrganisationContext";
import type { NutritionPer100g } from "@/lib/types";
import {
  computeNutrition, normaliseName, formatNutrient,
  type RecipeRow, type IngredientData, type CalcResult,
} from "@/lib/nutrition/recipe-calc";

/** Parse the production checklist recipe ("Name|grams") into rows. */
function parseRecipe(options: string[] | null): RecipeRow[] {
  return (options ?? [])
    .map((o) => {
      const [name, grams] = String(o).split("|");
      return { name: (name ?? "").trim(), grams: Number(grams) || 0 };
    })
    .filter((r) => r.name);
}

interface Settings {
  id: string | null;
  netWeight: string;
  unitsPerBatch: string;
  prepYields: Record<string, string>; // normalised name → percent string
}

const EMPTY: Settings = { id: null, netWeight: "", unitsPerBatch: "", prepYields: {} };

export default function ProductNutritionPanel({ productName }: { productName: string }) {
  const { orgId } = useOrganisation();

  const [loading, setLoading] = useState(true);
  const [recipe, setRecipe] = useState<RecipeRow[]>([]);
  const [recipeFound, setRecipeFound] = useState(false);
  const [ingredients, setIngredients] = useState<Map<string, IngredientData>>(new Map());
  const [settings, setSettings] = useState<Settings>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError("");
    try {
      // Recipe: the product's Production checklist ingredient_table definition.
      const { data: checklists } = await supabase
        .from("checklists")
        .select("name, questions(type, options)")
        .eq("organisation_id", orgId)
        .eq("category", "Production");

      const target = normaliseName(productName);
      let rows: RecipeRow[] = [];
      let found = false;
      for (const cl of (checklists ?? []) as { name: string; questions: { type: string; options: string[] | null }[] }[]) {
        const clProduct = normaliseName(cl.name.replace(/\s*[—–-]+\s*Production Record\s*$/i, ""));
        if (clProduct !== target) continue;
        found = true;
        const q = (cl.questions ?? []).find((x) => x.type === "ingredient_table");
        if (q) rows = parseRecipe(q.options);
        break;
      }
      setRecipe(rows);
      setRecipeFound(found);

      // Raw materials, keyed by exact (normalised) name.
      const ings = await fetchAll<{
        name: string;
        nutrition_per_100g: NutritionPer100g | null;
        nutrition_basis: "per_100g" | "per_100ml" | null;
        density_g_per_l: number | null;
        allergens: string[] | null;
        may_contain_allergens: string[] | null;
      }>((from, to) => supabase
        .from("ingredients")
        .select("name, nutrition_per_100g, nutrition_basis, density_g_per_l, allergens, may_contain_allergens")
        .eq("organisation_id", orgId)
        .order("name")
        .range(from, to));

      const map = new Map<string, IngredientData>();
      for (const i of ings) {
        map.set(normaliseName(i.name), {
          nutrition: i.nutrition_per_100g,
          basis: i.nutrition_basis ?? "per_100g",
          densityGPerL: i.density_g_per_l,
          allergens: i.allergens ?? [],
          mayContain: i.may_contain_allergens ?? [],
        });
      }
      setIngredients(map);

      // Saved settings for this product.
      const esc = productName.replace(/([%_\\])/g, "\\$1");
      const { data: ps } = await supabase
        .from("product_nutrition_settings")
        .select("id, net_weight_per_unit_g, units_per_batch, prep_yields")
        .eq("organisation_id", orgId)
        .ilike("product_name", esc)
        .maybeSingle();

      if (ps) {
        const yields: Record<string, string> = {};
        for (const [k, v] of Object.entries((ps.prep_yields ?? {}) as Record<string, number>)) {
          yields[normaliseName(k)] = String(Math.round((Number(v) || 1) * 100));
        }
        setSettings({
          id: ps.id,
          netWeight: ps.net_weight_per_unit_g != null ? String(ps.net_weight_per_unit_g) : "",
          unitsPerBatch: ps.units_per_batch != null ? String(ps.units_per_batch) : "",
          prepYields: yields,
        });
      } else {
        setSettings(EMPTY);
      }
    } catch {
      setError("Couldn't load the recipe data.");
    } finally {
      setLoading(false);
    }
  }, [orgId, productName]);

  useEffect(() => { load(); }, [load]);

  // Live calculation from the current inputs.
  const result: CalcResult = useMemo(() => {
    const prepMap = new Map<string, number>();
    for (const [k, v] of Object.entries(settings.prepYields)) {
      const pct = parseFloat(v);
      if (!isNaN(pct)) prepMap.set(k, pct / 100);
    }
    return computeNutrition({
      recipe,
      ingredients,
      prepYields: prepMap,
      netWeightPerUnitG: settings.netWeight ? parseFloat(settings.netWeight) : null,
      unitsPerBatch: settings.unitsPerBatch ? parseFloat(settings.unitsPerBatch) : null,
    });
  }, [recipe, ingredients, settings]);

  async function save() {
    if (!orgId) return;
    setSaving(true);
    setSaved(false);
    setError("");

    const prep_yields: Record<string, number> = {};
    for (const row of recipe) {
      const key = normaliseName(row.name);
      const raw = settings.prepYields[key];
      const pct = raw != null ? parseFloat(raw) : NaN;
      if (!isNaN(pct) && pct !== 100) prep_yields[row.name] = pct / 100; // store by recipe name; omit default 100%
    }

    const { data: { user } } = await supabase.auth.getUser();
    const updatedBy = (user?.user_metadata?.full_name || user?.email || "").toString();

    const payload = {
      organisation_id: orgId,
      product_name: productName,
      net_weight_per_unit_g: settings.netWeight ? parseFloat(settings.netWeight) : null,
      units_per_batch: settings.unitsPerBatch ? parseFloat(settings.unitsPerBatch) : null,
      prep_yields,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    };

    // No usable upsert target (unique index is on lower(product_name)), so
    // update the known row or insert a fresh one.
    const res = settings.id
      ? await supabase.from("product_nutrition_settings").update(payload).eq("id", settings.id)
      : await supabase.from("product_nutrition_settings").insert(payload).select("id").single();

    if (res.error) {
      setError("Couldn't save — try again.");
    } else {
      if (!settings.id && "data" in res && res.data) setSettings((s) => ({ ...s, id: res.data.id }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  }

  if (loading) {
    return <div className="card p-8 text-center text-sm text-gray-400">Loading recipe…</div>;
  }

  if (!recipeFound) {
    return (
      <div className="card p-8 text-center text-sm text-gray-400">
        No production record found for this product yet — build one (with an ingredients table) to calculate the label.
      </div>
    );
  }

  const yieldFor = (name: string) => settings.prepYields[normaliseName(name)] ?? "";
  const setYield = (name: string, v: string) =>
    setSettings((s) => ({ ...s, prepYields: { ...s.prepYields, [normaliseName(name)]: v } }));

  return (
    <div className="space-y-6">
      {/* ── Recipe & yields ─────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Recipe &amp; yields</h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Net weight per unit (g)</label>
              <input
                type="number" step="1" min="0" inputMode="decimal"
                className="input w-full text-base"
                value={settings.netWeight}
                onChange={(e) => setSettings((s) => ({ ...s, netWeight: e.target.value }))}
                placeholder="e.g. 160"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Units per batch</label>
              <input
                type="number" step="1" min="0" inputMode="decimal"
                className="input w-full text-base"
                value={settings.unitsPerBatch}
                onChange={(e) => setSettings((s) => ({ ...s, unitsPerBatch: e.target.value }))}
                placeholder="e.g. 20"
              />
            </div>
          </div>
          {result.finishedWeightG != null && (
            <p className="text-xs text-gray-500">
              Finished batch weight: <strong>{result.finishedWeightG.toLocaleString()} g</strong> (units × net weight)
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ingredient</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipe (g)</th>
                  <th className="text-right py-2 pl-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prep yield %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recipe.map((row) => {
                  const ing = ingredients.get(normaliseName(row.name));
                  const complete = ing && ing.nutrition;
                  return (
                    <tr key={row.name}>
                      <td className="py-2 pr-3 text-gray-900">
                        {row.name}
                        {!ing && <span className="ml-2 text-[10px] font-semibold text-red-600">no raw material</span>}
                        {ing && !complete && <span className="ml-2 text-[10px] font-semibold text-amber-600">no nutrition</span>}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-700">{row.grams.toLocaleString()}</td>
                      <td className="py-2 pl-3 text-right">
                        <input
                          type="number" step="1" min="0" max="100" inputMode="decimal"
                          className="input w-20 text-base text-right"
                          value={yieldFor(row.name)}
                          onChange={(e) => setYield(row.name, e.target.value)}
                          placeholder="100"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm disabled:opacity-60">
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && <span className="text-xs text-green-600 font-medium">Saved</span>}
            {error && <span className="text-xs text-red-500">{error}</span>}
          </div>
        </div>
      </div>

      {/* ── Calculated label parts ──────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Calculated label parts</h2>
        </div>
        <div className="p-4 space-y-5">
          <Gaps result={result} hasFinishedWeight={result.finishedWeightG != null} />

          {/* Nutrition table */}
          {result.per100g ? (
            <NutritionTable per100g={result.per100g} perUnit={result.perUnit} netWeight={settings.netWeight} />
          ) : (
            <p className="text-sm text-gray-400">
              Nutrition declaration appears here once every ingredient has complete data and the net weight &amp; units per batch are set.
            </p>
          )}

          {/* Ingredient declaration */}
          {result.declaration.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ingredient declaration</p>
              <p className="text-sm text-gray-800 leading-relaxed">
                <strong>INGREDIENTS:</strong>{" "}
                {result.declaration.map((d, i) => (
                  <span key={d.name}>
                    <span className={d.allergens.length ? "font-bold" : ""}>{d.name}</span>
                    {" "}({d.percent.toFixed(d.percent < 10 ? 1 : 0)}%){i < result.declaration.length - 1 ? ", " : "."}
                  </span>
                ))}
              </p>
              <p className="mt-1 text-[11px] text-gray-400">
                Descending weight order (at mixing); allergen-bearing ingredients shown in bold. QUID % is each ingredient ÷ total mix.
              </p>
            </div>
          )}

          {/* Allergen summary */}
          {(result.contains.length > 0 || result.mayContain.length > 0) && (
            <div className="text-sm space-y-1">
              {result.contains.length > 0 && (
                <p className="text-gray-800"><strong>Contains:</strong> {result.contains.join(", ")}.</p>
              )}
              {result.mayContain.length > 0 && (
                <p className="text-gray-600"><strong>May contain:</strong> {result.mayContain.join(", ")}.</p>
              )}
            </div>
          )}

          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            Calculated from your recipe and raw-material data — figures are estimates for guidance, not a legal declaration. Verify before print.
          </p>
        </div>
      </div>
    </div>
  );
}

function Gaps({ result, hasFinishedWeight }: { result: CalcResult; hasFinishedWeight: boolean }) {
  const { gaps } = result;
  const items: string[] = [];
  if (gaps.unmatched.length) items.push(`No raw material matches: ${gaps.unmatched.join(", ")}. Add them in Raw Materials (exact name).`);
  if (gaps.missingNutrition.length) items.push(`Missing nutrition data: ${gaps.missingNutrition.join(", ")}. Add per-100g values in Raw Materials.`);
  if (gaps.missingDensity.length) items.push(`Per-100ml nutrition but no density: ${gaps.missingDensity.join(", ")}. Set the density in Raw Materials.`);
  if (result.nutritionComplete && !hasFinishedWeight) items.push("Set the net weight per unit and units per batch to calculate per-100g values.");
  if (!items.length) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
      {items.map((t, i) => <p key={i} className="text-xs text-amber-800">{t}</p>)}
    </div>
  );
}

function NutritionTable({ per100g, perUnit, netWeight }: {
  per100g: NutritionPer100g; perUnit: NutritionPer100g | null; netWeight: string;
}) {
  const showPerUnit = perUnit != null && netWeight;
  const Row = ({ label, k, indent }: { label: string; k: keyof NutritionPer100g; indent?: boolean }) => (
    <tr className="border-b border-gray-100 last:border-0">
      <td className={`py-1.5 text-gray-800 ${indent ? "pl-5 text-gray-500" : "font-medium"}`}>{label}</td>
      <td className="py-1.5 text-right tabular-nums text-gray-900">{formatNutrient(k as never, per100g[k] as number)}</td>
      {showPerUnit && <td className="py-1.5 text-right tabular-nums text-gray-900">{formatNutrient(k as never, perUnit![k] as number)}</td>}
    </tr>
  );
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nutrition</p>
      <table className="w-full text-sm max-w-md">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-1.5 text-xs font-semibold text-gray-500">Typical values</th>
            <th className="text-right py-1.5 text-xs font-semibold text-gray-500">Per 100g</th>
            {showPerUnit && <th className="text-right py-1.5 text-xs font-semibold text-gray-500">Per unit ({netWeight}g)</th>}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-100">
            <td className="py-1.5 font-medium text-gray-800">Energy</td>
            <td className="py-1.5 text-right tabular-nums text-gray-900">
              {formatNutrient("energy_kj", per100g.energy_kj as number)} / {formatNutrient("energy_kcal", per100g.energy_kcal as number)}
            </td>
            {showPerUnit && (
              <td className="py-1.5 text-right tabular-nums text-gray-900">
                {formatNutrient("energy_kj", perUnit!.energy_kj as number)} / {formatNutrient("energy_kcal", perUnit!.energy_kcal as number)}
              </td>
            )}
          </tr>
          <Row label="Fat" k="fat_g" />
          <Row label="of which saturates" k="saturates_g" indent />
          <Row label="Carbohydrate" k="carbohydrate_g" />
          <Row label="of which sugars" k="sugars_g" indent />
          <Row label="Fibre" k="fibre_g" />
          <Row label="Protein" k="protein_g" />
          <Row label="Salt" k="salt_g" />
        </tbody>
      </table>
    </div>
  );
}
