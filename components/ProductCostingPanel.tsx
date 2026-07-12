"use client";

import { useMemo } from "react";
import { computeCosting, normaliseName, type CostingResult } from "@/lib/nutrition/recipe-calc";
import { useProductNutrition } from "@/components/useProductNutrition";

const gbp = (n: number) => `£${n.toFixed(2)}`;

/**
 * Costing tab — standard recipe cost from the production recipe on GROSS weights
 * (costing pays for prep waste, so it ignores prep yields) × £/kg, plus primary
 * packaging (jar + closure) per unit. Read-only; prices come from Raw Materials
 * and units-per-batch from the Recipe & yields tab.
 */
export default function ProductCostingPanel({ productName }: { productName: string }) {
  const data = useProductNutrition(productName);
  const { recipe, ingredients, packaging, settings } = data;

  const result: CostingResult = useMemo(() => computeCosting({
    recipe,
    ingredients,
    unitsPerBatch: settings.unitsPerBatch ? parseFloat(settings.unitsPerBatch) : null,
    packaging,
  }), [recipe, ingredients, packaging, settings.unitsPerBatch]);

  if (data.loading) {
    return <div className="card p-8 text-center text-sm text-gray-400">Loading…</div>;
  }
  if (!data.recipeFound) {
    return (
      <div className="card p-8 text-center text-sm text-gray-400">
        No production record found for this product yet — build one (with an ingredients table) to cost it.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cost per unit summary */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Standard cost per unit</h2>
          {result.totalPerUnitCost != null && (
            <span className="text-sm font-bold text-gray-900 tabular-nums">{gbp(result.totalPerUnitCost)}</span>
          )}
        </div>
        <div className="p-4 space-y-3">
          {result.missingPrices.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs text-amber-800">
                No price set for: {result.missingPrices.join(", ")}. Add a price in Raw Materials — the cost below excludes these.
              </p>
            </div>
          )}
          {!result.hasUnitsPerBatch && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs text-amber-800">
                Set units per batch on the Recipe &amp; yields tab to get a cost per unit.
              </p>
            </div>
          )}

          <dl className="text-sm max-w-sm space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-gray-600">Ingredients per unit</dt>
              <dd className="tabular-nums text-gray-900">{result.ingredientPerUnitCost != null ? gbp(result.ingredientPerUnitCost) : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Primary packaging per unit</dt>
              <dd className="tabular-nums text-gray-900">{result.packagingLines.length ? gbp(result.packagingPerUnitCost) : "—"}</dd>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold">
              <dt className="text-gray-800">Total per unit</dt>
              <dd className="tabular-nums text-gray-900">{result.totalPerUnitCost != null ? gbp(result.totalPerUnitCost) : "—"}</dd>
            </div>
          </dl>
          {result.ingredientBatchCost > 0 && (
            <p className="text-xs text-gray-500">
              Ingredient cost per batch: <strong>{gbp(result.ingredientBatchCost)}</strong>
              {result.hasUnitsPerBatch && ` over ${parseFloat(settings.unitsPerBatch).toLocaleString()} units`}.
            </p>
          )}
        </div>
      </div>

      {/* Ingredient cost breakdown */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Ingredient costs (gross recipe weights)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50/50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ingredient</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipe (g)</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">£/kg</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Batch cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.lines.map(l => {
                const unmatched = !ingredients.get(normaliseName(l.name));
                return (
                  <tr key={l.name} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-900">
                      {l.name}
                      {unmatched && <span className="ml-2 text-[10px] font-semibold text-red-600">no raw material</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{l.grams.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{l.pricePerKg != null ? gbp(l.pricePerKg) : <span className="text-amber-600">—</span>}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">{l.cost != null ? gbp(l.cost) : "—"}</td>
                  </tr>
                );
              })}
              {result.packagingLines.map(p => (
                <tr key={`pkg-${p.name}`} className="hover:bg-gray-50 transition-colors bg-gray-50/30">
                  <td className="px-4 py-3 text-gray-900">{p.name} <span className="text-[10px] text-gray-400">{p.role} · per unit</span></td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-400">—</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{p.pricePerUnit != null ? gbp(p.pricePerUnit) : <span className="text-amber-600">—</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-400">per unit</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-gray-100">
          <p className="text-[11px] text-gray-400">
            Costing uses gross recipe weights (you pay for prep waste). Prices come from Raw Materials; packaging is mapped on the production checklist.
          </p>
        </div>
      </div>
    </div>
  );
}
