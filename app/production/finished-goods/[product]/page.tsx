"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import BackButton from "@/components/BackButton";
import LabelArtworkPanel from "@/components/LabelArtworkPanel";
import ProductNutritionPanel from "@/components/ProductNutritionPanel";
import { supabase } from "@/lib/supabase";
import { fetchAll } from "@/lib/fetchAll";
import { formatDate } from "@/lib/utils";
import { expandRunValues } from "@/lib/production-runs";

interface ProductionRun {
  id: string;
  submittedAt: string;
  batchCode: string;
  totalUnits: number | null;
  bbe: string;
}

/** Format a date string nicely if it looks like YYYY-MM-DD */
function formatBBE(val: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return formatDate(val);
  }
  return val;
}

/** Pull key fields from a submission's answers */
function extractFields(answers: Array<{ value: string | null; question: { type: string; label: string } | null }>) {
  let batchCode = "";
  // Track the sellable "Total units produced" and the packing jars-used total
  // separately, then prefer units produced. Doing this independently of answer
  // order matters: packing log and units-produced can differ (e.g. QC rejects),
  // and the answers don't arrive in a guaranteed order.
  let unitsProduced: number | null = null;
  let jarsUsedFallback: number | null = null;
  let bbe = "";

  for (const ans of answers ?? []) {
    if (!ans.value) continue;
    const label = (ans.question?.label ?? "").toLowerCase();
    const type  = ans.question?.type ?? "";

    // Total units produced — take FIRST match only (avoids doubling if multiple matching fields)
    if (unitsProduced === null && label.includes("total units produced")) {
      unitsProduced = Number(ans.value) || null;
    }

    // Batch / Julian code
    if (!batchCode && type === "text" && (label.includes("julian") || label.includes("batch code") || label.includes("lot number") || label.includes("batch ref"))) {
      batchCode = ans.value;
    }

    // Best before / BBE — skip boolean values (checkboxes) and non-date/text types
    if (!bbe &&
        type !== "checkbox" && type !== "boolean" &&
        ans.value !== "true" && ans.value !== "false" &&
        (label.includes("best before") || label.includes("bbe") || label.includes("use by") || label.includes("expiry"))) {
      bbe = formatBBE(ans.value);
    }

    // Packing-log jars used — only used as a fallback when no units-produced field
    // (summed across every run of the record)
    if (type === "packing_runs") {
      let sum = 0;
      for (const v of expandRunValues(ans.value)) {
        try {
          const rows = JSON.parse(v) as Array<{ jars_used?: string }>;
          for (const r of rows) sum += Number(r.jars_used) || 0;
        } catch { /* ignore */ }
      }
      if (sum > 0) jarsUsedFallback = sum;
    }
  }

  // Prefer the sellable units produced; fall back to packing jars only if absent
  const totalUnits = unitsProduced ?? jarsUsedFallback;
  return { batchCode, totalUnits, bbe };
}

function ProductDetailInner() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const productName = decodeURIComponent(params.product as string);
  const tab = searchParams.get("tab") === "labelling" ? "labelling" : "stock";

  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Fetch all production submissions whose checklist name matches this
      // product, paginating past PostgREST's 1000-row cap so older runs aren't
      // silently dropped from the history.
      let data: any[];
      try {
        data = await fetchAll<any>((from, to) => supabase
          .from("submissions")
          .select("id, submitted_at, checklist:checklists(name, category), answers(value, question:questions(type, label))")
          .order("submitted_at", { ascending: false })
          .range(from, to));
      } catch {
        setError("Failed to load production records."); setLoading(false); return;
      }

      const matched: ProductionRun[] = [];
      for (const sub of data as any[]) {
        const cl = sub.checklist as { name: string; category: string } | null;
        if (!cl || cl.category !== "Production") continue;
        const name = cl.name.replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim();
        if (name.toLowerCase() !== productName.toLowerCase()) continue;

        const { batchCode, totalUnits, bbe } = extractFields(sub.answers ?? []);
        matched.push({
          id: sub.id,
          submittedAt: sub.submitted_at,
          batchCode,
          totalUnits,
          bbe,
        });
      }

      setRuns(matched);
      setLoading(false);
    }
    load();
  }, [productName]);

  return (
    <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold text-gray-900">{productName}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{tab === "labelling" ? "Labelling" : "Production history"}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 flex gap-6">
          {([["stock", "Stock & batches"], ["labelling", "Labelling"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => router.replace(key === "stock" ? pathname : `${pathname}?tab=${key}`, { scroll: false })}
              className={`pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key
                  ? "border-brown text-brown"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "labelling" ? (
          <div className="space-y-6">
            <LabelArtworkPanel productName={productName} />
            <ProductNutritionPanel productName={productName} />
          </div>
        ) : (

        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">All production runs</h2>
            {!loading && <span className="text-xs text-gray-400">{runs.length} record{runs.length !== 1 ? "s" : ""}</span>}
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-red-500">{error}</div>
          ) : runs.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No production records found for this product.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Production date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Batch code</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Units produced</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Best before</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {runs.map(run => (
                    <tr key={run.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-900 whitespace-nowrap">
                        {formatDate(run.submittedAt.slice(0, 10))}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-700">
                        {run.batchCode || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                        {run.totalUnits !== null ? run.totalUnits.toLocaleString() : <span className="text-gray-300 font-normal">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {run.bbe || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <a href={`/submission/${run.id}`} className="text-xs text-brown/60 hover:text-brown hover:underline">
                          View record →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        )}

      </div>
    </main>
  );
}

export default function ProductDetailPage() {
  // useSearchParams requires a Suspense boundary in the App Router
  return (
    <Suspense>
      <ProductDetailInner />
    </Suspense>
  );
}
