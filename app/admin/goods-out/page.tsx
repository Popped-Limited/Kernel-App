"use client";
import BackButton from "@/components/BackButton";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import type { Dispatch, Submission, Checklist } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const SKUS = [
  "Garlic Chilli Oil",
  "Garlic Chilli Oil with Beef",
  "Sichuan Chilli Crisp",
  "Sichuan Chilli Crisp Double Heat",
  "Hunan Salted Chillies",
];

interface ProductRow {
  product: string;
  casesOf6: string;
  casesOf3: string;
  singles: string;
  batchSubmissionId: string;
}

function emptyRow(): ProductRow {
  return { product: "", casesOf6: "0", casesOf3: "0", singles: "0", batchSubmissionId: "" };
}

/** Pull batch code + total jars out of a submission's answers */
function batchSummary(answers: Array<{ value: string | null; question: { type: string; label: string } | null }>) {
  let batchCode = "";
  let totalUnits = 0;      // from explicit "total units produced" field
  let jarsUsedFallback = 0; // from jars_used in packing_runs
  for (const ans of answers ?? []) {
    const type  = ans.question?.type ?? "";
    const label = (ans.question?.label ?? "").toLowerCase();
    // Prefer explicit "total units produced" answer (matches Finished Goods logic)
    if (label.includes("total units produced") && ans.value) {
      totalUnits += Number(ans.value) || 0;
    }
    if (type === "packing_runs" && ans.value) {
      try {
        const rows = JSON.parse(ans.value) as Array<{ jars_used?: string }>;
        for (const r of rows) jarsUsedFallback += Number(r.jars_used) || 0;
      } catch { /* ignore */ }
    }
    if (!batchCode && type === "text" && (label.includes("batch") || label.includes("lot")) && ans.value) {
      batchCode = ans.value;
    }
  }
  return { batchCode, totalJars: totalUnits > 0 ? totalUnits : jarsUsedFallback };
}

