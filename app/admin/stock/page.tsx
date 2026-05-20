"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import type { Ingredient, IngredientLot } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import DocUploader from "@/components/DocUploader";

interface Supplier { id: string; name: string }
type ItemType = "ingredient" | "packaging" | "supplies";
type IngredientWithLots = Ingredient & { lots: IngredientLot[]; supplier?: Supplier };

const TABS: { key: ItemType; label: string; icon: string }[] = [
  { key: "ingredient", label: "Ingredients",  icon: "🌽" },
  { key: "packaging",  label: "Packaging",    icon: "📦" },
  { key: "supplies",   label: "Supplies",     icon: "🧴" },
];

function fmtQty(qty: number, unit: "g" | "units") {
  return unit === "units" ? `${qty} units` : `${(qty / 1000).toFixed(2)} kg`;
}

const ALLERGENS = [
  "Celery", "Gluten", "Crustaceans", "Eggs", "Fish", "Lupin",
  "Milk", "Molluscs", "Mustard", "Tree nuts", "Peanuts", "Sesame",
  "Soya", "Sulphites",
];

const EMPTY_ITEM: IngredientWithLots = {
  id: "", name: "", type: "ingredient", unit: "g",
  price_per_kg: null, supplier_id: null, density_g_per_l: null,
  allergens: [],
  created_at: "", lots: [],
};

