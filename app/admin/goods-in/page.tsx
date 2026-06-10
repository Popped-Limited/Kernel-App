"use client";
import BackButton from "@/components/BackButton";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import type { Ingredient, IngredientLot, Question } from "@/lib/types";
import { formatDate, todayJulianCode } from "@/lib/utils";

/** Returns current local datetime as YYYY-MM-DDThh:mm for datetime-local inputs */
function nowLocalDateTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function renderComplianceField(
  q: Question,
  value: string,
  onChange: (v: string) => void,
) {
  const base = "input text-sm py-1.5 w-full";
  if (q.type === "dropdown" && q.options?.length) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} className={base}>
        <option value="">Select…</option>
        {q.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (q.type === "multiple_choice" && q.options?.length) {
    return (
      <div className="flex flex-wrap gap-2 mt-0.5">
        {q.options.map(o => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${value === o ? "bg-brand border-brand/50 text-brown font-medium" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "checkbox") {
    return (
      <div className="flex gap-2 mt-0.5">
        {["Yes", "No"].map(o => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`px-4 py-1.5 rounded-full text-xs border transition-colors ${value === o ? "bg-brand border-brand/50 text-brown font-medium" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "number") {
    return (
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={base}
        inputMode="decimal"
        step="any"
        placeholder={q.hint ?? ""}
      />
    );
  }
  // default: text
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      className={base}
      placeholder={q.hint ?? ""}
    />
  );
}

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
  const [complianceWarning, setComplianceWarning] = useState(false);
  const [goodsInChecklistId, setGoodsInChecklistId] = useState<string | null>(null);
  const [panelSearch, setPanelSearch] = useState("");
  const [panelPeriod, setPanelPeriod] = useState<"week" | "month">("week");
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  const [rows, setRows] = useState<IngredientRow[]>([emptyRow()]);
  const [receivedDateTime, setReceivedDateTime] = useState(nowLocalDateTime());
  const [supplierId, setSupplierId] = useState("");
  const [loggedBy, setLoggedBy] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [goodsInQuestions, setGoodsInQuestions] = useState<Question[]>([]);
  const [complianceAnswers, setComplianceAnswers] = useState<Record<string, string>>({});

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

  useEffect(() => { if (orgId) load(); }, [orgId]);

  async function load() {
    const [ingRes, lotRes, supRes, clRes] = await Promise.all([
      supabase.from("ingredients").select("*").order("name"),
      supabase
        .from("ingredient_lots")
        .select("*, ingredient:ingredients(name)")
        .order("created_at", { ascending: false }),
      supabase.from("suppliers").select("id, name").order("name"),
      supabase
        .from("checklists")
        .select("id")
        .ilike("name", "%goods in%")
        .eq("active", true)
        .limit(1)
        .maybeSingle(),
    ]);
    if (ingRes.data) setIngredients(ingRes.data);
    if (lotRes.data) setRecentLots(lotRes.data as (IngredientLot & { ingredient: Ingredient })[]);
    if (supRes.data) setSuppliers(supRes.data as Supplier[]);
    if (clRes.data?.id) {
      setGoodsInChecklistId(clRes.data.id);
      const { data: qData } = await supabase
        .from("questions")
        .select("*")
        .eq("checklist_id", clRes.data.id)
        .order("order_index");
      if (qData) setGoodsInQuestions(qData as Question[]);
    }
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

  async function handleBackfill() {
    if (!confirm("This will create checklist submissions for all historical Goods In and Goods Out records. Only run this once. Continue?")) return;
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await fetch("/api/backfill-goods-records", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setBackfillResult(`Done — created ${data.goodsInCreated} goods-in and ${data.goodsOutCreated} goods-out submissions.`);
      } else {
        setBackfillResult(`Error: ${data.error ?? "Unknown error"}`);
      }
    } catch {
      setBackfillResult("Network error — please try again.");
    }
    setBackfilling(false);
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
    const receivedDate = receivedDateTime.slice(0, 10);
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

    // Also create a Goods In Record checklist submission for compliance sign-off
    if (goodsInChecklistId) {
      try {
        const itemLines = inserts.map(r => {
          const ing = ingredients.find(i => i.id === r.ingredient_id);
          const qty = ing?.unit === "units"
            ? `${Number(r.quantity_received_g).toLocaleString()} units`
            : `${Number(r.quantity_received_g).toLocaleString()}g`;
          const bbe = r.best_before_date ? ` · BBE: ${r.best_before_date}` : "";
          return `${ing?.name ?? "Unknown"}: ${qty} (Lot: ${r.julian_code})${bbe}`;
        });
        const batchNotes = [
          `Supplier: ${supplierName ?? "Unknown"}`,
          `Date & time received: ${receivedDateTime.replace("T", " ")}`,
          `Items:`,
          ...itemLines.map(l => `  • ${l}`),
        ].join("\n");

        const answers = goodsInQuestions.map(q => ({
          question_id: q.id,
          value: complianceAnswers[q.id] ?? null,
        }));

        const compRes = await fetch("/api/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checklist_id: goodsInChecklistId,
            organisation_id: orgId ?? null,
            submitted_by: loggedBy.trim(),
            answers,
            batch_notes: batchNotes,
          }),
        });
        if (!compRes.ok) {
          console.error("Failed to create goods-in submission:", await compRes.text());
          setComplianceWarning(true);
        }
      } catch (e) {
        console.error("Failed to create goods-in submission:", e);
        setComplianceWarning(true);
      }
    }

    setSaved(true);
    setRows([emptyRow()]);
    setSupplierId("");
    setComplianceAnswers({});
    setReceivedDateTime(nowLocalDateTime());
    setErrors({});
    await load();
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <>
      <div className="flex flex-1 min-h-0">
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold text-gray-900">Goods In</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBackfill}
              disabled={backfilling}
              className="btn-ghost text-xs px-2 text-gray-400"
              title="One-time: create compliance submissions for all historical goods-in and goods-out records"
            >
              {backfilling ? "Backfilling…" : "Backfill history"}
            </button>
            <Link href="/admin/stock" className="btn-secondary text-sm">View Stock Levels</Link>
          </div>
        </div>

        {backfillResult && (
          <div className={`rounded-lg px-4 py-3 text-sm ${backfillResult.startsWith("Error") || backfillResult.startsWith("Network") ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-50 border border-green-200 text-green-700"}`}>
            {backfillResult}
          </div>
        )}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Log incoming delivery</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Shared delivery details */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Date &amp; time received *</label>
                <input
                  type="datetime-local"
                  value={receivedDateTime}
                  onChange={e => setReceivedDateTime(e.target.value)}
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
                  placeholder="e.g. Kernel Sanders"
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

            {/* Delivery checks */}
            {goodsInQuestions.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 border-t border-gray-100 pt-4">Delivery checks</h3>
                {goodsInQuestions.map(q => (
                  <div key={q.id}>
                    <label className="text-xs text-gray-600 block mb-1 font-medium">
                      {q.label}
                      {q.required && <span className="text-red-400 ml-0.5">*</span>}
                    </label>
                    {q.hint && <p className="text-xs text-gray-400 mb-1">{q.hint}</p>}
                    {renderComplianceField(
                      q,
                      complianceAnswers[q.id] ?? "",
                      v => setComplianceAnswers(prev => ({ ...prev, [q.id]: v })),
                    )}
                  </div>
                ))}
              </div>
            )}

            {complianceWarning && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                <p className="font-semibold mb-0.5">Delivery saved — compliance record failed</p>
                <p className="text-xs text-amber-700">
                  Your goods-in delivery was logged successfully, but the compliance checklist entry could not be created automatically.
                  Please go to <strong>Checklist Submissions</strong> and create a Goods In record manually, or contact support.
                </p>
                <button
                  type="button"
                  onClick={() => setComplianceWarning(false)}
                  className="mt-2 text-xs underline text-amber-700 hover:text-amber-900"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Saving…" : `Save ${rows.length} ingredient${rows.length !== 1 ? "s" : ""}`}
              </button>
              {saved && <span className="text-sm text-brown/70 font-medium">Saved ✓</span>}
            </div>
          </form>
        </div>

      </div>
      </main>

      {/* Right panel — recent deliveries */}
      <aside className="hidden lg:flex flex-col w-80 shrink-0 sticky top-0 h-screen border-l border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 shrink-0 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Recent deliveries</h2>
          <input
            type="text"
            placeholder="Search ingredient…"
            value={panelSearch}
            onChange={e => setPanelSearch(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <div className="flex gap-1">
            {(["week", "month"] as const).map(p => (
              <button key={p} onClick={() => setPanelPeriod(p)}
                className={`flex-1 px-2 py-1.5 rounded text-xs font-medium border transition-colors ${panelPeriod === p ? "bg-brand border-brand/50 text-brown" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                {p === "week" ? "This Week" : "This Month"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {loading ? (
            <div className="p-4 text-sm text-gray-400 text-center">Loading…</div>
          ) : recentLots.length === 0 ? (
            <div className="p-4 text-sm text-gray-400 text-center">No deliveries yet.</div>
          ) : recentLots.filter(lot => {
              const now = new Date();
              const lotDate = new Date(lot.received_date);
              if (panelPeriod === "week") {
                const daysFromMon = now.getDay() === 0 ? 6 : now.getDay() - 1;
                const weekStart = new Date(now); weekStart.setDate(now.getDate() - daysFromMon); weekStart.setHours(0,0,0,0);
                if (lotDate < weekStart) return false;
              } else {
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                if (lotDate < monthStart) return false;
              }
              return !panelSearch || lot.ingredient?.name?.toLowerCase().includes(panelSearch.toLowerCase());
            }).map(lot => (
            <div key={lot.id} className="px-4 py-3 hover:bg-gray-50 transition">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{lot.ingredient?.name}</p>
                  <p className="text-xs font-mono text-gray-500 mt-0.5">{lot.julian_code}</p>
                  <p className="text-xs text-gray-400">{lot.quantity_received_g.toLocaleString()}g received
                    {lot.quantity_remaining_g === 0 && <span className="ml-1 text-gray-300 line-through">used</span>}
                  </p>
                  {lot.supplier && <p className="text-xs text-gray-400 truncate">{lot.supplier}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-gray-400">{formatDate(lot.received_date)}</p>
                  <button onClick={() => openEditLot(lot)} className="text-xs text-brown/60 hover:text-brown hover:underline mt-1 block">Edit</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>
      </div>

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
