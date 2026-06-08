"use client";

import { useEffect, useState, useMemo } from "react";
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

type SortMode = "alpha" | "stock";
type Period = "week" | "month";

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
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
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
  const [productions,   setProductions]   = useState<ProductionRecord[]>([]);
  const [dispatches,    setDispatches]     = useState<Dispatch[]>([]);
  const [adjustments,   setAdjustments]   = useState<FinishedGoodsAdjustment[]>([]);
  const [allChecklists, setAllChecklists] = useState<string[]>([]); // all active product names
  const [loading,       setLoading]       = useState(true);

  // Table controls
  const [sortMode,    setSortMode]    = useState<SortMode>("alpha");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // History filter bar
  const [search,   setSearch]   = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [period,   setPeriod]   = useState<Period>("week");

  // Reconcile panel
  const [reconProduct, setReconProduct] = useState<string | null>(null);
  const [reconTarget,  setReconTarget]  = useState("");
  const [reconReason,  setReconReason]  = useState("reconciliation");
  const [reconNotes,   setReconNotes]   = useState("");
  const [reconBy,      setReconBy]      = useState("");
  const [reconSaving,  setReconSaving]  = useState(false);
  const [reconError,   setReconError]   = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);

    const [subRes, dispRes, adjRes, clRes] = await Promise.all([
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
      // Fetch all active production checklists so every product has a row
      // even before its first production run
      supabase
        .from("checklists")
        .select("name")
        .eq("category", "Production")
        .eq("active", true)
        .order("name"),
    ]);

    // Parse production submissions → extract jar counts per submission
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
          if (Array.isArray(rows)) for (const r of rows) jars += Number(r.jars_used) || 0;
        } catch { /* ignore */ }
      }
      if (jars > 0) prods.push({ id: sub.id, submitted_at: sub.submitted_at, submitted_by: sub.submitted_by, product, jars });
    }

    // All active product names from checklists
    const clProducts = (clRes.data ?? []).map((c: { name: string }) =>
      c.name.replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim()
    );

    setProductions(prods);
    setDispatches((dispRes.data ?? []) as Dispatch[]);
    setAdjustments((adjRes.data ?? []) as FinishedGoodsAdjustment[]);
    setAllChecklists(clProducts);
    setLoading(false);
  }

  // ── Derived product list (checklists + any product in dispatches/adjustments) ─

  const allProducts = useMemo(() => {
    const set = new Set<string>([
      ...allChecklists,
      ...dispatches.map(d => d.product),
      ...adjustments.map(a => a.product),
    ]);
    return [...set].sort();
  }, [allChecklists, dispatches, adjustments]);

  // ── Per-product stats ─────────────────────────────────────────────────────

  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  function producedAllTime(product: string) {
    return productions.filter(p => p.product === product).reduce((s, p) => s + p.jars, 0);
  }

  function producedLast30(product: string) {
    return productions
      .filter(p => p.product === product && new Date(p.submitted_at) >= thirtyDaysAgo)
      .reduce((s, p) => s + p.jars, 0);
  }

  function dispatchedLast30(product: string) {
    return dispatches
      .filter(d => d.product === product && new Date(d.dispatch_date) >= thirtyDaysAgo)
      .reduce((s, d) => s + d.total_units, 0);
  }

  function stockFor(product: string) {
    const produced   = producedAllTime(product);
    const dispatched = dispatches.filter(d => d.product === product).reduce((s, d) => s + d.total_units, 0);
    const adjusted   = adjustments.filter(a => a.product === product).reduce((s, a) => s + a.quantity, 0);
    return Math.max(0, produced + adjusted - dispatched);
  }

  // ── Sorted product rows ───────────────────────────────────────────────────

  const sortedProducts = useMemo(() => {
    const list = [...allProducts];
    if (sortMode === "alpha") return list; // already sorted a-z
    return list.sort((a, b) => stockFor(b) - stockFor(a)); // highest stock first
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allProducts, sortMode, productions, dispatches, adjustments]);

  // ── History rows ──────────────────────────────────────────────────────────

  const allHistory: HistoryRow[] = useMemo(() => [
    ...productions.map(p => ({ date: p.submitted_at, product: p.product, event: "produced" as EventType, units: p.jars, by: p.submitted_by, submissionId: p.id })),
    ...dispatches.map(d => ({ date: d.dispatch_date, product: d.product, event: "dispatched" as EventType, units: d.total_units, by: d.dispatched_by })),
    ...adjustments.map(a => ({ date: a.created_at, product: a.product, event: "adjustment" as EventType, units: a.quantity, by: a.created_by })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [productions, dispatches, adjustments]);

  const periodStart = !dateFrom ? parsePeriodStart(period) : null;
  const filteredHistory = allHistory.filter(row => {
    if (row.event !== "produced") return false; // production panel only
    const rowDate = new Date(row.date);
    if (search && !row.product.toLowerCase().includes(search.toLowerCase())) return false;
    if (dateFrom && rowDate < new Date(dateFrom)) return false;
    if (dateTo && rowDate > new Date(dateTo + "T23:59:59")) return false;
    if (periodStart && rowDate < periodStart) return false;
    return true;
  });

  // ── Reconcile ─────────────────────────────────────────────────────────────

  function openReconcile(product: string) {
    setReconProduct(product);
    setReconTarget(String(stockFor(product)));
    setReconReason("reconciliation");
    setReconNotes("");
    setReconBy("");
    setReconError("");
  }

  async function saveReconcile() {
    if (!reconProduct) return;
    const target = parseInt(reconTarget, 10);
    if (isNaN(target) || target < 0) { setReconError("Please enter a valid stock count"); return; }
    if (!reconBy.trim()) { setReconError("Please enter who is logging this"); return; }
    const quantity = target - stockFor(reconProduct);
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
    await load();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex flex-1 min-h-0">
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900">Finished Goods</h1>
          <Link href="/admin/goods-out" className="btn-primary text-sm">Log Dispatch →</Link>
        </div>

        {/* Products table */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-700">All Products</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Sort:</span>
              <button
                onClick={() => setSortMode("alpha")}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${sortMode === "alpha" ? "bg-brown text-white border-brown" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}
              >
                A → Z
              </button>
              <button
                onClick={() => setSortMode("stock")}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${sortMode === "stock" ? "bg-brown text-white border-brown" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}
              >
                By stock
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : sortedProducts.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              No products yet. Create a Production checklist to add one.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50/50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Produced (30 days)</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dispatched (30 days)</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">In Stock</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedProducts.map(product => {
                  const p30  = producedLast30(product);
                  const d30  = dispatchedLast30(product);
                  const stock = stockFor(product);
                  return (
                    <tr key={product} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{product}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {p30 > 0 ? p30.toLocaleString() : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {d30 > 0 ? d30.toLocaleString() : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={`text-base font-bold ${stock === 0 ? "text-gray-300" : "text-gray-900"}`}>
                          {stock.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openReconcile(product)}
                          className="text-xs text-brown/60 hover:text-brown hover:underline"
                        >
                          Reconcile
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>
      </main>

      {/* Right panel — history */}
      <aside className="hidden lg:flex flex-col w-96 shrink-0 sticky top-0 h-screen border-l border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Recent Production
              {filteredHistory.length > 0 && <span className="ml-1.5 text-gray-400 font-normal text-xs">({filteredHistory.length})</span>}
            </h2>
          </div>
          <input
            type="text"
            className="input w-full text-xs mb-2"
            placeholder="Search product…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="flex gap-1">
            {(["week", "month"] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setDateFrom(""); setDateTo(""); }}
                className={`flex-1 px-2 py-1.5 rounded text-xs font-medium border transition-colors ${period === p ? "bg-brand border-brand/50 text-brown" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}
              >
                {p === "week" ? "This Week" : "This Month"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {loading ? (
            <div className="p-4 text-sm text-gray-400 text-center">Loading…</div>
          ) : filteredHistory.length === 0 ? (
            <div className="p-4 text-sm text-gray-400 text-center">No events found.</div>
          ) : filteredHistory.map((row, i) => (
            <div key={i} className="px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="mb-0.5">
                    {row.event === "produced" ? (
                      row.submissionId
                        ? <Link href={`/submission/${row.submissionId}`} className="inline-block rounded-full bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 hover:opacity-80">PRODUCED</Link>
                        : <span className="inline-block rounded-full bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5">PRODUCED</span>
                    ) : row.event === "dispatched" ? (
                      <span className="inline-block rounded-full bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5">DISPATCHED</span>
                    ) : (
                      <span className="inline-block rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5">ADJUSTMENT</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">{row.product}</p>
                  <p className="text-xs text-gray-400">{row.by}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums text-gray-900">
                    {row.event === "adjustment" && row.units > 0 ? "+" : ""}{row.units}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(row.date)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>
      </div>

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
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                  <p className="text-xs text-amber-700 font-medium">System stock count</p>
                  <p className="text-2xl font-bold text-amber-900 mt-0.5">{current} jars</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Set stock to (jars)</label>
                  <input type="number" min="0" step="1" className="input w-full" placeholder="e.g. 48" value={reconTarget} onChange={e => setReconTarget(e.target.value)} />
                  {delta !== null && !isNaN(delta) && (
                    <p className="mt-2 text-xs text-gray-600">
                      Adjustment: <span className={`font-semibold ${delta >= 0 ? "text-green-700" : "text-red-600"}`}>{delta >= 0 ? "+" : ""}{delta} jars</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
                  <select className="input w-full" value={reconReason} onChange={e => setReconReason(e.target.value)}>
                    {Object.entries(REASON_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
                  <textarea className="input w-full" rows={2} placeholder="e.g. Physical count on 30 May 2026" value={reconNotes} onChange={e => setReconNotes(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Logged by</label>
                  <input type="text" className="input w-full" placeholder="e.g. Head of Popping" value={reconBy} onChange={e => setReconBy(e.target.value)} />
                </div>
              </div>
              {reconError && <div className="mx-6 mb-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{reconError}</div>}
              <div className="border-t border-gray-200 px-6 pt-3 pb-3 flex gap-3">
                <button onClick={() => setReconProduct(null)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={saveReconcile} disabled={reconSaving || reconTarget === ""} className="btn-primary flex-1">
                  {reconSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