export default function RawMaterialsPage() {
  const { orgId } = useOrganisation();
  const [items, setItems]           = useState<IngredientWithLots[]>([]);
  const [suppliers, setSuppliers]   = useState<Supplier[]>([]);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState<ItemType>("ingredient");
  const [expanded, setExpanded]     = useState<Record<string, boolean>>({});

  // Reconcile panel
  const [reconLot, setReconLot]         = useState<{ lot: IngredientLot; ing: IngredientWithLots } | null>(null);
  const [reconActual, setReconActual]   = useState("");
  const [reconReason, setReconReason]   = useState("wastage");
  const [reconNotes, setReconNotes]     = useState("");
  const [reconSaving, setReconSaving]   = useState(false);
  const [reconError, setReconError]     = useState("");

  // Edit / create panel
  const [editing, setEditing]           = useState<IngredientWithLots | null>(null);
  const [editName, setEditName]         = useState("");
  const [editType, setEditType]         = useState<ItemType>("ingredient");
  const [editUnit, setEditUnit]         = useState<"g" | "units">("g");
  const [editPrice, setEditPrice]       = useState("");
  const [editSupplier, setEditSupplier] = useState("");
  const [editDensity, setEditDensity]     = useState("");
  const [editAllergens, setEditAllergens] = useState<string[]>([]);
  const [saving, setSaving]               = useState(false);
  const [saveError, setSaveError]       = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const isNew = editing?.id === "";

  useEffect(() => { load(); }, []);

  async function load() {
    const [lotsRes, ingsRes, supRes] = await Promise.all([
      supabase.from("ingredient_lots").select("*, ingredient:ingredients(*)").order("julian_code"),
      supabase.from("ingredients").select("*").order("name"),
      supabase.from("suppliers").select("id, name").order("name"),
    ]);

    const sups = (supRes.data ?? []) as Supplier[];
    setSuppliers(sups);

    if (ingsRes.data && lotsRes.data) {
      const supById = Object.fromEntries(sups.map(s => [s.id, s]));
      const lotsByIng: Record<string, IngredientLot[]> = {};
      for (const lot of (lotsRes.data as (IngredientLot & { ingredient: Ingredient })[]))
        (lotsByIng[lot.ingredient_id] ??= []).push(lot);

      setItems(
        (ingsRes.data as Ingredient[]).map(ing => ({
          ...ing,
          lots: lotsByIng[ing.id] ?? [],
          supplier: ing.supplier_id ? supById[ing.supplier_id] : undefined,
        }))
      );
    }
    setLoading(false);
  }

  function openEdit(ing: IngredientWithLots) {
    setEditing(ing);
    setEditName(ing.name);
    setEditType(ing.type ?? "ingredient");
    setEditUnit(ing.unit ?? "g");
    setEditPrice(ing.price_per_kg != null ? String(ing.price_per_kg) : "");
    setEditSupplier(ing.supplier_id ?? "");
    setEditDensity(ing.density_g_per_l != null ? String(ing.density_g_per_l) : "");
    setEditAllergens(ing.allergens ?? []);
    setSaveError("");
    setDeleteConfirm(false);
  }

  function openCreate() {
    const defaultUnit = activeTab === "ingredient" ? "g" : "units";
    setEditing({ ...EMPTY_ITEM, type: activeTab, unit: defaultUnit });
    setEditName("");
    setEditType(activeTab);
    setEditUnit(defaultUnit);
    setEditPrice("");
    setEditSupplier("");
    setEditDensity("");
    setEditAllergens([]);
    setSaveError("");
    setDeleteConfirm(false);
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editName.trim()) { setSaveError("Name is required"); return; }
    setSaving(true);
    setSaveError("");

    const payload = {
      name: editName.trim(),
      type: editType,
      unit: editUnit,
      price_per_kg: editPrice ? parseFloat(editPrice) : null,
      supplier_id: editSupplier || null,
      density_g_per_l: editDensity ? parseFloat(editDensity) : null,
      allergens: editAllergens,
    };

    const { error } = isNew
      ? await supabase.from("ingredients").insert({ ...payload, organisation_id: orgId })
      : await supabase.from("ingredients").update(payload).eq("id", editing.id);

    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    setEditing(null);
    await load();
  }

  function openReconcile(lot: IngredientLot, ing: IngredientWithLots, e: React.MouseEvent) {
    e.stopPropagation();
    setReconLot({ lot, ing });
    setReconActual("");
    setReconReason("wastage");
    setReconNotes("");
    setReconError("");
  }

  async function saveReconcile() {
    if (!reconLot) return;
    const { lot, ing } = reconLot;
    const unit = ing.unit ?? "g";

    const actualG = unit === "units"
      ? parseFloat(reconActual)
      : Math.round(parseFloat(reconActual) * 1000);

    if (isNaN(actualG) || actualG < 0) {
      setReconError("Please enter a valid amount");
      return;
    }
    if (actualG > lot.quantity_remaining_g) {
      setReconError(`Cannot exceed current stock (${fmtQty(lot.quantity_remaining_g, unit)})`);
      return;
    }

    setReconSaving(true);
    setReconError("");

    const { error: lotErr } = await supabase
      .from("ingredient_lots")
      .update({ quantity_remaining_g: actualG })
      .eq("id", lot.id);

    if (lotErr) { setReconError(lotErr.message); setReconSaving(false); return; }

    await supabase.from("wastage_log").insert({
      organisation_id: orgId,
      lot_id: lot.id,
      ingredient_id: ing.id,
      julian_code: lot.julian_code,
      ingredient_name: ing.name,
      adjusted_from_g: lot.quantity_remaining_g,
      adjusted_to_g: actualG,
      reason: reconReason,
      notes: reconNotes.trim() || null,
    });

    setReconSaving(false);
    setReconLot(null);
    await load();
  }

  async function deleteItem() {
    if (!editing) return;
    if (editing.lots.length > 0) {
      setSaveError("Cannot delete — this item has delivery records. Remove the lots first.");
      setDeleteConfirm(false);
      return;
    }
    const { error } = await supabase.from("ingredients").delete().eq("id", editing.id);
    if (error) { setSaveError(error.message); return; }
    setEditing(null);
    await load();
  }

  const tabItems = items.filter(i => (i.type ?? "ingredient") === activeTab);
  const totalRemainingG = items.filter(i => i.type === "ingredient").reduce((s, i) => s + i.lots.reduce((a, l) => a + l.quantity_remaining_g, 0), 0);
  const totalValue = items.reduce((s, ing) => {
    if (!ing.price_per_kg) return s;
    const qty = ing.lots.reduce((a, l) => a + l.quantity_remaining_g, 0);
    return s + (ing.unit === "units" ? qty : qty / 1000) * ing.price_per_kg;
  }, 0);
  const outOfStock = items.filter(i =>
    i.lots.length > 0 && i.lots.reduce((s, l) => s + l.quantity_remaining_g, 0) === 0
  ).length;

  const priceLabel = editUnit === "units" ? "Price per unit (£)" : "Price per kg (£)";

  return (
    <>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-6xl w-full mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">Raw Materials</h1>
            <Link href="/admin/goods-in" className="btn-primary text-sm">Log Delivery</Link>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Ingredients</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{items.filter(i => i.type === "ingredient").length}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Ingredient stock</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{(totalRemainingG / 1000).toFixed(1)} kg</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Stock value</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {totalValue > 0 ? `£${totalValue.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
              </p>
            </div>
            <div className={`card p-4 ${outOfStock > 0 ? "border-brand/50 bg-brand-light" : ""}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${outOfStock > 0 ? "text-brown/70" : "text-gray-500"}`}>Out of stock</p>
              <p className={`mt-1 text-2xl font-bold ${outOfStock > 0 ? "text-brown" : "text-gray-900"}`}>{outOfStock}</p>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 border-b border-gray-200">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === tab.key
                    ? "border-brand text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
                <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                  activeTab === tab.key ? "bg-brand text-gray-900" : "bg-gray-100 text-gray-500"
                }`}>
                  {items.filter(i => (i.type ?? "ingredient") === tab.key).length}
                </span>
              </button>
            ))}
          </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="card p-8 text-center text-sm text-gray-500">Loading…</div>
          ) : (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">
                  {TABS.find(t => t.key === activeTab)?.label}
                  <span className="ml-2 text-gray-400 font-normal">({tabItems.length})</span>
                </h2>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 hidden sm:block">Click a row to edit</span>
                  <button onClick={openCreate} className="btn-primary text-xs py-1 px-3">+ Add</button>
                </div>
              </div>

              {tabItems.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-sm text-gray-400 mb-3">No {TABS.find(t => t.key === activeTab)?.label.toLowerCase()} yet</p>
                  <button onClick={openCreate} className="btn-primary text-xs">+ Add one now</button>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Supplier</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {activeTab === "ingredient" ? "Price / kg" : "Price / unit"}
                      </th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">In stock</th>
                      <th className="w-8 px-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tabItems.map(ing => {
                      const totalRemaining = ing.lots.reduce((s, l) => s + l.quantity_remaining_g, 0);
                      const isOpen = expanded[ing.id];
                      const hasStock = totalRemaining > 0;
                      const noLots = ing.lots.length === 0;
                      const unit = ing.unit ?? "g";
                      const value = ing.price_per_kg != null
                        ? (unit === "units" ? totalRemaining : totalRemaining / 1000) * ing.price_per_kg
                        : null;

                      return (
                        <>
                          <tr
                            key={ing.id}
                            className="hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={() => openEdit(ing)}
                          >
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">{ing.name}</p>
                              {ing.allergens && ing.allergens.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {ing.allergens.map(a => (
                                    <span key={a} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                                      {a}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {ing.supplier?.name
                                ? <span className="text-gray-600">{ing.supplier.name}</span>
                                : <span className="text-amber-500 text-xs">Not set</span>}
                            </td>
                            <td className="px-4 py-3">
                              {ing.price_per_kg != null
                                ? <span className="text-gray-600">£{ing.price_per_kg.toFixed(2)}</span>
                                : <span className="text-amber-500 text-xs">Not set</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {noLots ? (
                                <span className="text-gray-300">—</span>
                              ) : (
                                <div>
                                  <p className={`font-semibold tabular-nums ${!hasStock ? "text-red-600" : "text-gray-900"}`}>
                                    {fmtQty(totalRemaining, unit)}
                                  </p>
                                  {value != null && (
                                    <p className="text-xs text-brown font-medium">
                                      £{value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                              {!noLots && (
                                <button
                                  onClick={() => setExpanded(p => ({ ...p, [ing.id]: !p[ing.id] }))}
                                  className="p-1 rounded hover:bg-gray-200 transition"
                                >
                                  <svg className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                    viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </button>
                              )}
                            </td>
                          </tr>

                          {isOpen && ing.lots.length > 0 && (
                            <tr key={`${ing.id}-lots`}>
                              <td colSpan={5} className="bg-gray-50 border-t border-gray-100 px-4 py-3">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-500">
                                      <th className="text-left py-1 font-medium">Batch / ref</th>
                                      <th className="text-right py-1 font-medium">Received</th>
                                      <th className="text-right py-1 font-medium">Remaining</th>
                                      <th className="text-left py-1 font-medium pl-4">Date in</th>
                                      <th className="text-left py-1 font-medium">Supplier</th>
                                      <th className="text-left py-1 font-medium">Best before</th>
                                      <th className="w-20" />
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {ing.lots.map(lot => (
                                      <tr key={lot.id} className={lot.quantity_remaining_g === 0 ? "opacity-40" : ""}>
                                        <td className="py-1.5 font-mono font-semibold text-gray-900">{lot.julian_code}</td>
                                        <td className="py-1.5 text-right tabular-nums text-gray-600">{fmtQty(lot.quantity_received_g, unit)}</td>
                                        <td className="py-1.5 text-right tabular-nums font-semibold text-gray-900">{fmtQty(lot.quantity_remaining_g, unit)}</td>
                                        <td className="py-1.5 pl-4 text-gray-500">{formatDate(lot.received_date)}</td>
                                        <td className="py-1.5 text-gray-500">{lot.supplier ?? "—"}</td>
                                        <td className="py-1.5 text-gray-500">{lot.best_before_date ? formatDate(lot.best_before_date) : "—"}</td>
                                        <td className="py-1.5">
                                          {lot.quantity_remaining_g > 0 && (
                                            <button
                                              onClick={e => openReconcile(lot, ing, e)}
                                              className="text-xs text-brand-dark font-medium hover:underline whitespace-nowrap"
                                            >
                                              Reconcile
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
        </main>

      {/* Reconcile panel */}
      {reconLot && (() => {
        const { lot, ing } = reconLot;
        const unit = ing.unit ?? "g";
        const currentDisplay = fmtQty(lot.quantity_remaining_g, unit);
        const actualG = reconActual === ""
          ? null
          : unit === "units" ? parseFloat(reconActual) : Math.round(parseFloat(reconActual) * 1000);
        const writtenOff = actualG !== null && !isNaN(actualG) && actualG >= 0
          ? lot.quantity_remaining_g - actualG
          : null;

        return (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={() => setReconLot(null)} />
            <div className="w-full max-w-sm bg-white shadow-xl flex flex-col">
              <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Reconcile Stock</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{lot.julian_code} · {ing.name}</p>
                </div>
                <button onClick={() => setReconLot(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Current stock info */}
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                  <p className="text-xs text-amber-700 font-medium">System shows remaining</p>
                  <p className="text-2xl font-bold text-amber-900 mt-0.5">{currentDisplay}</p>
                </div>

                {/* Actual amount input */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Actual amount remaining ({unit === "units" ? "units" : "kg"})
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step={unit === "units" ? "1" : "0.001"}
                      min="0"
                      className="input flex-1"
                      placeholder={unit === "units" ? "0" : "0.000"}
                      value={reconActual}
                      onChange={e => setReconActual(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setReconActual("0")}
                      className="text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                    >
                      Write off all
                    </button>
                  </div>
                  {writtenOff !== null && writtenOff >= 0 && (
                    <p className="mt-2 text-xs text-gray-600">
                      <span className="font-semibold text-gray-800">{fmtQty(writtenOff, unit)}</span> will be written off
                    </p>
                  )}
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
                  <select
                    className="input w-full"
                    value={reconReason}
                    onChange={e => setReconReason(e.target.value)}
                  >
                    <option value="wastage">Wastage (prep, trim, yield loss)</option>
                    <option value="damaged">Damaged / contaminated</option>
                    <option value="expired">Expired / best before passed</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
                  <textarea
                    className="input w-full"
                    rows={2}
                    placeholder="e.g. Shallots peeled for batch B240520"
                    value={reconNotes}
                    onChange={e => setReconNotes(e.target.value)}
                  />
                </div>
              </div>

              {reconError && (
                <div className="mx-6 mb-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  {reconError}
                </div>
              )}

              <div className="border-t border-gray-200 px-6 pt-3 pb-3">
                <div className="flex gap-3">
                  <button onClick={() => setReconLot(null)} className="btn-ghost flex-1">Cancel</button>
                  <button
                    onClick={saveReconcile}
                    disabled={reconSaving || reconActual === ""}
                    className="btn-primary flex-1"
                  >
                    {reconSaving ? "Saving…" : "Save reconciliation"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit / create panel */}
      {editing && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/30" onClick={() => setEditing(null)} />
          <div className="w-full max-w-sm bg-white shadow-xl flex flex-col">
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                {isNew ? `New ${TABS.find(t => t.key === editType)?.label.replace(/s$/, "").toLowerCase()}` : editing.name}
              </h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {isNew && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    className="input w-full"
                    placeholder="e.g. Garlic"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Supplier</label>
                <select className="input w-full" value={editSupplier} onChange={e => setEditSupplier(e.target.value)}>
                  <option value="">— None —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{priceLabel}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">£</span>
                  <input
                    type="number" step="0.01" min="0"
                    className="input w-full pl-7" placeholder="0.00"
                    value={editPrice} onChange={e => setEditPrice(e.target.value)}
                  />
                </div>
                {editPrice && !isNew && editing.lots.length > 0 && (
                  <p className="mt-1.5 text-xs text-gray-500">
                    Stock value:{" "}
                    <span className="font-semibold text-brown">
                      £{(() => {
                        const qty = editing.lots.reduce((s, l) => s + l.quantity_remaining_g, 0);
                        return ((editUnit === "units" ? qty : qty / 1000) * parseFloat(editPrice))
                          .toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      })()}
                    </span>
                  </p>
                )}
              </div>

              {editType === "ingredient" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Density (g per litre)</label>
                  <input
                    type="number" step="0.1" min="0"
                    className="input w-full" placeholder="e.g. 917 for oil"
                    value={editDensity} onChange={e => setEditDensity(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-gray-400">Set for liquids so Goods In can accept litres</p>
                </div>
              )}

              {editType === "ingredient" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Allergens</label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALLERGENS.map(allergen => {
                      const selected = editAllergens.includes(allergen);
                      return (
                        <button
                          key={allergen}
                          type="button"
                          onClick={() => setEditAllergens(prev =>
                            prev.includes(allergen)
                              ? prev.filter(a => a !== allergen)
                              : [...prev, allergen]
                          )}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            selected
                              ? "bg-amber-100 border-amber-400 text-amber-800 font-medium"
                              : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                          }`}
                        >
                          {allergen}
                        </button>
                      );
                    })}
                  </div>
                  {editAllergens.length === 0 && (
                    <p className="mt-1.5 text-xs text-gray-400">Tap allergens present in this ingredient</p>
                  )}
                </div>
              )}

              {/* Documents — only shown when editing an existing item */}
              {!isNew && editing && editing.id && (
                <DocUploader
                  entityType={editType === "supplies" ? "supply" : editType === "packaging" ? "packaging" : "ingredient"}
                  entityId={editing.id}
                  docType={editType === "supplies" ? "coshh" : "spec_sheet"}
                  label={editType === "supplies" ? "COSHH Sheet" : "Spec Sheet"}
                />
              )}
            </div>

            {saveError && (
              <div className="mx-6 mb-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {saveError}
              </div>
            )}

            <div className="border-t border-gray-200 px-6 pt-3 pb-3">
              {!isNew && (
                deleteConfirm ? (
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs text-red-600 flex-1">Delete {editing.name}?</span>
                    <button onClick={deleteItem} className="text-xs text-red-600 font-semibold hover:underline">Yes, delete</button>
                    <button onClick={() => setDeleteConfirm(false)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteConfirm(true)} className="text-xs text-red-400 hover:text-red-600 mb-3 block">
                    Delete item
                  </button>
                )
              )}
              <div className="flex gap-3">
                <button onClick={() => setEditing(null)} className="btn-ghost flex-1">Cancel</button>
                <button onClick={saveEdit} disabled={saving} className="btn-primary flex-1">
                  {saving ? "Saving…" : isNew ? "Create" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
