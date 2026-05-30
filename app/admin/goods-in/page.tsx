"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import type { Ingredient, IngredientLot } from "@/lib/types";
import { formatDate, todayJulianCode } from "@/lib/utils";

interface IngredientRow {
  ingredientId: string;
  julianCode: string;
  bestBefore: string;
  quantityG: string;
  litres: string;
}

function emptyRow(): IngredientRow {
  return { ingredientId: "", julianCode: todayJulianCode(), bestBefore: "", quantityG: "", litres: "" };
}

interface Supplier { id: string; name: string }

export default function GoodsInPage() {
  const { orgId } = useOrganisation();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [recentLots, setRecentLots] = useState<(IngredientLot & { ingredient: Ingredient })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [rows, setRows] = useState<IngredientRow[]>([emptyRow()]);
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState("");
  const [loggedBy, setLoggedBy] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Edit lot panel
  const [editingLot, setEditingLot]       = useState<(IngredientLot & { ingredient: Ingredient }) | null>(null);
  const [editJulianCode, setEditJulianCode] = useState("");
  const [editReceivedDate, setEditReceivedDate] = useState("");
  const [editBestBefore, setEditBestBefore] = useState("");
  const [editQuantityG, setEditQuantityG] = useState("");
  const [editSupplier, setEditSupplier]   = useState("");
  const [editSaving, setEditSaving]       = useState(false);
  const [editError, setEditError]         = useState("");

  const densityById = Object.fromEntries(
    ingredients.filter(i => i.density_g_per_l != null).map(i => [i.id, i.density_g_per_l!])
  );
  const unitById = Object.fromEntries(ingredients.map(i => [i.id, i.unit ?? "g"]));

  useEffect(() => { load(); }, []);

  async function load() {
    const [ingRes, lotRes, supRes] = await Promise.all([
      supabase.from("ingredients").select("*").order("name"),
      supabase
        .from("ingredient_lots")
        .select("*, ingredient:ingredients(name)")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("suppliers").select("id, name").order("name"),
    ]);
    if (ingRes.data) setIngredients(ingRes.data);
    if (lotRes.data) setRecentLots(lotRes.data as (IngredientLot & { ingredient: Ingredient })[]);
    if (supRes.data) setSuppliers(supRes.data as Supplier[]);
    setLoading(false);
  }

  function openEditLot(lot: IngredientLot & { ingredient: Ingredient }) {
    setEditingLot(lot);
    setEditJulianCode(lot.julian_code);
    setEditReceivedDate(lot.received_date);
    setEditBestBefore(lot.best_before_date ?? "");
    setEditQuantityG(String(lot.quantity_received_g));
    setEditSupplier(lot.supplier ?? "");
    setEditError("");
  }

  async function saveEditLot() {
    if (!editingLot) return;
    if (!editJulianCode.trim()) { setEditError("Batch code is required"); return; }
    if (!editQuantityG || Number(editQuantityG) <= 0) { setEditError("Quantity must be greater than 0"); return; }
    setEditSaving(true);
    setEditError("");

    const newQty = Number(editQuantityG);
    const diff = newQty - editingLot.quantity_received_g;
    const newRemaining = Math.max(0, editingLot.quantity_remaining_g + diff);

    const { error } = await supabase
      .from("ingredient_lots")
      .update({
        julian_code: editJulianCode.trim(),
        received_date: editReceivedDate,
        best_before_date: editBestBefore || null,
        quantity_received_g: newQty,
        quantity_remaining_g: newRemaining,
        supplier: editSupplier.trim() || null,
      })
      .eq("id", editingLot.id);

    setEditSaving(false);
    if (error) { setEditError(error.message); return; }
    setEditingLot(null);
    await load();
  }

  function updateRow(idx: number, field: keyof IngredientRow, value: string) {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, [field]: value };
      if (field === "ingredientId") {
        updated.litres = "";
        updated.quantityG = "";
      }
      if (field === "litres") {
        const density = densityById[r.ingredientId];
        if (density && value) {
          updated.quantityG = String(Math.round(parseFloat(value) * density));
        } else {
          updated.quantityG = "";
        }
      }
      return updated;
    }));
  }

  function addRow() {
    setRows(prev => [...prev, emptyRow()]);
  }

  function removeRow(idx: number) {
    if (rows.length > 1) setRows(prev => prev.filter((_, i) => i !== idx));
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!supplierId) errs.supplier = "Select a supplier";
    if (!loggedBy.trim()) errs.loggedBy = "Enter your name";
    rows.forEach((row, i) => {
      if (!row.ingredientId) errs[`name_${i}`] = "Required";
      if (!row.julianCode.trim()) errs[`batch_${i}`] = "Required";
      if (!row.quantityG || Number(row.quantityG) <= 0) errs[`qty_${i}`] = "Required";
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);

    const supplierName = suppliers.find(s => s.id === supplierId)?.name ?? null;
    const inserts = rows.map(row => {
      const qty = Number(row.quantityG);
      return {
        ingredient_id: row.ingredientId,
        julian_code: row.julianCode.trim(),
        quantity_received_g: qty,
        quantity_remaining_g: qty,
        received_date: receivedDate,
        supplier: supplierName,
        best_before_date: row.bestBefore || null,
        created_by: loggedBy.trim(),
        organisation_id: orgId,
      };
    });

    const { error } = await supabase.from("ingredient_lots").insert(inserts);
    setSaving(false);
    if (error) { alert("Failed to save — please try again."); return; }

    setSaved(true);
    setRows([emptyRow()]);
    setSupplierId("");
    setErrors({});
    await load();
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <>
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 min-h-[68px]">
          <div className="flex items-center gap-3">
            <Link href="/home" className="btn-ghost text-xs px-2">← Dashboard</Link>
            <h1 className="text-base font-semibold text-gray-900">Goods In</h1>
          </div>
          <Link href="/admin/stock" className="btn-secondary text-xs">View Stock Levels</Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 space-y-6">
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Log incoming delivery</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Shared delivery details */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Date received *</label>
                <input
                  type="date"
                  value={receivedDate}
                  onChange={e => setReceivedDate(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Supplier *</label>
                <select
                  value={supplierId}
                  onChange={e => setSupplierId(e.target.value)}
                  className={`input ${errors.supplier ? "border-red-300" : ""}`}
                >
                  <option value="">Select supplier…</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {errors.supplier && <p className="mt-1 text-xs text-red-600">{errors.supplier}</p>}
              </div>
              <div>
                <label className="label">Logged by *</label>
                <input
                  type="text"
                  value={loggedBy}
                  onChange={e => setLoggedBy(e.target.value)}
                  className={`input ${errors.loggedBy ? "border-red-300" : ""}`}
                  placeholder="e.g. The Popcorn Sheriff"
                  autoComplete="name"
                />
                {errors.loggedBy && <p className="mt-1 text-xs text-red-600">{errors.loggedBy}</p>}
              </div>
            </div>

            {/* Ingredient cards */}
            <div className="space-y-3">
              {rows.map((row, idx) => (
                <div key={idx} className="rounded-xl border border-gray-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Ingredient {idx + 1}
                    </p>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="text-xs text-gray-400 hover:text-red-500 transition"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Name */}
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 block mb-0.5">Item *</label>
                      <select
                        value={row.ingredientId}
                        onChange={e => updateRow(idx, "ingredientId", e.target.value)}
                        className={`input text-sm py-1.5 ${errors[`name_${idx}`] ? "border-red-300" : ""}`}
                      >
                        <option value="">Select item…</option>
                        <optgroup label="Ingredients">
                          {ingredients.filter(i => i.type === "ingredient").map(ing => (
                            <option key={ing.id} value={ing.id}>{ing.name}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Packaging">
                          {ingredients.filter(i => i.type === "packaging").map(ing => (
                            <option key={ing.id} value={ing.id}>{ing.name}</option>
                          ))}
                        </optgroup>
                      </select>
                      {errors[`name_${idx}`] && <p className="mt-0.5 text-xs text-red-500">{errors[`name_${idx}`]}</p>}
                    </div>

                    {/* Julian code */}
                    <div>
                      <label className="text-xs text-gray-500 block mb-0.5">
                        Julian code *
                        {row.julianCode === todayJulianCode() && (
                          <span className="ml-1.5 text-[10px] font-medium text-brown bg-brand/30 rounded-full px-1.5 py-0.5">today</span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={row.julianCode}
                        onChange={e => updateRow(idx, "julianCode", e.target.value)}
                        className={`input text-sm py-1.5 font-mono ${errors[`batch_${idx}`] ? "border-red-300" : ""}`}
                        placeholder="e.g. 26124"
                      />
                      {errors[`batch_${idx}`] && <p className="mt-0.5 text-xs text-red-500">{errors[`batch_${idx}`]}</p>}
                    </div>

                    {/* BBE */}
                    <div>
                      <label className="text-xs text-gray-500 block mb-0.5">BBE date</label>
                      <input
                        type="date"
                        value={row.bestBefore}
                        onChange={e => updateRow(idx, "bestBefore", e.target.value)}
                        className="input text-sm py-1.5"
                      />
                    </div>

                    {/* Quantity */}
                    {unitById[row.ingredientId] === "units" ? (
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 block mb-0.5">Quantity (units) *</label>
                        <input
                          type="number"
                          value={row.quantityG}
                          onChange={e => updateRow(idx, "quantityG", e.target.value)}
                          className={`input text-sm py-1.5 ${errors[`qty_${idx}`] ? "border-red-300" : ""}`}
                          placeholder="0"
                          inputMode="numeric"
                          min="0"
                        />
                        {errors[`qty_${idx}`] && <p className="mt-0.5 text-xs text-red-500">{errors[`qty_${idx}`]}</p>}
                      </div>
                    ) : densityById[row.ingredientId] ? (
                      <>
                        <div>
                          <label className="text-xs text-gray-500 block mb-0.5">Volume (L) *</label>
                          <input
                            type="number"
                            value={row.litres}
                            onChange={e => updateRow(idx, "litres", e.target.value)}
                            className={`input text-sm py-1.5 ${errors[`qty_${idx}`] ? "border-red-300" : ""}`}
                            placeholder="0.00"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                          />
                          {errors[`qty_${idx}`] && <p className="mt-0.5 text-xs text-red-500">{errors[`qty_${idx}`]}</p>}
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-0.5">Weight (g)</label>
                          <input
                            type="number"
                            value={row.quantityG}
                            readOnly
                            className="input text-sm py-1.5 bg-gray-50 text-gray-500 cursor-default"
                            placeholder="Auto-calculated"
                          />
                        </div>
                      </>
                    ) : (
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Quantity (g) *</label>
                        <input
                          type="number"
                          value={row.quantityG}
                          onChange={e => updateRow(idx, "quantityG", e.target.value)}
                          className={`input text-sm py-1.5 ${errors[`qty_${idx}`] ? "border-red-300" : ""}`}
                          placeholder="0"
                          inputMode="numeric"
                          min="0"
                        />
                        {errors[`qty_${idx}`] && <p className="mt-0.5 text-xs text-red-500">{errors[`qty_${idx}`]}</p>}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addRow}
                className="w-full rounded-xl border-2 border-dashed border-gray-200 py-2.5 text-sm text-gray-500 hover:border-brand hover:text-brown transition"
              >
                + Add another ingredient
              </button>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Saving…" : `Save ${rows.length} ingredient${rows.length !== 1 ? "s" : ""}`}
              </button>
              {saved && <span className="text-sm text-brown/70 font-medium">Saved ✓</span>}
            </div>
          </form>
        </div>

        {/* Recent entries */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Recent deliveries</h2>
          {loading ? (
            <div className="card p-4 text-center text-sm text-gray-500">Loading…</div>
          ) : recentLots.length === 0 ? (
            <div className="card p-4 text-center text-sm text-gray-500">No deliveries logged yet.</div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Ingredient</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Batch code</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Received (g)</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Remaining (g)</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">BBE</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Date in</th>
                    <th className="w-16 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentLots.map(lot => (
                    <tr key={lot.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{lot.ingredient?.name}</td>
                      <td className="px-4 py-3 font-mono text-gray-700">{lot.julian_code}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">{lot.quantity_received_g.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={lot.quantity_remaining_g === 0 ? "text-gray-400 line-through" : "text-gray-900 font-medium"}>
                          {lot.quantity_remaining_g.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{lot.best_before_date ? formatDate(lot.best_before_date) : "—"}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(lot.received_date)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openEditLot(lot)}
                          className="text-xs text-brand-dark font-medium hover:underline"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Edit lot panel */}
      {editingLot && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/30" onClick={() => setEditingLot(null)} />
          <div className="w-full max-w-sm bg-white shadow-xl flex flex-col">
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Edit Delivery</h2>
                <p className="text-xs text-gray-500 mt-0.5">{editingLot.ingredient?.name}</p>
              </div>
              <button onClick={() => setEditingLot(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <label className="label">Batch / Julian code *</label>
                <input
                  type="text"
                  className="input w-full font-mono"
                  value={editJulianCode}
                  onChange={e => setEditJulianCode(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Date received *</label>
                <input
                  type="date"
                  className="input w-full"
                  value={editReceivedDate}
                  onChange={e => setEditReceivedDate(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Quantity received (g) *</label>
                <input
                  type="number"
                  min="0"
                  className="input w-full"
                  value={editQuantityG}
                  onChange={e => setEditQuantityG(e.target.value)}
                />
                <p className="mt-1 text-xs text-gray-400">Remaining stock will be adjusted by the same difference.</p>
              </div>
              <div>
                <label className="label">Best before date</label>
                <input
                  type="date"
                  className="input w-full"
                  value={editBestBefore}
                  onChange={e => setEditBestBefore(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Supplier</label>
                <select
                  className="input w-full"
                  value={suppliers.find(s => s.name === editSupplier)?.id ?? ""}
                  onChange={e => setEditSupplier(suppliers.find(s => s.id === e.target.value)?.name ?? "")}
                >
                  <option value="">— None —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {editError && (
              <div className="mx-6 mb-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {editError}
              </div>
            )}

            <div className="border-t border-gray-200 px-6 pt-3 pb-3">
              <div className="flex gap-3">
                <button onClick={() => setEditingLot(null)} className="btn-ghost flex-1">Cancel</button>
                <button onClick={saveEditLot} disabled={editSaving} className="btn-primary flex-1">
                  {editSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
