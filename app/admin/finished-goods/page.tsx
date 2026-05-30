"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import type { Dispatch, FinishedGoodsAdjustment } from "@/lib/types";
import { formatDate } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProductionRecord {
  id: string;
  submitted_at: string;
  submitted_by: string;
  product: string;
  jars: number;
}

type EventType = "produced" | "dispatched" | "adjustment";

interface HistoryRow {
  date: string;
  product: string;
  event: EventType;
  units: number;
  by: string;
  submissionId?: string;
}

type Period = "week" | "month" | "all";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePeriodStart(period: Period): Date | null {
  const now = new Date();
  if (period === "week") {
    const daysFromMon = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const d = new Date(now);
    d.setDate(now.getDate() - daysFromMon);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return null;
}

const REASON_LABELS: Record<string, string> = {
  opening_stock:  "Opening stock entry",
  reconciliation: "Stock count correction",
  wastage:        "Wastage / write-off",
  other:          "Other",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinishedGoodsPage() {
  const { orgId } = useOrganisation();

  // Data
  const [productions, setProductions]   = useState<ProductionRecord[]>([]);
  const [dispatches, setDispatches]     = useState<Dispatch[]>([]);
  const [adjustments, setAdjustments]   = useState<FinishedGoodsAdjustment[]>([]);
  const [loading, setLoading]           = useState(true);

  // Filter bar
  const [search, setSearch]       = useState("");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");
  const [period, setPeriod]       = useState<Period>("all");

  // Reconcile panel
  const [reconProduct, setReconProduct]   = useState<string | null>(null);
  const [reconTarget, setReconTarget]     = useState("");
  const [reconReason, setReconReason]     = useState("reconciliation");
  const [reconNotes, setReconNotes]       = useState("");
  const [reconBy, setReconBy]             = useState("");
  const [reconSaving, setReconSaving]     = useState(false);
  const [reconError, setReconError]       = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);

    const [subRes, dispRes, adjRes] = await Promise.all([
      supabase
        .from("submissions")
        .select("id, submitted_at, submitted_by, checklist:checklists(name, category), answers(value, question:questions(type))")
        .order("submitted_at", { ascending: false }),
      supabase
        .from("dispatches")
        .select("*")
        .order("dispatch_date", { ascending: false }),
      supabase
        .from("finished_goods_adjustments")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    // Parse production submissions
    const prods: ProductionRecord[] = [];
    for (const sub of ((subRes.data ?? []) as any[])) {
      const cl = sub.checklist as { name: string; category: string } | null;
      if (!cl || cl.category !== "Production") continue;
      const product = cl.name.replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim();
      let jars = 0;
      for (const ans of ((sub.answers ?? []) as any[])) {
        if (ans.question?.type !== "packing_runs" || !ans.value) continue;
        try {
          const rows = JSON.parse(ans.value);
          if (Array.isArray(rows)) {
            for (const r of rows) jars += Number(r.jars_used) || 0;
          }
        } catch { /* ignore */ }
      }
      if (jars > 0) {
        prods.push({ id: sub.id, submitted_at: sub.submitted_at, submitted_by: sub.submitted_by, product, jars });
      }
    }

    setProductions(prods);
    setDispatches((dispRes.data ?? []) as Dispatch[]);
    setAdjustments((adjRes.data ?? []) as FinishedGoodsAdjustment[]);
    setLoading(false);
  }

  // ── Stock calculation (all-time, no filters) ──────────────────────────────

  const allProducts = Array.from(new Set([
    ...productions.map(p => p.product),
    ...dispatches.map(d => d.product),
    ...adjustments.map(a => a.product),
  ])).sort();

  function stockFor(product: string): number {
    const produced    = productions.filter(p => p.product === product).reduce((s, p) => s + p.jars, 0);
    const dispatched  = dispatches.filter(d => d.product === product).reduce((s, d) => s + d.total_units, 0);
    const adjusted    = adjustments.filter(a => a.product === product).reduce((s, a) => s + a.quantity, 0);
    return Math.max(0, produced + adjusted - dispatched);
  }

  // ── History rows (combined, sorted date desc) ─────────────────────────────

  const allHistory: HistoryRow[] = [
    ...productions.map(p => ({
      date: p.submitted_at,
      product: p.product,
      event: "produced" as EventType,
      units: p.jars,
      by: p.submitted_by,
      submissionId: p.id,
    })),
    ...dispatches.map(d => ({
      date: d.dispatch_date,
      product: d.product,
      event: "dispatched" as EventType,
      units: d.total_units,
      by: d.dispatched_by,
    })),
    ...adjustments.map(a => ({
      date: a.created_at,
      product: a.product,
      event: "adjustment" as EventType,
      units: a.quantity,
      by: a.created_by,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Apply filters
  const periodStart = period !== "all" && !dateFrom ? parsePeriodStart(period) : null;

  const filteredHistory = allHistory.filter(row => {
    const rowDate = new Date(row.date);
    if (search && !row.product.toLowerCase().includes(search.toLowerCase())) return false;
    if (dateFrom && rowDate < new Date(dateFrom)) return false;
    if (dateTo && rowDate > new Date(dateTo + "T23:59:59")) return false;
    if (periodStart && rowDate < periodStart) return false;
    return true;
  });

  // ── Reconcile submit ──────────────────────────────────────────────────────

  async function saveReconcile() {
    if (!reconProduct) return;
    const target = parseInt(reconTarget, 10);
    if (isNaN(target) || target < 0) { setReconError("Please enter a valid stock count"); return; }
    if (!reconBy.trim()) { setReconError("Please enter who is logging this"); return; }
    const current = stockFor(reconProduct);
    const quantity = target - current;

    setReconSaving(true);
    setReconError("");

    const { error } = await supabase.from("finished_goods_adjustments").insert({
      organisation_id: orgId,
      product: reconProduct,
      quantity,
      reason: reconReason,
      notes: reconNotes.trim() || null,
      created_by: reconBy.trim(),
    });

    setReconSaving(false);
    if (error) { setReconError(error.message); return; }
    setReconProduct(null);
    setReconTarget("");
    setReconReason("reconciliation");
    setReconNotes("");
    setReconBy("");
    await load();
  }

  function openReconcile(product: string) {
    setReconProduct(product);
    setReconTarget(String(stockFor(product)));
    setReconReason("reconciliation");
    setReconNotes("");
    setReconBy("");
    setReconError("");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-6xl w-full mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900">Finished Goods</h1>
          <Link href="/admin/goods-out" className="btn-primary text-sm">Log Dispatch →</Link>
        </div>

        {/* Current Stock cards */}
        {loading ? (
          <div className="card p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : allProducts.length === 0 ? (
          <div className="card p-8 text-center text-sm text-gray-400">No finished goods data yet.</div>
        ) : (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Current Stock</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {allProducts.map(product => {
                const inStock = stockFor(product);
                return (
                  <div key={product} className="card p-4 flex flex-col gap-2">
                    <p className="text-xs font-medium text-gray-500 truncate" title={product}>{product}</p>
                    <p className={`text-3xl font-bold tabular-nums ${inStock === 0 ? "text-gray-300" : "text-gray-900"}`}>
                      {inStock}
                    </p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">In Stock</p>
                    <button
                      onClick={() => openReconcile(product)}
                      className="mt-auto text-xs text-brown/70 hover:text-brown hover:underline text-left"
                    >
                      Reconcile
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="card p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-48">
              <label className="label text-xs mb-1 block">Search product</label>
              <input
                type="text"
                className="input w-full"
                placeholder="Filter by product name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div>
              <label className="label text-xs mb-1 block">From</label>
              <input
                type="date"
                className="input"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPeriod("all"); }}
              />
            </div>
            <div>
              <label className="label text-xs mb-1 block">To</label>
              <input
                type="date"
                className="input"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPeriod("all"); }}
              />
            </div>
            <div className="flex gap-1.5">
              {(["week", "month", "all"] as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => { setPeriod(p); setDateFrom(""); setDateTo(""); }}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    period === p && !dateFrom && !dateTo
                      ? "bg-brand border-brand/50 text-brown"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {p === "week" ? "This week" : p === "month" ? "This month" : "All time"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* History table */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            History
            {filteredHistory.length > 0 && (
              <span className="ml-2 text-gray-400 font-normal">({filteredHistory.length})</span>
            )}
          </h2>
          <div className="card overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
            ) : filteredHistory.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">No events match the current filters.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Event</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Jars / Units</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredHistory.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.product}</td>
                      <td className="px-4 py-3">
                        {row.event === "produced" ? (
                          row.submissionId ? (
                            <Link
                              href={`/submission/${row.submissionId}`}
                              className="inline-flex items-center gap-1 hover:underline"
                            >
                              <span className="inline-block rounded-full bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-0.5">
                                Produced
                              </span>
                            </Link>
                          ) : (
                            <span className="inline-block rounded-full bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-0.5">
                              Produced
                            </span>
                          )
                        ) : row.event === "dispatched" ? (
                          <span className="inline-block rounded-full bg-red-100 text-red-700 text-xs font-semibold px-2.5 py-0.5">
                            Dispatched
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-0.5">
                            Adjustment
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                        {row.event === "adjustment" && row.units > 0 ? "+" : ""}
                        {row.units}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{row.by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </main>

      {/* Reconcile slide-in panel */}
      {reconProduct && (() => {
        const current = stockFor(reconProduct);
        const targetNum = reconTarget === "" ? null : parseInt(reconTarget, 10);
        const delta = targetNum !== null && !isNaN(targetNum) ? targetNum - current : null;

        return (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={() => setReconProduct(null)} />
            <div className="w-full max-w-sm bg-white shadow-xl flex flex-col">
              <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Reconcile Stock</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{reconProduct}</p>
                </div>
                <button onClick={() => setReconProduct(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Current stock */}
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                  <p className="text-xs text-amber-700 font-medium">System stock count</p>
                  <p className="text-2xl font-bold text-amber-900 mt-0.5">{current} jars</p>
                </div>

                {/* Set stock to */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Set stock to (jars)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="input w-full"
                    placeholder="e.g. 48"
                    value={reconTarget}
                    onChange={e => setReconTarget(e.target.value)}
                  />
                  {delta !== null && !isNaN(delta) && (
                    <p className="mt-2 text-xs text-gray-600">
                      Adjustment:{" "}
                      <span className={`font-semibold ${delta >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {delta >= 0 ? "+" : ""}{delta} jars
                      </span>
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
                    {Object.entries(REASON_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Notes <span className="text-gray-400">(optional)</span>
                  </label>
                  <textarea
                    className="input w-full"
                    rows={2}
                    placeholder="e.g. Physical count on 30 May 2026"
                    value={reconNotes}
                    onChange={e => setReconNotes(e.target.value)}
                  />
                </div>

                {/* Logged by */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Logged by</label>
                  <input
                    type="text"
                    className="input w-full"
                    placeholder="Your name"
                    value={reconBy}
                    onChange={e => setReconBy(e.target.value)}
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
                  <button onClick={() => setReconProduct(null)} className="btn-secondary flex-1">Cancel</button>
                  <button
                    onClick={saveReconcile}
                    disabled={reconSaving || reconTarget === ""}
                    className="btn-primary flex-1"
                  >
                    {reconSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
