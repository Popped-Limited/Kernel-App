"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Dispatch, Submission, Checklist } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const SKUS = [
  "Garlic Chilli Oil",
  "Garlic Chilli Oil with Beef",
  "Sichuan Chilli Crisp",
  "Sichuan Chilli Crisp Double Heat",
  "Hunan Salted Chillies",
];

const CUSTOMERS = ["3PL", "Amazon", "Shopify", "Other"];

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

export default function GoodsOutPage() {
  const [recentDispatches, setRecentDispatches] = useState<Dispatch[]>([]);
  const [batchSubmissions, setBatchSubmissions] = useState<(Submission & { checklist: Checklist })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [rows, setRows] = useState<ProductRow[]>([emptyRow()]);
  const [customer, setCustomer] = useState("3PL");
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [dispatchedBy, setDispatchedBy] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    const [dispRes, subRes] = await Promise.all([
      supabase
        .from("dispatches")
        .select("*")
        .order("dispatch_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("submissions")
        .select("id, submitted_by, submitted_at, checklist:checklists(name, category)")
        .order("submitted_at", { ascending: false })
        .limit(100),
    ]);
    if (dispRes.data) setRecentDispatches(dispRes.data as Dispatch[]);
    if (subRes.data) {
      const productionOnly = (subRes.data as unknown as (Submission & { checklist: Checklist })[]).filter(
        s => s.checklist?.category === "Production"
      );
      setBatchSubmissions(productionOnly);
    }
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

  function validate() {
    const errs: Record<string, string> = {};
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
    }));

    const { error } = await supabase.from("dispatches").insert(inserts);
    setSaving(false);
    if (error) { alert("Failed to save — please try again."); return; }

    setSaved(true);
    setRows([emptyRow()]);
    setReference("");
    setNotes("");
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
            <h1 className="text-base font-semibold text-gray-900">Goods Out</h1>
          </div>
          <Link href="/admin/traceability" className="btn-secondary text-xs">Traceability</Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 space-y-6">
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Log dispatch</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Shared fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Customer *</label>
                <select value={customer} onChange={e => setCustomer(e.target.value)} className="input">
                  {CUSTOMERS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
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
                  placeholder="Your name"
                  autoComplete="name"
                />
                {errors.dispatchedBy && <p className="mt-1 text-xs text-red-600">{errors.dispatchedBy}</p>}
              </div>
            </div>

            {/* Product cards */}
            <div className="space-y-3">
              {rows.map((row, idx) => {
                const filteredBatches = row.product
                  ? batchSubmissions.filter(s => s.checklist?.name?.startsWith(row.product))
                  : batchSubmissions;
                const total = rowTotal(row);

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
                          {SKUS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        {errors[`product_${idx}`] && <p className="mt-0.5 text-xs text-red-500">{errors[`product_${idx}`]}</p>}
                      </div>

                      {/* Cases of 6 */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Cases of 6</label>
                        <input
                          type="number" min="0"
                          value={row.casesOf6}
                          onChange={e => updateRow(idx, "casesOf6", e.target.value)}
                          className="input text-sm py-1.5"
                          inputMode="numeric"
                        />
                      </div>

                      {/* Cases of 3 */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Cases of 3</label>
                        <input
                          type="number" min="0"
                          value={row.casesOf3}
                          onChange={e => updateRow(idx, "casesOf3", e.target.value)}
                          className="input text-sm py-1.5"
                          inputMode="numeric"
                        />
                      </div>

                      {/* Singles */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Singles</label>
                        <input
                          type="number" min="0"
                          value={row.singles}
                          onChange={e => updateRow(idx, "singles", e.target.value)}
                          className="input text-sm py-1.5"
                          inputMode="numeric"
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
                          {filteredBatches.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.checklist?.name?.replace(" — Production Record", "")} · {formatDate(s.submitted_at.slice(0, 10))} · {s.submitted_by}
                            </option>
                          ))}
                        </select>
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

        {/* Recent dispatches */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Recent dispatches</h2>
          {loading ? (
            <div className="card p-4 text-center text-sm text-gray-500">Loading…</div>
          ) : recentDispatches.length === 0 ? (
            <div className="card p-4 text-center text-sm text-gray-500">No dispatches logged yet.</div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Product</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Customer</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">×6</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">×3</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Singles</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Units</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Ref</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentDispatches.map(d => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(d.dispatch_date)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{d.product}</td>
                      <td className="px-4 py-3 text-gray-600">{d.customer}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">{d.cases_of_6 || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">{d.cases_of_3 || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">{d.singles || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{d.total_units}</td>
                      <td className="px-4 py-3 text-gray-500">{d.reference ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
