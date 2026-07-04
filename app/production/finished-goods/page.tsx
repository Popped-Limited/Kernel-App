"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import SaveButton from "@/components/SaveButton";
import { fetchAll } from "@/lib/fetchAll";
import { useOrganisation } from "@/contexts/OrganisationContext";
import type { Dispatch, FinishedGoodsAdjustment, GoodsReturn } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { expandRunValues } from "@/lib/production-runs";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProductionRecord {
  id: string;
  submitted_at: string;
  submitted_by: string;
  product: string;
  jars: number;
  batchCode: string | null;
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

interface BatchRow {
  code: string;
  date: string;
  produced: number;
  remaining: number;
}

type SortMode = "alpha" | "stock";
type Period = "this_week" | "last_week" | "this_month" | "last_month" | "all";

const PERIODS: [Period, string][] = [
  ["this_week",  "This week"],
  ["last_week",  "Last week"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["all",        "All time"],
];

// ── Helpers ───────────────────────────────────────────────────────────────────

// [start, end) — end is exclusive (start of the day after the range ends).
// null means "all time" (no bounds).
function periodBounds(period: Period): [Date, Date] | null {
  if (period === "all") return null;
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // Week starts Monday
  const dow = (now.getDay() + 6) % 7;
  const monday = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow));
  if (period === "this_week") {
    const end = new Date(monday); end.setDate(end.getDate() + 7);
    return [monday, end];
  }
  if (period === "last_week") {
    const start = new Date(monday); start.setDate(start.getDate() - 7);
    return [start, monday];
  }
  if (period === "this_month") {
    return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
  }
  // last_month
  return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1)];
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
  const [returns,       setReturns]       = useState<GoodsReturn[]>([]);
  const [adjustments,   setAdjustments]   = useState<FinishedGoodsAdjustment[]>([]);
  const [allChecklists, setAllChecklists] = useState<string[]>([]); // all active product names
  const [loading,       setLoading]       = useState(true);

  // Table controls
  const [sortMode,    setSortMode]    = useState<SortMode>("alpha");
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());
  const [period,      setPeriod]      = useState<Period>("this_week");

  // History filter bar
  const [search, setSearch] = useState("");

  // Reconcile panel
  const [reconProduct, setReconProduct] = useState<string | null>(null);
  const [reconTarget,  setReconTarget]  = useState("");
  const [reconReason,  setReconReason]  = useState("reconciliation");
  const [reconNotes,   setReconNotes]   = useState("");
  const [reconBatch,   setReconBatch]   = useState("");
  const [reconBy,      setReconBy]      = useState("");
  const [reconSaving,  setReconSaving]  = useState(false);
  const [reconError,   setReconError]   = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);

    // Every query is paginated past PostgREST's 1000-row cap — an un-ranged
    // select stops at 1000 rows, which would silently drop older production
    // runs, dispatches or reconciliations and corrupt the stock figures.
    const [subData, dispData, retData, adjData, clData] = await Promise.all([
      fetchAll<any>((from, to) => supabase
        .from("submissions")
        .select("id, submitted_at, submitted_by, checklist:checklists(name, category), answers(value, question:questions(type, label))")
        .order("submitted_at", { ascending: false })
        .range(from, to)),
      fetchAll<Dispatch>((from, to) => supabase
        .from("dispatches")
        .select("*")
        .order("dispatch_date", { ascending: false })
        .range(from, to)),
      fetchAll<GoodsReturn>((from, to) => supabase
        .from("goods_returns")
        .select("*")
        .order("return_date", { ascending: false })
        .range(from, to)),
      fetchAll<FinishedGoodsAdjustment>((from, to) => supabase
        .from("finished_goods_adjustments")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to)),
      // Fetch all active production checklists so every product has a row
      // even before its first production run
      fetchAll<{ name: string }>((from, to) => supabase
        .from("checklists")
        .select("name")
        .eq("category", "Production")
        .eq("active", true)
        .order("name")
        .range(from, to)),
    ]);

    // Parse production submissions → prefer "Total units produced" field, fall back to jars_used
    const prods: ProductionRecord[] = [];
    for (const sub of (subData as any[])) {
      const cl = sub.checklist as { name: string; category: string } | null;
      if (!cl || cl.category !== "Production") continue;
      const product = cl.name.replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim();
      let totalUnits = 0;
      let jarsUsedFallback = 0;
      let batchCode: string | null = null;
      for (const ans of ((sub.answers ?? []) as any[])) {
        if (!ans.value) continue;
        const label = (ans.question?.label ?? "").toLowerCase();
        // Prefer explicit "total units produced" answer
        if (label.includes("total units produced")) {
          totalUnits += Number(ans.value) || 0;
        }
        // Capture the batch code so reconciliations can be tied to a batch.
        // Must be a text field — otherwise the checkbox "Labelling verified —
        // correct batch code…" matches and stores its "true" value as a batch.
        if (!batchCode && ans.question?.type === "text" && ans.value.trim() &&
            (label.includes("batch code") || label.includes("julian") || label.includes("batch ref") || label.includes("lot number"))) {
          batchCode = ans.value.trim();
        }
        // Fallback: sum jars_used from packing_runs (across all runs of the record)
        if (ans.question?.type === "packing_runs") {
          for (const v of expandRunValues(ans.value)) {
            try {
              const rows = JSON.parse(v);
              if (Array.isArray(rows)) for (const r of rows) jarsUsedFallback += Number(r.jars_used) || 0;
            } catch { /* ignore */ }
          }
        }
      }
      const jars = totalUnits > 0 ? totalUnits : jarsUsedFallback;
      if (jars > 0) prods.push({ id: sub.id, submitted_at: sub.submitted_at, submitted_by: sub.submitted_by, product, jars, batchCode });
    }

    // All active product names from checklists
    const clProducts = clData.map((c: { name: string }) =>
      c.name.replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim()
    );

    setProductions(prods);
    setDispatches(dispData);
    setReturns(retData);
    setAdjustments(adjData);
    setAllChecklists(clProducts);
    setLoading(false);
  }

  // ── Derived product list (checklists + any product in dispatches/adjustments) ─

  const allProducts = useMemo(() => {
    const set = new Set<string>([
      ...allChecklists,
      ...dispatches.map(d => d.product),
      ...returns.map(r => r.product),
      ...adjustments.map(a => a.product),
    ]);
    return [...set].sort();
  }, [allChecklists, dispatches, returns, adjustments]);

  // ── Per-product stats ─────────────────────────────────────────────────────

  const bounds = useMemo(() => periodBounds(period), [period]);
  const inBounds = (iso: string) => {
    if (!bounds) return true;
    const t = new Date(iso).getTime();
    return t >= bounds[0].getTime() && t < bounds[1].getTime();
  };

  function producedInPeriod(product: string) {
    return productions
      .filter(p => p.product === product && inBounds(p.submitted_at))
      .reduce((s, p) => s + p.jars, 0);
  }

  function dispatchedInPeriod(product: string) {
    return dispatches
      .filter(d => d.product === product && inBounds(d.dispatch_date))
      .reduce((s, d) => s + d.total_units, 0);
  }

  // In Stock = the sum of what's actually left in each batch. Stock that isn't
  // tied to a batch (opening-stock seeds, product-level corrections) isn't
  // traceable and doesn't count, so this total always equals the batch
  // breakdown below it. Over-dispatched batches floor at 0 (never negative).
  function stockFor(product: string) {
    return batchBreakdown(product).reduce((s, b) => s + b.remaining, 0);
  }

  // ── Per-batch breakdown ─────────────────────────────────────────────────────
  // Stock remaining for each batch of a product: produced − dispatched + returns
  // + batch-tagged adjustments. Dispatches/returns link to a production batch via
  // batch_submission_id; adjustments (samples, wastage, count corrections) link by
  // batch_code. Used by both the expandable per-product breakdown and the reconcile
  // batch picker so the two never disagree.
  function batchBreakdown(product: string): BatchRow[] {
    const prodList = productions.filter(p => p.product === product && p.batchCode);

    const subToCode: Record<string, string> = {};
    const producedByCode: Record<string, number> = {};
    const dateByCode: Record<string, string> = {};
    for (const p of prodList) {
      const code = p.batchCode!;
      subToCode[p.id] = code;
      producedByCode[code] = (producedByCode[code] ?? 0) + p.jars;
      if (!dateByCode[code] || new Date(p.submitted_at) > new Date(dateByCode[code])) {
        dateByCode[code] = p.submitted_at;
      }
    }

    // net OUT of each batch (positive = left stock)
    const netOutByCode: Record<string, number> = {};
    for (const d of dispatches) {
      if (d.product !== product || !d.batch_submission_id) continue;
      const code = subToCode[d.batch_submission_id];
      if (!code) continue;
      netOutByCode[code] = (netOutByCode[code] ?? 0) + d.total_units;
    }
    for (const r of returns) {
      if (r.product !== product || !r.batch_submission_id) continue;
      const code = subToCode[r.batch_submission_id];
      if (!code) continue;
      netOutByCode[code] = (netOutByCode[code] ?? 0) - r.quantity;
    }
    // Batch-tagged adjustments: negative quantity (e.g. a sample taken) reduces the
    // batch; positive (a count correction up) increases it. Only apply to batches we
    // actually produced — an untagged/opening-stock adjustment stays product-level.
    for (const a of adjustments) {
      if (a.product !== product || !a.batch_code) continue;
      if (!(a.batch_code in producedByCode)) continue;
      netOutByCode[a.batch_code] = (netOutByCode[a.batch_code] ?? 0) - a.quantity;
    }

    return Object.keys(producedByCode)
      .map(code => ({
        code,
        date: dateByCode[code],
        produced: producedByCode[code],
        remaining: Math.max(0, producedByCode[code] - (netOutByCode[code] ?? 0)),
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  // Per-product batch breakdown, computed once. Powers the expandable rows, the
  // over-dispatch warning and the reconcile picker — one source so they agree.
  const breakdownByProduct = useMemo(() => {
    const map: Record<string, BatchRow[]> = {};
    for (const product of allProducts) map[product] = batchBreakdown(product);
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allProducts, productions, dispatches, returns, adjustments]);

  // ── Sorted product rows ───────────────────────────────────────────────────

  const sortedProducts = useMemo(() => {
    const list = [...allProducts];
    if (sortMode === "alpha") return list; // already sorted a-z
    return list.sort((a, b) => stockFor(b) - stockFor(a)); // highest stock first
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allProducts, sortMode, productions, dispatches, adjustments, returns]);

  function toggleExpanded(product: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(product)) next.delete(product); else next.add(product);
      return next;
    });
  }

  // ── History rows ──────────────────────────────────────────────────────────

  const allHistory: HistoryRow[] = useMemo(() => [
    ...productions.map(p => ({ date: p.submitted_at, product: p.product, event: "produced" as EventType, units: p.jars, by: p.submitted_by, submissionId: p.id })),
    ...dispatches.map(d => ({ date: d.dispatch_date, product: d.product, event: "dispatched" as EventType, units: d.total_units, by: d.dispatched_by })),
    ...adjustments.map(a => ({ date: a.created_at, product: a.product, event: "adjustment" as EventType, units: a.quantity, by: a.batch_code ? `${a.created_by} · Batch ${a.batch_code}` : a.created_by })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [productions, dispatches, adjustments]);

  const filteredHistory = allHistory.filter(row => {
    if (row.event !== "produced") return false; // production panel only
    if (search && !row.product.toLowerCase().includes(search.toLowerCase())) return false;
    if (!inBounds(row.date)) return false;
    return true;
  });

  // ── Reconcile ─────────────────────────────────────────────────────────────

  function openReconcile(product: string) {
    setReconProduct(product);
    setReconTarget(String(stockFor(product)));
    setReconReason("reconciliation");
    setReconNotes("");
    setReconBatch("");
    setReconBy("");
    setReconError("");
  }

  // Batches the user can reconcile against — only those with stock remaining.
  // A batch that's sold out (0 remaining) can't have stock taken off it, so it's
  // hidden from the picker.
  const reconBatches = reconProduct
    ? (breakdownByProduct[reconProduct] ?? []).filter(b => b.remaining > 0)
    : [];

  async function saveReconcile() {
    if (!reconProduct) return;
    const target = parseInt(reconTarget, 10);
    if (isNaN(target) || target < 0) { setReconError("Please enter a valid stock count"); return; }
    if (!reconBy.trim()) { setReconError("Please enter who is logging this"); return; }
    const quantity = target - stockFor(reconProduct);
    // Reducing stock (sample, wastage, count-down) must name the batch it came
    // off — same as a dispatch — or per-batch traceability silently drifts.
    // Increases (opening stock, count-up) have no batch and stay product-level.
    if (quantity < 0 && !reconBatch) {
      setReconError("Select which batch this came off — required for traceability when reducing stock.");
      return;
    }
    // Can't take more off a batch than it has left (mirrors the Goods Out guard).
    if (quantity < 0 && reconBatch) {
      const batch = reconBatches.find(b => b.code === reconBatch);
      if (batch && -quantity > batch.remaining) {
        setReconError(`Batch ${reconBatch} only has ${batch.remaining.toLocaleString()} left — can't remove ${(-quantity).toLocaleString()}.`);
        return;
      }
    }
    setReconSaving(true);
    setReconError("");
    const { error } = await supabase.from("finished_goods_adjustments").insert({
      organisation_id: orgId,
      product: reconProduct,
      quantity,
      reason: reconReason,
      notes: reconNotes.trim() || null,
      batch_code: reconBatch || null,
      created_by: reconBy.trim(),
    });
    setReconSaving(false);
    if (error) { setReconError(error.message); return; }
    setReconProduct(null);
    await load();
  }

  const periodLabel = PERIODS.find(([p]) => p === period)?.[1] ?? "";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex flex-1 min-h-0">
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900">Finished Goods</h1>
          <Link href="/production/goods-out" className="btn-primary text-sm">Log Dispatch →</Link>
        </div>

        {/* Period toggle — drives the Produced / Dispatched columns and the side panel */}
        <div className="flex flex-wrap gap-2">
          {PERIODS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                period === key
                  ? "bg-brand text-brown"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
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
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Produced</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dispatched</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">In Stock</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedProducts.map(product => {
                  const pPeriod = producedInPeriod(product);
                  const dPeriod = dispatchedInPeriod(product);
                  const stock   = stockFor(product);
                  const isOpen  = expanded.has(product);
                  const batches = breakdownByProduct[product] ?? [];
                  return (
                    <Fragment key={product}>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => toggleExpanded(product)}
                            aria-label={isOpen ? "Hide batches" : "Show batches"}
                            aria-expanded={isOpen}
                            className="shrink-0 text-gray-400 hover:text-brown p-0.5 -ml-0.5"
                          >
                            <svg
                              className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
                              viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
                            >
                              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
                            </svg>
                          </button>
                          <Link
                            href={`/production/finished-goods/${encodeURIComponent(product)}`}
                            className="font-medium text-gray-900 hover:text-brown hover:underline"
                          >
                            {product}
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {pPeriod > 0 ? pPeriod.toLocaleString() : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {dPeriod > 0 ? dPeriod.toLocaleString() : <span className="text-gray-300">—</span>}
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
                    {isOpen && (
                      <tr className="bg-gray-50/60">
                        <td colSpan={5} className="px-4 py-3">
                          {batches.length === 0 ? (
                            <p className="text-xs text-gray-400 pl-6">No batch codes recorded for this product yet.</p>
                          ) : (
                            <div className="ml-6 rounded-lg border border-gray-200 overflow-hidden bg-white">
                              <table className="w-full text-xs">
                                <thead className="bg-gray-100/70 text-gray-500">
                                  <tr>
                                    <th className="text-left px-3 py-2 font-semibold uppercase tracking-wide">Batch</th>
                                    <th className="text-left px-3 py-2 font-semibold uppercase tracking-wide">Produced on</th>
                                    <th className="text-right px-3 py-2 font-semibold uppercase tracking-wide">Produced</th>
                                    <th className="text-right px-3 py-2 font-semibold uppercase tracking-wide">In stock</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {batches.map(b => (
                                    <tr key={b.code}>
                                      <td className="px-3 py-2 font-mono text-gray-700">{b.code}</td>
                                      <td className="px-3 py-2 text-gray-500">{formatDate(b.date)}</td>
                                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">{b.produced.toLocaleString()}</td>
                                      <td className="px-3 py-2 text-right tabular-nums">
                                        {b.remaining === 0
                                          ? <span className="text-gray-400">Sold out</span>
                                          : <span className="font-semibold text-gray-900">{b.remaining.toLocaleString()}</span>}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="border-t border-gray-200 bg-gray-50">
                                  <tr>
                                    <td className="px-3 py-2 font-semibold text-gray-700" colSpan={3}>Total in stock</td>
                                    <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-900">{stock.toLocaleString()}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>
      </main>

      {/* Right panel — history */}
      <aside className="hidden lg:flex flex-col w-80 shrink-0 sticky top-0 h-screen border-l border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-gray-900">
              Production
              {filteredHistory.length > 0 && <span className="ml-1.5 text-gray-400 font-normal text-xs">({filteredHistory.length})</span>}
            </h2>
          </div>
          <p className="text-xs text-gray-400 mb-3">{periodLabel}</p>
          <input
            type="text"
            className="input w-full text-sm"
            placeholder="Search product…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {loading ? (
            <div className="p-4 text-sm text-gray-400 text-center">Loading…</div>
          ) : filteredHistory.length === 0 ? (
            <div className="p-4 text-sm text-gray-400 text-center">No production in this period.</div>
          ) : filteredHistory.map((row, i) => (
            <div key={i} className="px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {row.submissionId
                      ? <Link href={`/submission/${row.submissionId}`} className="hover:underline">{row.product}</Link>
                      : row.product}
                  </p>
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
        // Reducing stock requires naming the batch (traceability); increases don't.
        const reducing = delta !== null && !isNaN(delta) && delta < 0;
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Batch {reducing
                      ? <span className="text-red-400">*</span>
                      : <span className="text-gray-400">(optional)</span>}
                  </label>
                  <select
                    className={`input w-full ${reducing && !reconBatch ? "border-red-300" : ""}`}
                    value={reconBatch}
                    onChange={e => setReconBatch(e.target.value)}
                  >
                    <option value="">{reducing ? "Select the batch this came off…" : "— No specific batch —"}</option>
                    {reconBatches.map(b => (
                      <option key={b.code} value={b.code}>
                        {b.code} · {formatDate(b.date)} · {b.remaining} in stock
                      </option>
                    ))}
                  </select>
                  {reducing && (
                    <p className="mt-1 text-[11px] text-gray-500">
                      Required when removing stock, so the batch it came off stays traceable.
                    </p>
                  )}
                  {reconBatches.length === 0 && (
                    <p className="mt-1 text-[11px] text-gray-400">No batches with stock remaining for this product.</p>
                  )}
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
                <SaveButton onClick={saveReconcile} saving={reconSaving} disabled={reconTarget === ""} className="btn-primary flex-1">
                  Save
                </SaveButton>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
