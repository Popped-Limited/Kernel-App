"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { fetchAll } from "@/lib/fetchAll";
import { formatDate } from "@/lib/utils";

// Per-product organoleptic check history. A check links to the product either
// via its "Production batch record" batch_link answer ({submission_id,
// batch_code, product}) or — for records without a link — by the free-typed
// "Product or material name" answer matching this product exactly
// (case-insensitive, trimmed; same matching rule as everywhere else).

interface CheckRow {
  id: string;
  submittedAt: string;
  submittedBy: string;
  checkType: string;
  batchCode: string;
  result: string;
  linked: boolean; // true when matched via the batch_link answer
}

interface RawSubmission {
  id: string;
  submitted_at: string;
  submitted_by: string | null;
  answers: Array<{ value: string | null; question: { type: string; label: string } | null }>;
}

function ResultBadge({ result }: { result: string }) {
  const r = result.trim().toLowerCase();
  if (r === "pass") return <span className="badge bg-green-100 text-green-700">Pass</span>;
  if (r === "fail") return <span className="badge bg-red-100 text-red-600">Fail</span>;
  return <span className="text-gray-300">—</span>;
}

export default function ProductOrganolepticPanel({ productName }: { productName: string }) {
  const [rows, setRows] = useState<CheckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // Tolerant of per-org renames like "Organoleptic Checks (Monthly)".
        const { data: cls, error: clErr } = await supabase
          .from("checklists")
          .select("id")
          .ilike("name", "%organoleptic%");
        if (clErr) throw clErr;
        const ids = (cls ?? []).map((c) => c.id);
        if (ids.length === 0) { if (!cancelled) { setRows([]); setLoading(false); } return; }

        // fetchAll<any> + cast: Supabase infers the joined `question` as an
        // array, same as the other submission readers in this app.
        const subs = (await fetchAll<any>((from, to) => supabase
          .from("submissions")
          .select("id, submitted_at, submitted_by, answers(value, question:questions(type, label))")
          .in("checklist_id", ids)
          .order("submitted_at", { ascending: false })
          .range(from, to))) as unknown as RawSubmission[];
        if (cancelled) return;

        const target = productName.trim().toLowerCase();
        const matched: CheckRow[] = [];
        for (const sub of subs) {
          let linkedProduct = "";
          let linkedBatch = "";
          let typedProduct = "";
          let typedBatch = "";
          let checkType = "";
          let result = "";
          for (const a of sub.answers ?? []) {
            if (!a.value) continue;
            const label = (a.question?.label ?? "").toLowerCase();
            const type = a.question?.type ?? "";
            if (type === "batch_link") {
              try {
                const p = JSON.parse(a.value) as { batch_code?: string; product?: string };
                linkedProduct = (p.product ?? "").trim();
                linkedBatch = (p.batch_code ?? "").trim();
              } catch { /* not a parsed link — ignore */ }
            } else if (type === "text" && label.includes("product") && label.includes("name")) {
              typedProduct = a.value.trim();
            } else if (type === "text" && (label.includes("batch code") || label.includes("lot number"))) {
              typedBatch = a.value.trim();
            } else if (type === "dropdown" && label.includes("check type")) {
              checkType = a.value;
            } else if (type === "dropdown" && label.includes("overall result")) {
              result = a.value;
            }
          }
          const linked = linkedProduct.toLowerCase() === target;
          if (!linked && typedProduct.toLowerCase() !== target) continue;
          matched.push({
            id: sub.id,
            submittedAt: sub.submitted_at,
            submittedBy: sub.submitted_by ?? "",
            checkType,
            batchCode: linked && linkedBatch ? linkedBatch : typedBatch,
            result,
            linked,
          });
        }
        if (!cancelled) { setRows(matched); setLoading(false); }
      } catch {
        if (!cancelled) { setError("Failed to load organoleptic checks."); setLoading(false); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [productName]);

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Organoleptic checks</h2>
        {!loading && !error && <span className="text-xs text-gray-400">{rows.length} record{rows.length !== 1 ? "s" : ""}</span>}
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
      ) : error ? (
        <div className="p-8 text-center text-sm text-red-500">{error}</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-400">
          No organoleptic checks recorded for this product yet. Record one under Checklists → Organoleptic Checks.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50/50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Check type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Batch code</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">By</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{formatDate(row.submittedAt.slice(0, 10))}</td>
                  <td className="px-4 py-3 text-gray-700">{row.checkType || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 font-mono text-gray-700">{row.batchCode || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3"><ResultBadge result={row.result} /></td>
                  <td className="px-4 py-3 text-gray-700">{row.submittedBy || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-right">
                    <a href={`/submission/${row.id}`} className="text-xs text-brown/60 hover:text-brown hover:underline whitespace-nowrap">
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
  );
}
