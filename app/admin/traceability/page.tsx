"use client";
import BackButton from "@/components/BackButton";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatDate, formatDateTime } from "@/lib/utils";

interface LotInfo {
  id: string;
  julian_code: string;
  quantity_received_g: number;
  quantity_remaining_g: number;
  received_date: string;
  supplier: string | null;
  best_before_date: string | null;
  created_by: string;
  ingredient: { name: string };
}

interface BatchInfo {
  id: string;
  submitted_by: string;
  submitted_at: string;
  checklist: { name: string };
  answers: Array<{ value: string | null; question: { type: string; label: string } }>;
}

interface DispatchInfo {
  id: string;
  dispatch_date: string;
  product: string;
  customer: string;
  cases_of_6: number;
  cases_of_3: number;
  singles: number;
  total_units: number;
  reference: string | null;
  dispatched_by: string;
  notes: string | null;
}

interface TraceResult {
  searchType: "lot" | "batch" | "ingredient" | "product";
  query: string;
  lots: LotInfo[];
  batches: BatchInfo[];
  dispatches: DispatchInfo[];
}

export default function TraceabilityPage() {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<"lot" | "batch" | "ingredient" | "product">("ingredient");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TraceResult | null>(null);
  const [error, setError] = useState("");
  // Ingredient search: step 1 shows matching lots to pick from
  const [ingredientLots, setIngredientLots] = useState<LotInfo[] | null>(null);
  // Keep the lot list so user can go back to it after drilling in
  const [savedIngredientLots, setSavedIngredientLots] = useState<LotInfo[] | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setIngredientLots(null);

    try {
      if (searchType === "lot") {
        await searchByLot(query.trim());
      } else if (searchType === "batch") {
        await searchByBatch(query.trim());
      } else if (searchType === "product") {
        await searchByProduct(query.trim());
      } else {
        await searchByIngredient(query.trim());
      }
    } catch {
      setError("Search failed — please try again.");
    }
    setLoading(false);
  }

  async function searchByLot(julianCode: string) {
    // 1. Find the lot(s) matching this Julian code
    const { data: lots } = await supabase
      .from("ingredient_lots")
      .select("*, ingredient:ingredients(name)")
      .ilike("julian_code", `%${julianCode}%`);

    if (!lots || lots.length === 0) {
      setError(`No ingredient lots found with Julian code matching "${julianCode}".`);
      return;
    }

    const lotIds = lots.map((l: LotInfo) => l.id);

    // 2. Find all batch record submissions that used these lot IDs
    const { data: answers } = await supabase
      .from("answers")
      .select("submission_id, value, question:questions(type)")
      .eq("questions.type", "ingredient_table");

    const matchedSubmissionIds = new Set<string>();
    for (const ans of (answers ?? [])) {
      if (!ans.value) continue;
      try {
        const parsed = JSON.parse(ans.value);
        if (Array.isArray(parsed)) {
          for (const row of parsed) {
            const rowLots = row.lots ?? [];
            for (const rl of rowLots) {
              if (lotIds.includes(rl.lot_id)) {
                matchedSubmissionIds.add(ans.submission_id);
              }
            }
          }
        }
      } catch { /* ignore */ }
    }

    // 3. Fetch those submissions
    const submissionIds = Array.from(matchedSubmissionIds);
    let batches: BatchInfo[] = [];
    if (submissionIds.length > 0) {
      const { data: subs } = await supabase
        .from("submissions")
        .select("id, submitted_by, submitted_at, checklist:checklists(name), answers(value, question:questions(type, label))")
        .in("id", submissionIds);
      batches = (subs ?? []) as unknown as BatchInfo[];
    }

    // 4. Find dispatches linked to these batch submissions
    let dispatches: DispatchInfo[] = [];
    if (submissionIds.length > 0) {
      const { data: disps } = await supabase
        .from("dispatches")
        .select("*")
        .in("batch_submission_id", submissionIds);
      dispatches = (disps ?? []) as DispatchInfo[];
    }

    setResult({ searchType: "lot", query: julianCode, lots: lots as LotInfo[], batches, dispatches });
  }

  async function searchByBatch(julianCode: string) {
    // Find submissions where the batch code answer matches this Julian code
    const { data: matchingAnswers } = await supabase
      .from("answers")
      .select("submission_id, value, question:questions(label)")
      .ilike("value", `%${julianCode}%`);

    const submissionIds = [
      ...new Set(
        (matchingAnswers ?? [])
          .filter((a) => {
            const label = (a.question as unknown as { label: string })?.label?.toLowerCase() ?? "";
            return label.includes("batch") || label.includes("julian");
          })
          .map((a) => a.submission_id)
      ),
    ];

    if (submissionIds.length === 0) {
      setError(`No batch records found for Julian code "${julianCode}".`);
      return;
    }

    const { data: subs } = await supabase
      .from("submissions")
      .select("id, submitted_by, submitted_at, checklist:checklists(name), answers(value, question:questions(type, label))")
      .in("id", submissionIds);

    if (!subs || subs.length === 0) {
      setError(`No batch records found for Julian code "${julianCode}".`);
      return;
    }

    const batches = subs as unknown as BatchInfo[];

    // Find which lots were used
    const lotIds = new Set<string>();
    for (const batch of batches) {
      for (const ans of (batch.answers ?? [])) {
        if (!ans.value || ans.question?.type !== "ingredient_table") continue;
        try {
          const parsed = JSON.parse(ans.value);
          if (Array.isArray(parsed)) {
            for (const row of parsed) {
              for (const rl of (row.lots ?? [])) {
                if (rl.lot_id) lotIds.add(rl.lot_id);
              }
            }
          }
        } catch { /* ignore */ }
      }
    }

    let lots: LotInfo[] = [];
    if (lotIds.size > 0) {
      const { data: lotsData } = await supabase
        .from("ingredient_lots")
        .select("*, ingredient:ingredients(name)")
        .in("id", Array.from(lotIds));
      lots = (lotsData ?? []) as LotInfo[];
    }

    // Forward: dispatches from these batch records
    const { data: disps } = await supabase
      .from("dispatches")
      .select("*")
      .in("batch_submission_id", submissionIds);

    setResult({ searchType: "batch", query: julianCode, lots, batches, dispatches: (disps ?? []) as DispatchInfo[] });
  }

  async function searchByIngredient(name: string) {
    // Find matching ingredients
    const { data: ingredients } = await supabase
      .from("ingredients")
      .select("id, name")
      .ilike("name", `%${name}%`);

    if (!ingredients || ingredients.length === 0) {
      setError(`No ingredients found matching "${name}".`);
      return;
    }

    const ingredientIds = ingredients.map((i: { id: string }) => i.id);

    // Get all lots for those ingredients, newest first
    const { data: lots } = await supabase
      .from("ingredient_lots")
      .select("*, ingredient:ingredients(name)")
      .in("ingredient_id", ingredientIds)
      .order("received_date", { ascending: false });

    if (!lots || lots.length === 0) {
      setError(`No goods-in records found for "${name}".`);
      return;
    }

    setIngredientLots(lots as LotInfo[]);
  }

  async function searchByProduct(name: string) {
    // 1. Find dispatches matching this product name
    const { data: disps } = await supabase
      .from("dispatches")
      .select("*")
      .ilike("product", `%${name}%`)
      .order("dispatch_date", { ascending: false });

    if (!disps || disps.length === 0) {
      setError(`No dispatches found for product matching "${name}".`);
      return;
    }

    const dispatches = disps as DispatchInfo[];

    // 2. Find batch submissions linked to these dispatches
    const batchSubmissionIds = [
      ...new Set(
        disps
          .map((d: { batch_submission_id?: string }) => d.batch_submission_id)
          .filter(Boolean)
      ),
    ] as string[];

    let batches: BatchInfo[] = [];
    if (batchSubmissionIds.length > 0) {
      const { data: subs } = await supabase
        .from("submissions")
        .select("id, submitted_by, submitted_at, checklist:checklists(name), answers(value, question:questions(type, label))")
        .in("id", batchSubmissionIds);
      batches = (subs ?? []) as unknown as BatchInfo[];
    }

    // 3. Find the raw material lots used in those batches
    const lotIds = new Set<string>();
    for (const batch of batches) {
      for (const ans of (batch.answers ?? [])) {
        if (!ans.value || ans.question?.type !== "ingredient_table") continue;
        try {
          const parsed = JSON.parse(ans.value);
          if (Array.isArray(parsed)) {
            for (const row of parsed) {
              for (const rl of (row.lots ?? [])) {
                if (rl.lot_id) lotIds.add(rl.lot_id);
              }
            }
          }
        } catch { /* ignore */ }
      }
    }

    let lots: LotInfo[] = [];
    if (lotIds.size > 0) {
      const { data: lotsData } = await supabase
        .from("ingredient_lots")
        .select("*, ingredient:ingredients(name)")
        .in("id", Array.from(lotIds));
      lots = (lotsData ?? []) as LotInfo[];
    }

    setResult({ searchType: "product", query: name, lots, batches, dispatches });
  }

  async function traceFromLot(lot: LotInfo) {
    setLoading(true);
    setError("");
    // Save the list so user can navigate back, then hide it
    setSavedIngredientLots(ingredientLots);
    setIngredientLots(null);

    try {
      // Search by this specific lot ID only — not all lots sharing the same Julian code
      const { data: answers } = await supabase
        .from("answers")
        .select("submission_id, value, question:questions(type)")
        .eq("questions.type", "ingredient_table");

      const matchedSubmissionIds = new Set<string>();
      for (const ans of (answers ?? [])) {
        if (!ans.value) continue;
        try {
          const parsed = JSON.parse(ans.value);
          if (Array.isArray(parsed)) {
            for (const row of parsed) {
              for (const rl of (row.lots ?? [])) {
                if (rl.lot_id === lot.id) matchedSubmissionIds.add(ans.submission_id);
              }
            }
          }
        } catch { /* ignore */ }
      }

      const submissionIds = Array.from(matchedSubmissionIds);
      let batches: BatchInfo[] = [];
      if (submissionIds.length > 0) {
        const { data: subs } = await supabase
          .from("submissions")
          .select("id, submitted_by, submitted_at, checklist:checklists(name), answers(value, question:questions(type, label))")
          .in("id", submissionIds);
        batches = (subs ?? []) as unknown as BatchInfo[];
      }

      let dispatches: DispatchInfo[] = [];
      if (submissionIds.length > 0) {
        const { data: disps } = await supabase
          .from("dispatches")
          .select("*")
          .in("batch_submission_id", submissionIds);
        dispatches = (disps ?? []) as DispatchInfo[];
      }

      // Only show the single lot the user selected
      setResult({ searchType: "ingredient", query: lot.ingredient?.name ?? lot.julian_code, lots: [lot], batches, dispatches });
    } catch {
      setError("Trace failed — please try again.");
    }
    setLoading(false);
  }

  function handleBackToLots() {
    setResult(null);
    setIngredientLots(savedIngredientLots);
    setSavedIngredientLots(null);
  }

  return (
    <>
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 min-h-[68px]">
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-base font-semibold text-gray-900">Traceability</h1>
          </div>
          <Link href="/admin/goods-out" className="btn-secondary text-xs">Goods Out</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 space-y-6">
        {/* Search */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Full chain traceability</h2>
          <p className="text-xs text-gray-500 mb-4">Search by ingredient name, finished product, Julian code, or batch code. Returns the full ingredient → production → dispatch chain.</p>
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => { setSearchType("ingredient"); setResult(null); setIngredientLots(null); setError(""); }}
                className={`px-3 py-1.5 rounded text-xs font-medium transition ${searchType === "ingredient" ? "bg-brand text-brown" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                Ingredient name
              </button>
              <button
                type="button"
                onClick={() => { setSearchType("lot"); setResult(null); setIngredientLots(null); setError(""); }}
                className={`px-3 py-1.5 rounded text-xs font-medium transition ${searchType === "lot" ? "bg-brand text-brown" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                Raw material Julian code
              </button>
              <button
                type="button"
                onClick={() => { setSearchType("batch"); setResult(null); setIngredientLots(null); setError(""); }}
                className={`px-3 py-1.5 rounded text-xs font-medium transition ${searchType === "batch" ? "bg-brand text-brown" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                Batch Julian code
              </button>
              <button
                type="button"
                onClick={() => { setSearchType("product"); setResult(null); setIngredientLots(null); setError(""); }}
                className={`px-3 py-1.5 rounded text-xs font-medium transition ${searchType === "product" ? "bg-brand text-brown" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                Finished product
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  searchType === "ingredient" ? "e.g. Shallots, Garlic, Naga chilli…" :
                  searchType === "lot" ? "e.g. 26124 (raw material Julian code)" :
                  searchType === "product" ? "e.g. Tiger & Oliver, Garlic Chilli Oil…" :
                  "e.g. 26134 (batch Julian code)"
                }
                className="input flex-1"
              />
              <button type="submit" disabled={loading} className="btn-primary shrink-0">
                {loading ? "Searching…" : "Search"}
              </button>
            </div>
          </form>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        {/* Ingredient lot picker — step 1 of ingredient search */}
        {ingredientLots && (
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-brand/30 bg-brand-cream flex items-center gap-2">
              <span className="font-semibold text-sm text-brown">Goods-in records</span>
              <span className="text-xs text-brown/60">{ingredientLots.length} lot{ingredientLots.length !== 1 ? "s" : ""} found — select one to trace</span>
            </div>
            <div className="divide-y divide-gray-100">
              {ingredientLots.map(lot => (
                <button
                  key={lot.id}
                  onClick={() => traceFromLot(lot)}
                  className="w-full text-left px-4 py-3 hover:bg-brand/10 transition-colors flex items-center justify-between gap-4 group"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="font-mono font-semibold text-sm text-gray-900 shrink-0">{lot.julian_code}</span>
                    <span className="text-sm font-medium text-gray-700 truncate">{lot.ingredient?.name}</span>
                    {lot.supplier && <span className="text-xs text-gray-400 truncate hidden sm:block">{lot.supplier}</span>}
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs text-gray-500">
                    <span>{formatDate(lot.received_date)}</span>
                    <span className="text-gray-400">{lot.quantity_received_g.toLocaleString()} g received</span>
                    <span className="text-brown font-medium opacity-0 group-hover:opacity-100 transition-opacity">Trace →</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-5">
            {/* Back to lot picker if we drilled in from ingredient search */}
            {savedIngredientLots && (
              <button
                onClick={handleBackToLots}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
              >
                ← Back to all {result.query} lots
              </button>
            )}
            {/* Ingredient Lots */}
            <Section title="Raw Material Lots" count={result.lots.length} color="blue">
              {result.lots.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">No ingredient lots found.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left py-1 font-medium">Ingredient</th>
                      <th className="text-left py-1 font-medium">Julian code</th>
                      <th className="text-right py-1 font-medium">Received (g)</th>
                      <th className="text-right py-1 font-medium">Remaining (g)</th>
                      <th className="text-left py-1 font-medium pl-3">Date in</th>
                      <th className="text-left py-1 font-medium">Supplier</th>
                      <th className="text-left py-1 font-medium">Best before</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.lots.map((lot) => (
                      <tr key={lot.id}>
                        <td className="py-1.5 font-medium text-gray-900">{lot.ingredient?.name}</td>
                        <td className="py-1.5 font-mono font-semibold text-gray-900">{lot.julian_code}</td>
                        <td className="py-1.5 text-right tabular-nums text-gray-600">{lot.quantity_received_g.toLocaleString()}</td>
                        <td className="py-1.5 text-right tabular-nums font-semibold text-gray-900">{lot.quantity_remaining_g.toLocaleString()}</td>
                        <td className="py-1.5 pl-3 text-gray-500">{formatDate(lot.received_date)}</td>
                        <td className="py-1.5 text-gray-500">{lot.supplier ?? "—"}</td>
                        <td className="py-1.5 text-gray-500">{lot.best_before_date ? formatDate(lot.best_before_date) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* Batch Records */}
            <Section title="Production Batch Records" count={result.batches.length} color="amber">
              {result.batches.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">No batch records found using this lot.</p>
              ) : (
                <div className="space-y-3">
                  {result.batches.map((b) => (
                    <div key={b.id} className="rounded border border-gray-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{b.checklist?.name}</p>
                          <p className="text-xs text-gray-500">{formatDateTime(b.submitted_at)} · by {b.submitted_by}</p>
                        </div>
                        <Link href={`/submission/${b.id}?back=/admin/traceability`} className="btn-ghost text-xs shrink-0">View →</Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Dispatches */}
            <Section title="Dispatches" count={result.dispatches.length} color="green">
              {result.dispatches.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">No dispatches linked to these batch records yet.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left py-1 font-medium">Date</th>
                      <th className="text-left py-1 font-medium">Product</th>
                      <th className="text-left py-1 font-medium">Customer</th>
                      <th className="text-right py-1 font-medium">×6</th>
                      <th className="text-right py-1 font-medium">×3</th>
                      <th className="text-right py-1 font-medium">Singles</th>
                      <th className="text-right py-1 font-medium">Units</th>
                      <th className="text-left py-1 font-medium pl-3">Ref</th>
                      <th className="text-left py-1 font-medium">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.dispatches.map((d) => (
                      <tr key={d.id}>
                        <td className="py-1.5 text-gray-600 whitespace-nowrap">{formatDate(d.dispatch_date)}</td>
                        <td className="py-1.5 font-medium text-gray-900">{d.product}</td>
                        <td className="py-1.5 text-gray-600">{d.customer}</td>
                        <td className="py-1.5 text-right tabular-nums text-gray-600">{d.cases_of_6 || "—"}</td>
                        <td className="py-1.5 text-right tabular-nums text-gray-600">{d.cases_of_3 || "—"}</td>
                        <td className="py-1.5 text-right tabular-nums text-gray-600">{d.singles || "—"}</td>
                        <td className="py-1.5 text-right tabular-nums font-bold text-gray-900">{d.total_units}</td>
                        <td className="py-1.5 pl-3 text-gray-500">{d.reference ?? "—"}</td>
                        <td className="py-1.5 text-gray-500">{d.dispatched_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* Summary */}
            <div className="card p-4 bg-gray-900 text-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Traceability summary</p>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">{result.lots.length}</p>
                  <p className="text-xs text-gray-400 mt-0.5">ingredient lot{result.lots.length !== 1 ? "s" : ""}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{result.batches.length}</p>
                  <p className="text-xs text-gray-400 mt-0.5">batch record{result.batches.length !== 1 ? "s" : ""}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{result.dispatches.reduce((s, d) => s + d.total_units, 0)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">units dispatched</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function Section({ title, count, color, children }: {
  title: string; count: number; color: "blue" | "amber" | "green"; children: React.ReactNode;
}) {
  const colors = {
    blue: "bg-brand-cream border-brand/30 text-brown",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    green: "bg-brand-light border-brand/40 text-brown",
  };
  return (
    <div className="card overflow-hidden">
      <div className={`px-4 py-2.5 border-b flex items-center gap-2 ${colors[color]}`}>
        <span className="font-semibold text-sm">{title}</span>
        <span className="text-xs font-medium opacity-70">{count} found</span>
      </div>
      <div className="px-4 py-3 overflow-x-auto">{children}</div>
    </div>
  );
}
