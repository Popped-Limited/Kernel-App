"use client";
import BackButton from "@/components/BackButton";

import { useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import TraceChain from "@/components/TraceChain";
import {
  searchByLot,
  searchByBatch,
  searchIngredientLots,
  traceFromLot,
  searchByProduct,
  type LotInfo,
  type TraceResult,
} from "@/lib/traceability";

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
        const out = await searchByLot(query.trim());
        if ("error" in out) setError(out.error); else setResult(out.result);
      } else if (searchType === "batch") {
        const out = await searchByBatch(query.trim());
        if ("error" in out) setError(out.error); else setResult(out.result);
      } else if (searchType === "product") {
        const out = await searchByProduct(query.trim());
        if ("error" in out) setError(out.error); else setResult(out.result);
      } else {
        const out = await searchIngredientLots(query.trim());
        if ("error" in out) setError(out.error); else setIngredientLots(out.lots);
      }
    } catch {
      setError("Search failed — please try again.");
    }
    setLoading(false);
  }

  async function handleTraceFromLot(lot: LotInfo) {
    setLoading(true);
    setError("");
    // Save the list so user can navigate back, then hide it
    setSavedIngredientLots(ingredientLots);
    setIngredientLots(null);

    try {
      const out = await traceFromLot(lot);
      if ("error" in out) setError(out.error); else setResult(out.result);
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
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-6xl w-full mx-auto space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold text-gray-900">Traceability</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/compliance/traceability/recalls" className="btn-secondary text-sm">Past recalls</Link>
            <Link href="/compliance/traceability/mock-recall" className="btn-primary text-sm">Begin mock recall</Link>
          </div>
        </div>
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
                onClick={() => { setSearchType("product"); setResult(null); setIngredientLots(null); setError(""); }}
                className={`px-3 py-1.5 rounded text-xs font-medium transition ${searchType === "product" ? "bg-brand text-brown" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                Finished product name
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
                Finished product Julian code
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
                  onClick={() => handleTraceFromLot(lot)}
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
            <TraceChain result={result} />
          </div>
        )}
      </main>
    </>
  );
}
