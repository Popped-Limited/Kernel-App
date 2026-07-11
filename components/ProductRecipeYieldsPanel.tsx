"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { normaliseName } from "@/lib/nutrition/recipe-calc";
import { useProductNutrition, type LoadedSettings } from "@/components/useProductNutrition";

/**
 * Recipe & yields tab — the calc INPUTS: net weight per unit, units per batch,
 * and a prep-yield % per recipe ingredient (defaults to 100%). Saved to
 * product_nutrition_settings; the Declarations tab reads them back.
 */
export default function ProductRecipeYieldsPanel({ productName }: { productName: string }) {
  const data = useProductNutrition(productName);
  const { recipe, ingredients, settings: saved, orgId } = data;

  const [form, setForm] = useState<LoadedSettings>(saved);
  const [saving, setSaving] = useState(false);
  const [saved_, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Seed the editable form whenever a fresh load lands.
  useEffect(() => { setForm(saved); }, [saved]);

  if (data.loading) {
    return <div className="card p-8 text-center text-sm text-gray-400">Loading recipe…</div>;
  }
  if (!data.recipeFound) {
    return (
      <div className="card p-8 text-center text-sm text-gray-400">
        No production record found for this product yet — build one (with an ingredients table) to set up the label.
      </div>
    );
  }

  const yieldFor = (name: string) => form.prepYields[normaliseName(name)] ?? "";
  const setYield = (name: string, v: string) =>
    setForm((s) => ({ ...s, prepYields: { ...s.prepYields, [normaliseName(name)]: v } }));

  const finishedWeight =
    form.netWeight && form.unitsPerBatch ? parseFloat(form.netWeight) * parseFloat(form.unitsPerBatch) : null;

  async function save() {
    if (!orgId) return;
    setSaving(true);
    setSaved(false);
    setError("");

    const prep_yields: Record<string, number> = {};
    for (const row of recipe) {
      const raw = form.prepYields[normaliseName(row.name)];
      const pct = raw != null ? parseFloat(raw) : NaN;
      if (!isNaN(pct) && pct !== 100) prep_yields[row.name] = pct / 100; // store by recipe name; omit default 100%
    }

    const { data: { user } } = await supabase.auth.getUser();
    const updatedBy = (user?.user_metadata?.full_name || user?.email || "").toString();

    const payload = {
      organisation_id: orgId,
      product_name: productName,
      net_weight_per_unit_g: form.netWeight ? parseFloat(form.netWeight) : null,
      units_per_batch: form.unitsPerBatch ? parseFloat(form.unitsPerBatch) : null,
      prep_yields,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    };

    // No usable upsert target (unique index is on lower(product_name)), so
    // update the known row or insert a fresh one.
    const res = form.id
      ? await supabase.from("product_nutrition_settings").update(payload).eq("id", form.id)
      : await supabase.from("product_nutrition_settings").insert(payload).select("id").single();

    if (res.error) {
      setError("Couldn't save — try again.");
    } else {
      setSaved(true);
      await data.reload();
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  }

  return (
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
              value={form.netWeight}
              onChange={(e) => setForm((s) => ({ ...s, netWeight: e.target.value }))}
              placeholder="e.g. 160"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Units per batch</label>
            <input
              type="number" step="1" min="0" inputMode="decimal"
              className="input w-full text-base"
              value={form.unitsPerBatch}
              onChange={(e) => setForm((s) => ({ ...s, unitsPerBatch: e.target.value }))}
              placeholder="e.g. 20"
            />
          </div>
        </div>
        {finishedWeight != null && !isNaN(finishedWeight) && (
          <p className="text-xs text-gray-500">
            Finished batch weight: <strong>{finishedWeight.toLocaleString()} g</strong> (units × net weight)
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
        <p className="text-[11px] text-gray-400">
          Prep yield = net weight into the pot ÷ gross weight in the recipe. Leave at 100% for ingredients that lose nothing in prep.
        </p>

        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
          {saved_ && <span className="text-xs text-green-600 font-medium">Saved</span>}
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      </div>
    </div>
  );
}