export default function GoodsOutPage() {
  const { orgId } = useOrganisation();
  const [recentDispatches, setRecentDispatches] = useState<Dispatch[]>([]);
  const [batchSubmissions, setBatchSubmissions] = useState<(Submission & { checklist: Checklist })[]>([]);
  const [productChecklists, setProductChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [panelSearch, setPanelSearch] = useState("");
  const [panelPeriod, setPanelPeriod] = useState<"week" | "month">("week");
  const [goodsOutChecklistId, setGoodsOutChecklistId] = useState<string | null>(null);
  // Units already dispatched per batch_submission_id (from saved dispatches)
  const [dispatchedPerBatch, setDispatchedPerBatch] = useState<Record<string, number>>({});

  // Edit existing dispatch
  const [editingDispatch, setEditingDispatch] = useState<Dispatch | null>(null);
  const [editDate, setEditDate]               = useState("");
  const [editProduct, setEditProduct]         = useState("");
  const [editCustomer, setEditCustomer]       = useState("");
  const [editCasesOf6, setEditCasesOf6]       = useState("");
  const [editCasesOf3, setEditCasesOf3]       = useState("");
  const [editSingles, setEditSingles]         = useState("");
  const [editRef, setEditRef]                 = useState("");
  const [editDispatchedBy, setEditDispatchedBy] = useState("");
  const [editNotes, setEditNotes]             = useState("");
  const [editSaving, setEditSaving]           = useState(false);
  const [editError, setEditError]             = useState("");

  const [rows, setRows] = useState<ProductRow[]>([emptyRow()]);
  const [customer, setCustomer] = useState("");
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [dispatchedBy, setDispatchedBy] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    const [dispRes, subRes, batchDispRes] = await Promise.all([
      supabase
        .from("dispatches")
        .select("*")
        .order("dispatch_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("submissions")
        .select("id, submitted_by, submitted_at, checklist:checklists(name, category), answers(value, question:questions(type, label))")
        .order("submitted_at", { ascending: false })
        .limit(200),
      supabase
        .from("dispatches")
        .select("batch_submission_id, total_units")
        .not("batch_submission_id", "is", null),
    ]);
    if (dispRes.data) setRecentDispatches(dispRes.data as Dispatch[]);
    if (subRes.data) {
      const productionOnly = (subRes.data as unknown as (Submission & { checklist: Checklist })[]).filter(
        s => s.checklist?.category === "Production"
      );
      setBatchSubmissions(productionOnly);
    }
    if (batchDispRes.data) {
      const totals: Record<string, number> = {};
      for (const d of batchDispRes.data) {
        if (d.batch_submission_id) {
          totals[d.batch_submission_id] = (totals[d.batch_submission_id] ?? 0) + (d.total_units ?? 0);
        }
      }
      setDispatchedPerBatch(totals);
    }

    // Also fetch all production checklists so the product list is always complete
    // (even for products with no recent submissions)
    const [{ data: clData }, { data: goChecklist }] = await Promise.all([
      supabase
        .from("checklists")
        .select("id, name, category")
        .eq("category", "Production")
        .eq("active", true)
        .order("name"),
      supabase
        .from("checklists")
        .select("id")
        .ilike("name", "%goods out%")
        .eq("active", true)
        .limit(1)
        .maybeSingle(),
    ]);
    if (clData) setProductChecklists(clData as Checklist[]);
    if (goChecklist?.id) setGoodsOutChecklistId(goChecklist.id);
    setLoading(false);
  }

  function updateRow(idx: number, field: keyof ProductRow, value: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  function addRow() { setRows(prev => [...prev, emptyRow()]); }

  function removeRow(idx: number) {
    if (rows.length > 1) setRows(prev => prev.filter((_, i) => i !== idx));
  }

  function rowTotal(row: ProductRow) {
    return Number(row.casesOf6) * 6 + Number(row.casesOf3) * 3 + Number(row.singles);
  }

  const grandTotal = rows.reduce((s, r) => s + rowTotal(r), 0);

  // Units allocated to each batch in the current (unsaved) form rows
  const formAllocatedPerBatch = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const r of rows) {
      if (r.batchSubmissionId) {
        const units = Number(r.casesOf6) * 6 + Number(r.casesOf3) * 3 + Number(r.singles);
        totals[r.batchSubmissionId] = (totals[r.batchSubmissionId] ?? 0) + units;
      }
    }
    return totals;
  }, [rows]);

  function validate() {
    const errs: Record<string, string> = {};
    if (!customer.trim()) errs.customer = "Required";
    if (!dispatchedBy.trim()) errs.dispatchedBy = "Required";
    rows.forEach((row, i) => {
      if (!row.product) errs[`product_${i}`] = "Required";
      if (rowTotal(row) <= 0) errs[`units_${i}`] = "Enter at least one unit";
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);

    const inserts = rows.map(row => ({
      dispatch_date: dispatchDate,
      product: row.product,
      customer,
      cases_of_6: Number(row.casesOf6) || 0,
      cases_of_3: Number(row.casesOf3) || 0,
      singles: Number(row.singles) || 0,
      total_units: rowTotal(row),
      reference: reference.trim() || null,
      dispatched_by: dispatchedBy.trim(),
      notes: notes.trim() || null,
      batch_submission_id: row.batchSubmissionId || null,
      organisation_id: orgId,
    }));

    const { error } = await supabase.from("dispatches").insert(inserts);
    setSaving(false);
    if (error) { alert("Failed to save — please try again."); return; }

    // Also create a Goods Out Record checklist submission for compliance sign-off
    if (goodsOutChecklistId) {
      try {
        const grandTotal = inserts.reduce((s, r) => s + r.total_units, 0);
        const itemLines = inserts.map(r => {
          const parts: string[] = [];
          if (r.cases_of_6) parts.push(`${r.cases_of_6}×6`);
          if (r.cases_of_3) parts.push(`${r.cases_of_3}×3`);
          if (r.singles) parts.push(`${r.singles} singles`);
          return `  • ${r.product}: ${parts.join(", ")} (${r.total_units} units)`;
        });
        const batchNotes = [
          `Customer: ${customer.trim()}`,
          `Date dispatched: ${dispatchDate}`,
          ...(reference.trim() ? [`Reference: ${reference.trim()}`] : []),
          `Products:`,
          ...itemLines,
          `Total: ${grandTotal} units`,
          ...(notes.trim() ? [`Notes: ${notes.trim()}`] : []),
        ].join("\n");

        await fetch("/api/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checklist_id: goodsOutChecklistId,
            organisation_id: orgId ?? null,
            submitted_by: dispatchedBy.trim(),
            answers: [],
            batch_notes: batchNotes,
          }),
        });
      } catch (e) {
        // Non-fatal — dispatch was saved, compliance record failed silently
        console.error("Failed to create goods-out submission:", e);
      }
    }

    setSaved(true);
    setRows([emptyRow()]);
    setCustomer("");
    setReference("");
    setNotes("");
    setErrors({});
    await load();
    setTimeout(() => setSaved(false), 3000);
  }

  function openEditDispatch(d: Dispatch) {
    setEditingDispatch(d);
    setEditDate(d.dispatch_date);
    setEditProduct(d.product);
    setEditCustomer(d.customer);
    setEditCasesOf6(String(d.cases_of_6));
    setEditCasesOf3(String(d.cases_of_3));
    setEditSingles(String(d.singles));
    setEditRef(d.reference ?? "");
    setEditDispatchedBy(d.dispatched_by);
    setEditNotes(d.notes ?? "");
    setEditError("");
  }

  async function saveEditDispatch() {
    if (!editingDispatch) return;
    if (!editProduct.trim()) { setEditError("Product is required"); return; }
    if (!editCustomer.trim()) { setEditError("Customer is required"); return; }
    if (!editDispatchedBy.trim()) { setEditError("Dispatched by is required"); return; }
    const total = Number(editCasesOf6) * 6 + Number(editCasesOf3) * 3 + Number(editSingles);
    if (total <= 0) { setEditError("Enter at least one unit"); return; }
    setEditSaving(true);
    const { error } = await supabase.from("dispatches").update({
      dispatch_date: editDate,
      product: editProduct.trim(),
      customer: editCustomer.trim(),
      cases_of_6: Number(editCasesOf6) || 0,
      cases_of_3: Number(editCasesOf3) || 0,
      singles: Number(editSingles) || 0,
      total_units: total,
      reference: editRef.trim() || null,
      dispatched_by: editDispatchedBy.trim(),
      notes: editNotes.trim() || null,
    }).eq("id", editingDispatch.id);
    setEditSaving(false);
    if (error) { setEditError(error.message); return; }
    setEditingDispatch(null);
    await load();
  }

  return (
    <>
      <div className="flex flex-1 min-h-0">
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold text-gray-900">Goods Out</h1>
          </div>
          <Link href="/admin/traceability" className="btn-secondary text-sm">Traceability</Link>
        </div>
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Log dispatch</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Shared fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Customer *</label>
                <input
                  type="text"
                  value={customer}
                  onChange={e => setCustomer(e.target.value)}
                  className={`input ${errors.customer ? "border-red-300" : ""}`}
                  placeholder="e.g. Amazon, Ocado, Farm shop…"
                />
                {errors.customer && <p className="mt-1 text-xs text-red-600">{errors.customer}</p>}
              </div>
              <div>
                <label className="label">Dispatch date *</label>
                <input type="date" value={dispatchDate} onChange={e => setDispatchDate(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">Order reference</label>
                <input type="text" value={reference} onChange={e => setReference(e.target.value)} className="input" placeholder="Optional" />
              </div>
              <div>
                <label className="label">Dispatched by *</label>
                <input
                  type="text"
                  value={dispatchedBy}
                  onChange={e => setDispatchedBy(e.target.value)}
                  className={`input ${errors.dispatchedBy ? "border-red-300" : ""}`}
                  placeholder="e.g. Chief Popping Officer"
                  autoComplete="name"
                />
                {errors.dispatchedBy && <p className="mt-1 text-xs text-red-600">{errors.dispatchedBy}</p>}
              </div>
            </div>

            {/* Product cards */}
            <div className="space-y-3">
              {rows.map((row, idx) => {
                const total = rowTotal(row);

                // Batches matching this product that still have stock available
                const productBatches = batchSubmissions.filter(s =>
                  row.product
                    ? s.checklist?.name?.toLowerCase().startsWith(row.product.toLowerCase())
                    : false
                );
                const availableBatches = productBatches.filter(s => {
                  const { totalJars } = batchSummary((s as any).answers ?? []);
                  if (totalJars === 0) return true; // no production data — always show
                  const alreadyDispatched = dispatchedPerBatch[s.id] ?? 0;
                  // Units this row currently allocates to this batch
                  const thisRowAlloc = row.batchSubmissionId === s.id ? total : 0;
                  // Units other rows allocate to this batch
                  const otherRowsAlloc = (formAllocatedPerBatch[s.id] ?? 0) - thisRowAlloc;
                  const remaining = totalJars - alreadyDispatched - otherRowsAlloc;
                  return remaining > 0 || row.batchSubmissionId === s.id;
                });

                return (
                  <div key={idx} className="rounded-xl border border-gray-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Product {idx + 1}
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
                      {/* Product */}
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 block mb-0.5">Product *</label>
                        <select
                          value={row.product}
                          onChange={e => updateRow(idx, "product", e.target.value)}
                          className={`input text-sm py-1.5 ${errors[`product_${idx}`] ? "border-red-300" : ""}`}
                        >
                          <option value="">Select product…</option>
                          {productChecklists.map(cl => {
                            const name = cl.name.replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim();
                            return <option key={cl.id} value={name}>{name}</option>;
                          })}
                        </select>
                        {errors[`product_${idx}`] && <p className="mt-0.5 text-xs text-red-500">{errors[`product_${idx}`]}</p>}
                      </div>

                      {/* Cases of 6 */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Cases of 6</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={row.casesOf6}
                          onChange={e => updateRow(idx, "casesOf6", e.target.value.replace(/[^0-9]/g, ""))}
                          className="input text-sm py-1.5"
                        />
                      </div>

                      {/* Cases of 3 */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Cases of 3</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={row.casesOf3}
                          onChange={e => updateRow(idx, "casesOf3", e.target.value.replace(/[^0-9]/g, ""))}
                          className="input text-sm py-1.5"
                        />
                      </div>

                      {/* Singles */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Singles</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={row.singles}
                          onChange={e => updateRow(idx, "singles", e.target.value.replace(/[^0-9]/g, ""))}
                          className="input text-sm py-1.5"
                        />
                      </div>

                      {/* Total */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Total units</label>
                        <div className={`input text-sm py-1.5 bg-gray-50 font-bold tabular-nums ${total > 0 ? "text-gray-900" : "text-gray-300"}`}>
                          {total}
                        </div>
                        {errors[`units_${idx}`] && <p className="mt-0.5 text-xs text-red-500">{errors[`units_${idx}`]}</p>}
                      </div>

                      {/* Batch record */}
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 block mb-0.5">Link batch record (traceability)</label>
                        <select
                          value={row.batchSubmissionId}
                          onChange={e => updateRow(idx, "batchSubmissionId", e.target.value)}
                          className="input text-sm py-1.5"
                          disabled={!row.product}
                        >
                          <option value="">No link…</option>
                          {availableBatches.map(s => {
                            const { batchCode, totalJars } = batchSummary((s as any).answers ?? []);
                            const alreadyDispatched = dispatchedPerBatch[s.id] ?? 0;
                            const thisRowAlloc = row.batchSubmissionId === s.id ? total : 0;
                            const otherRowsAlloc = (formAllocatedPerBatch[s.id] ?? 0) - thisRowAlloc;
                            const remaining = totalJars > 0 ? totalJars - alreadyDispatched - otherRowsAlloc : null;
                            const label = [
                              batchCode ? `Batch ${batchCode}` : formatDate(s.submitted_at.slice(0, 10)),
                              remaining !== null ? `${remaining.toLocaleString()} remaining` : null,
                            ].filter(Boolean).join(" · ");
                            return (
                              <option key={s.id} value={s.id}>
                                {label}
                              </option>
                            );
                          })}
                        </select>
                        {row.batchSubmissionId && (() => {
                          const s = batchSubmissions.find(b => b.id === row.batchSubmissionId);
                          if (!s) return null;
                          const { totalJars } = batchSummary((s as any).answers ?? []);
                          const alreadyDispatched = dispatchedPerBatch[s.id] ?? 0;
                          const otherRowsAlloc = (formAllocatedPerBatch[s.id] ?? 0) - total;
                          const remaining = totalJars - alreadyDispatched - otherRowsAlloc;
                          if (remaining < 0) return (
                            <p className="mt-1 text-xs text-red-600 font-medium">
                              Over-allocated by {Math.abs(remaining)} units
                            </p>
                          );
                          return null;
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={addRow}
                className="w-full rounded-xl border-2 border-dashed border-gray-200 py-2.5 text-sm text-gray-500 hover:border-brand hover:text-brown transition"
              >
                + Add another product
              </button>
            </div>

            {grandTotal > 0 && (
              <p className="text-sm text-gray-600">
                Total dispatch: <span className="font-bold text-gray-900">{grandTotal} units</span>
              </p>
            )}

            <div>
              <label className="label">Notes</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className="input" placeholder="Optional" />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Saving…" : `Log dispatch (${rows.length} product${rows.length !== 1 ? "s" : ""})`}
              </button>
              {saved && <span className="text-sm text-brown/70 font-medium">Saved ✓</span>}
            </div>
          </form>
        </div>

      </div>
      </main>

      {/* Right panel — recent dispatches */}
      <aside className="hidden lg:flex flex-col w-80 shrink-0 sticky top-0 h-screen border-l border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 shrink-0 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Recent dispatches</h2>
          <input
            type="text"
            placeholder="Search product or customer…"
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
          ) : recentDispatches.length === 0 ? (
            <div className="p-4 text-sm text-gray-400 text-center">No dispatches yet.</div>
          ) : recentDispatches.filter(d => {
              const now = new Date();
              const dDate = new Date(d.dispatch_date);
              if (panelPeriod === "week") {
                const daysFromMon = now.getDay() === 0 ? 6 : now.getDay() - 1;
                const weekStart = new Date(now); weekStart.setDate(now.getDate() - daysFromMon); weekStart.setHours(0,0,0,0);
                if (dDate < weekStart) return false;
              } else {
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                if (dDate < monthStart) return false;
              }
              return !panelSearch ||
                d.product?.toLowerCase().includes(panelSearch.toLowerCase()) ||
                d.customer?.toLowerCase().includes(panelSearch.toLowerCase());
            }).map(d => (
            <div key={d.id} className="px-4 py-3 hover:bg-gray-50 transition">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{d.product}</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{d.customer}</p>
                  <p className="text-xs text-gray-400">
                    {[d.cases_of_6 && `${d.cases_of_6}×6`, d.cases_of_3 && `${d.cases_of_3}×3`, d.singles && `${d.singles} singles`].filter(Boolean).join(" · ")}
                  </p>
                  {d.reference && <p className="text-xs text-gray-400 font-mono">{d.reference}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-bold tabular-nums text-gray-900">{d.total_units}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(d.dispatch_date)}</p>
                  <button onClick={() => openEditDispatch(d)} className="text-xs text-brown/60 hover:text-brown hover:underline mt-1 block">Edit</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>
      </div>

      {/* Edit dispatch panel */}
      {editingDispatch && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/30" onClick={() => setEditingDispatch(null)} />
          <div className="w-full max-w-sm bg-white shadow-xl flex flex-col">
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Edit dispatch</h2>
              <button onClick={() => setEditingDispatch(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Product</label>
                  <input type="text" className="input w-full" value={editProduct} onChange={e => setEditProduct(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Customer</label>
                  <input type="text" className="input w-full" value={editCustomer} onChange={e => setEditCustomer(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Dispatch date</label>
                  <input type="date" className="input w-full" value={editDate} onChange={e => setEditDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Dispatched by</label>
                  <input type="text" className="input w-full" value={editDispatchedBy} onChange={e => setEditDispatchedBy(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Quantities</label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Cases ×6</label>
                    <input type="number" min="0" className="input w-full" value={editCasesOf6} onChange={e => setEditCasesOf6(e.target.value)} inputMode="numeric" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Cases ×3</label>
                    <input type="number" min="0" className="input w-full" value={editCasesOf3} onChange={e => setEditCasesOf3(e.target.value)} inputMode="numeric" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Singles</label>
                    <input type="number" min="0" className="input w-full" value={editSingles} onChange={e => setEditSingles(e.target.value)} inputMode="numeric" />
                  </div>
                </div>
                {(() => {
                  const t = Number(editCasesOf6) * 6 + Number(editCasesOf3) * 3 + Number(editSingles);
                  return t > 0 ? <p className="mt-1.5 text-xs text-gray-500">Total: <span className="font-semibold text-gray-900">{t} units</span></p> : null;
                })()}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Order reference</label>
                <input type="text" className="input w-full" value={editRef} onChange={e => setEditRef(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <input type="text" className="input w-full" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            {editError && (
              <div className="mx-6 mb-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {editError}
              </div>
            )}

            <div className="border-t border-gray-200 px-6 pt-3 pb-3 flex gap-3">
              <button onClick={() => setEditingDispatch(null)} className="btn-ghost flex-1">Cancel</button>
              <button onClick={saveEditDispatch} disabled={editSaving} className="btn-primary flex-1">
                {editSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
