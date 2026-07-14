"use client";

import { useMemo } from "react";
import type { NutritionPer100g } from "@/lib/types";
import { computeNutrition, normaliseName, formatNutrient, type CalcResult } from "@/lib/nutrition/recipe-calc";
import { useProductNutrition } from "@/components/useProductNutrition";

/**
 * Declarations tab — the calculated label parts (read-only). Inputs are edited
 * on the Recipe & yields tab; this reads the saved settings and renders the
 * nutrition table, ingredient declaration, QUID % and allergen summary.
 */
export default function ProductDeclarationsPanel({ productName }: { productName: string }) {
  const data = useProductNutrition(productName);
  const { recipe, ingredients, settings } = data;

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
      productName,
    });
  }, [recipe, ingredients, settings, productName]);

  if (data.loading) {
    return <div className="card p-8 text-center text-sm text-gray-400">Loading…</div>;
  }
  if (!data.recipeFound) {
    return (
      <div className="card p-8 text-center text-sm text-gray-400">
        No production record found for this product yet — build one (with an ingredients table) to calculate the declaration.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">Declarations</h2>
      </div>
      <div className="p-4 space-y-5">
        <Gaps result={result} hasFinishedWeight={result.finishedWeightG != null} />

        {result.per100g ? (
          <NutritionTable per100g={result.per100g} perUnit={result.perUnit} netWeight={settings.netWeight} />
        ) : (
          <p className="text-sm text-gray-400">
            Nutrition declaration appears once every ingredient has complete data and the net weight &amp; units per batch are set on the Recipe &amp; yields tab.
          </p>
        )}

        {result.declaration.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ingredient declaration</p>
            <p className="text-sm text-gray-800 leading-relaxed">
              <strong>INGREDIENTS:</strong>{" "}
              {result.declaration.map((d, i) => (
                <span key={d.name}>
                  <span className={d.allergens.length ? "font-bold" : ""}>{d.name}</span>
                  {d.quid && <> ({d.percent.toFixed(d.percent < 10 ? 1 : 0)}%)</>}
                  {i < result.declaration.length - 1 ? ", " : "."}
                </span>
              ))}
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              Descending weight order (at mixing); allergen-bearing ingredients shown in bold. QUID % appears only for ingredients named in the product title.
            </p>
          </div>
        )}

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
  );
}

function Gaps({ result, hasFinishedWeight }: { result: CalcResult; hasFinishedWeight: boolean }) {
  const { gaps } = result;
  const items: string[] = [];
  if (gaps.unmatched.length) items.push(`No raw material matches: ${gaps.unmatched.join(", ")}. Add them in Raw Materials (exact name).`);
  if (gaps.missingNutrition.length) items.push(`Missing nutrition data: ${gaps.missingNutrition.join(", ")}. Add per-100g values in Raw Materials.`);
  if (gaps.missingDensity.length) items.push(`Per-100ml nutrition but no density: ${gaps.missingDensity.join(", ")}. Set the density in Raw Materials.`);
  if (result.nutritionComplete && !hasFinishedWeight) items.push("Set the net weight per unit and units per batch on the Recipe & yields tab to calculate per-100g values.");
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
