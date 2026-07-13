"use client";

import { useState, useEffect, useMemo } from "react";
import { computeCosting, normaliseName, type CostingResult } from "@/lib/nutrition/recipe-calc";
import { useProductNutrition, saveProductSettings, type SecondaryPackLine } from "@/components/useProductNutrition";

const gbp = (n: number) => `£${n.toFixed(2)}`;

/**
 * Costing tab — full standard cost per unit: ingredients (gross recipe weights ×
 * £/kg — costing pays for prep waste, so it ignores prep yields) + primary
 * packaging + secondary packaging + labour. Ingredient prices come from Raw
 * Materials and units-per-batch from the Recipe & yields tab; secondary
 * packaging and labour are edited and saved here.
 */
export default function ProductCostingPanel({ productName }: { productName: string }) {
  const data = useProductNutrition(productName);
  const { recipe, ingredients, packaging, secondaryPackagingOptions, settings } = data;

  // Editable costing inputs, seeded from saved settings on each load.
  const [secondary, setSecondary] = useState<SecondaryPackLine[]>(settings.secondaryPackaging);
  const [labourStaff, setLabourStaff] = useState(settings.labourStaff);
  const [labourHours, setLabourHours] = useState(settings.labourHours);
  const [labourRate, setLabourRate] = useState(settings.labourCostPerHour);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSecondary(settings.secondaryPackaging);
    setLabourStaff(settings.labourStaff);
    setLabourHours(settings.labourHours);
    setLabourRate(settings.labourCostPerHour);
  }, [settings]);

  const result: CostingResult = useMemo(() => computeCosting({
    recipe,
    ingredients,
    unitsPerBatch: settings.unitsPerBatch ? parseFloat(settings.unitsPerBatch) : null,
    packaging,
    secondaryPackaging: secondary.map(s => ({ name: s.name, qtyPerBatch: parseFloat(s.qtyPerBatch) || 0 })),
    labour: {
      staff: labourStaff ? parseFloat(labourStaff) : null,
      hours: labourHours ? parseFloat(labourHours) : null,
      costPerHour: labourRate ? parseFloat(labourRate) : null,
    },
  }), [recipe, ingredients, packaging, settings.unitsPerBatch, secondary, labourStaff, labourHours, labourRate]);

  if (data.loading) return <div className="card p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (!data.recipeFound) {
    return (
      <div className="card p-8 text-center text-sm text-gray-400">
        No production record found for this product yet — build one (with an ingredients table) to cost it.
      </div>
    );
  }

  async function save() {
    if (!data.orgId) return;
    setSaving(true); setSaved(false); setError("");
    const secondary_packaging = secondary
      .filter(s => s.name && (parseFloat(s.qtyPerBatch) || 0) > 0)
      .map(s => ({ name: s.name, qty_per_batch: parseFloat(s.qtyPerBatch) }));
    const res = await saveProductSettings(data.orgId, productName, {
      secondary_packaging,
      labour_staff: labourStaff ? parseFloat(labourStaff) : null,
      labour_hours: labourHours ? parseFloat(labourHours) : null,
      labour_cost_per_hour: labourRate ? parseFloat(labourRate) : null,
    });
    if (res.error) setError("Couldn't save — try again.");
    else { setSaved(true); await data.reload(); setTimeout(() => setSaved(false), 2500); }
    setSaving(false);
  }

  const addSecondary = () => setSecondary(s => [...s, { name: "", qtyPerBatch: "" }]);
  const setSecondaryRow = (i: number, patch: Partial<SecondaryPackLine>) =>
    setSecondary(s => s.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const removeSecondary = (i: number) => setSecondary(s => s.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-6">
      {/* Full cost per unit summary */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Full cost per unit</h2>
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
              <p className="text-xs text-amber-800">Set units per batch on the Recipe &amp; yields tab to get a cost per unit.</p>
            </div>
          )}

          <dl className="text-sm max-w-sm space-y-1.5">
            <Line label="Ingredients per unit" value={result.ingredientPerUnitCost} />
            <Line label="Primary packaging per unit" value={result.packagingLines.length ? result.packagingPerUnitCost : null} />
            <Line label="Secondary packaging per unit" value={result.secondaryLines.length ? result.secondaryPerUnitCost : null} />
            <Line label="Labour per unit" value={result.labourPerUnitCost} />
            <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold">
              <dt className="text-gray-800">Total per unit</dt>
              <dd className="tabular-nums text-gray-900">{result.totalPerUnitCost != null ? gbp(result.totalPerUnitCost) : "—"}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Ingredient + primary packaging breakdown */}
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
                  <td className="px-4 py-3 text-gray-900">{p.name} <span className="text-[10px] text-gray-400">{p.role} · primary · per unit</span></td>
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
            Costing uses gross recipe weights (you pay for prep waste). Prices come from Raw Materials; primary packaging is mapped on the production checklist.
          </p>
        </div>
      </div>

      {/* Secondary packaging */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Secondary packaging</h2>
          <button type="button" onClick={addSecondary} className="text-xs font-medium text-brown hover:underline">+ Add item</button>
        </div>
        <div className="p-4 space-y-3">
          {secondary.length === 0 ? (
            <p className="text-sm text-gray-400">No secondary packaging added — e.g. outer boxes, cases, leaflets.</p>
          ) : (
            <div className="space-y-2">
              {secondary.map((row, i) => {
                const priced = row.name ? ingredients.get(normaliseName(row.name))?.pricePerKg : null;
                const qty = parseFloat(row.qtyPerBatch) || 0;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      className="input text-base flex-1"
                      value={row.name}
                      onChange={e => setSecondaryRow(i, { name: e.target.value })}
                    >
                      <option value="">— Select item —</option>
                      {secondaryPackagingOptions.map(o => <option key={o} value={o}>{o}</option>)}
                      {row.name && !secondaryPackagingOptions.includes(row.name) && <option value={row.name}>{row.name}</option>}
                    </select>
                    <input
                      type="number" step="1" min="0" inputMode="decimal"
                      className="input w-28 text-base text-right"
                      value={row.qtyPerBatch}
                      onChange={e => setSecondaryRow(i, { qtyPerBatch: e.target.value })}
                      placeholder="qty / batch"
                    />
                    <span className="w-20 text-right text-sm tabular-nums text-gray-600">
                      {priced != null ? gbp(priced * qty) : "—"}
                    </span>
                    <button type="button" onClick={() => removeSecondary(i)} className="text-gray-400 hover:text-red-500 px-1" aria-label="Remove">✕</button>
                  </div>
                );
              })}
              <p className="text-[11px] text-gray-400">Quantity per standard batch — e.g. 4 outer boxes for a batch of 24 units. Divided across units per batch.</p>
            </div>
          )}
        </div>
      </div>

      {/* Labour */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Labour</h2>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Staff</label>
              <input type="number" step="1" min="0" inputMode="decimal" className="input w-full text-base"
                value={labourStaff} onChange={e => setLabourStaff(e.target.value)} placeholder="e.g. 2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hours</label>
              <input type="number" step="0.25" min="0" inputMode="decimal" className="input w-full text-base"
                value={labourHours} onChange={e => setLabourHours(e.target.value)} placeholder="e.g. 4" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">£ / hour</label>
              <input type="number" step="0.01" min="0" inputMode="decimal" className="input w-full text-base"
                value={labourRate} onChange={e => setLabourRate(e.target.value)} placeholder="e.g. 12.50" />
            </div>
          </div>
          {result.labourBatchCost != null && (
            <p className="text-xs text-gray-500">
              Labour per batch: <strong>{gbp(result.labourBatchCost)}</strong>
              {result.hasUnitsPerBatch && result.labourPerUnitCost != null && ` · ${gbp(result.labourPerUnitCost)} per unit`}.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm disabled:opacity-60">
          {saving ? "Saving…" : "Save costing"}
        </button>
        {saved && <span className="text-xs text-green-600 font-medium">Saved</span>}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-600">{label}</dt>
      <dd className="tabular-nums text-gray-900">{value != null ? `£${value.toFixed(2)}` : "—"}</dd>
    </div>
  );
}
