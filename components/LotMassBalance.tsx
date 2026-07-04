"use client";
import { useState } from "react";
import type { LotReconciliation } from "@/lib/traceability";

const REASON_LABELS: Record<string, string> = {
  wastage: "Wastage",
  damaged: "Damaged",
  expired: "Expired",
  other: "Other",
};

function fmt(qty: number, unit: string) {
  return unit === "units" ? `${Math.round(qty).toLocaleString()} units` : `${(qty / 1000).toFixed(2)} kg`;
}

// Grams can carry harmless rounding from production; only flag a gap worth a look.
function isUnaccounted(r: LotReconciliation) {
  const tol = r.unit === "units" ? 0.5 : 5; // 5 g / half a unit
  return Math.abs(r.unaccounted_g) >= tol;
}

/**
 * Per-lot raw-material mass balance for a trace/recall:
 *   received = used in production + written off + remaining + unaccounted.
 * Ties each reconciliation (wastage/write-off) back to the lot it came off so an
 * auditor can see every gram is accounted for.
 */
export default function LotMassBalance({ reconciliation }: { reconciliation?: LotReconciliation[] }) {
  // Collapsed by default — the header carries the verdict (✓ or ⚠ count) so
  // nothing important is hidden; expand for the per-lot breakdown.
  const [open, setOpen] = useState(false);
  if (!reconciliation || reconciliation.length === 0) return null;
  const unaccountedCount = reconciliation.filter(isUnaccounted).length;
  const anyUnaccounted = unaccountedCount > 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition hover:bg-gray-50 focus:outline-none"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex-1">Raw-material mass balance</span>
        {anyUnaccounted ? (
          <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-800">
            ⚠ {unaccountedCount} lot{unaccountedCount !== 1 ? "s" : ""} unaccounted
          </span>
        ) : (
          <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-green-100 text-green-700">✓ all reconcile</span>
        )}
        <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-gray-100 text-gray-500">{reconciliation.length}</span>
        <svg className={`h-4 w-4 opacity-60 transition-transform print:hidden ${open ? "rotate-90" : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 4l4 4-4 4" />
        </svg>
      </button>
      {/* Collapsed content stays in the DOM (hidden) so Print / save PDF always includes it */}
      <div className={`px-4 pb-4 ${open ? "" : "hidden print:block"}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-gray-500 border-b border-gray-200">
            <tr>
              <th className="text-left py-1.5 pr-3 font-medium">Lot</th>
              <th className="text-right py-1.5 px-3 font-medium">Received</th>
              <th className="text-right py-1.5 px-3 font-medium">Used in production</th>
              <th className="text-right py-1.5 px-3 font-medium">Written off</th>
              <th className="text-right py-1.5 px-3 font-medium">Remaining</th>
              <th className="text-right py-1.5 pl-3 font-medium">Unaccounted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reconciliation.map(r => {
              const flagged = isUnaccounted(r);
              return (
                <tr key={r.lot_id}>
                  <td className="py-2 pr-3">
                    <span className="font-medium text-gray-900">{r.ingredient_name}</span>
                    <span className="ml-1.5 font-mono text-gray-500">{r.julian_code}</span>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-600">{fmt(r.received_g, r.unit)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-600">{fmt(r.used_g, r.unit)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {r.written_off_g > 0 ? (
                      <span
                        className="font-medium text-red-600"
                        title={r.reasons.map(w => `${REASON_LABELS[w.reason] ?? w.reason}: ${fmt(w.grams, r.unit)}${w.notes ? ` — ${w.notes}` : ""}`).join("\n")}
                      >
                        {fmt(r.written_off_g, r.unit)}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-600">{fmt(r.remaining_g, r.unit)}</td>
                  <td className={`py-2 pl-3 text-right tabular-nums font-semibold ${flagged ? "text-amber-600" : "text-gray-400"}`}>
                    {flagged ? fmt(r.unaccounted_g, r.unit) : "✓"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Write-off reasons in full text — the tooltip above won't render in a
          printed/PDF report, so an auditor needs them spelled out here. */}
      {reconciliation.some(r => r.reasons.length > 0) && (
        <div className="mt-3 space-y-1">
          {reconciliation.filter(r => r.reasons.length > 0).map(r => (
            <div key={r.lot_id} className="text-xs text-gray-600">
              <span className="font-medium text-gray-800">{r.ingredient_name} ({r.julian_code}):</span>{" "}
              {r.reasons.map((w, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  {fmt(w.grams, r.unit)} {REASON_LABELS[w.reason] ?? w.reason}{w.notes ? ` — ${w.notes}` : ""}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
      {anyUnaccounted && (
        <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          ⚠ Some material is unaccounted for — received minus production usage, write-offs and remaining stock doesn&apos;t balance. Reconcile the lot (log the wastage) so the trace fully accounts for every gram.
        </p>
      )}
      </div>
    </div>
  );
}
