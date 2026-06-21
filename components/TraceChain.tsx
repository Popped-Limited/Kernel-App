"use client";
import { useState } from "react";
import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/utils";
import AnswerRow from "@/components/AnswerRow";
import { getBatchCode, type BatchInfo, type LotReconciliation, type TraceResult } from "@/lib/traceability";

const g = (n: number) => `${Math.round(n).toLocaleString()} g`;

/**
 * Renders a full traceability chain (production batches → raw-material lots →
 * dispatches) plus a summary. Shared by the Traceability search page and the
 * Mock Recall flow/report so the two views can never drift.
 *
 * `defaultOpen` expands every section (used for the printable recall report);
 * `linkBack` is the `?back=` target for the per-batch "View" links.
 */
export default function TraceChain({
  result,
  defaultOpen = false,
  linkBack = "/admin/traceability",
}: {
  result: TraceResult;
  defaultOpen?: boolean;
  linkBack?: string;
}) {
  return (
    <div className="space-y-5">
      {/* Production Batch Records */}
      <Section title="Production Batch Records" count={result.batches.length} defaultOpen={defaultOpen}>
        {result.batches.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">No batch records found.</p>
        ) : (
          <div className="space-y-3">
            {result.batches.map((b) => (
              <BatchCard key={b.id} batch={b} linkBack={linkBack} defaultOpen={defaultOpen} />
            ))}
          </div>
        )}
      </Section>

      {/* Raw Material Lots */}
      <Section title="Raw Material Lots" count={result.lots.length} defaultOpen={defaultOpen}>
        {result.lots.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">No ingredient lots found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[560px]">
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
          </div>
        )}
      </Section>

      {/* Ingredient reconciliation */}
      {result.reconciliation && result.reconciliation.length > 0 && (
        <Section title="Ingredient reconciliation" count={result.reconciliation.length} defaultOpen={defaultOpen}>
          <IngredientReconciliation rows={result.reconciliation} />
        </Section>
      )}

      {/* Dispatches */}
      <Section title="Dispatches" count={result.dispatches.length} defaultOpen={defaultOpen}>
        {result.dispatches.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">No dispatches linked to these batch records yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left py-1 font-medium">Date</th>
                  <th className="text-left py-1 font-medium">Product</th>
                  <th className="text-left py-1 font-medium">Customer</th>
                  <th className="text-left py-1 font-medium">Batch code</th>
                  <th className="text-right py-1 font-medium">×6</th>
                  <th className="text-right py-1 font-medium">×3</th>
                  <th className="text-right py-1 font-medium">Singles</th>
                  <th className="text-right py-1 font-medium">Units</th>
                  <th className="text-left py-1 font-medium pl-3">Ref</th>
                  <th className="text-left py-1 font-medium">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.dispatches.map((d) => {
                  const linkedBatch = d.batch_submission_id
                    ? result.batches.find((b) => b.id === d.batch_submission_id)
                    : null;
                  const batchCode = linkedBatch ? getBatchCode(linkedBatch) : "";
                  return (
                    <tr key={d.id}>
                      <td className="py-1.5 text-gray-600 whitespace-nowrap">{formatDate(d.dispatch_date)}</td>
                      <td className="py-1.5 font-medium text-gray-900">{d.product}</td>
                      <td className="py-1.5 text-gray-600">{d.customer}</td>
                      <td className="py-1.5 font-mono text-gray-700">{batchCode || <span className="text-gray-300">—</span>}</td>
                      <td className="py-1.5 text-right tabular-nums text-gray-600">{d.cases_of_6 || "—"}</td>
                      <td className="py-1.5 text-right tabular-nums text-gray-600">{d.cases_of_3 || "—"}</td>
                      <td className="py-1.5 text-right tabular-nums text-gray-600">{d.singles || "—"}</td>
                      <td className="py-1.5 text-right tabular-nums font-bold text-gray-900">{d.total_units}</td>
                      <td className="py-1.5 pl-3 text-gray-500">{d.reference ?? "—"}</td>
                      <td className="py-1.5 text-gray-500">{d.dispatched_by}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
  );
}

/** A production batch record that expands inline to show its full answers. */
function BatchCard({ batch, linkBack, defaultOpen }: { batch: BatchInfo; linkBack: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const answers = [...(batch.answers ?? [])].sort(
    (a, b) => (a.question?.order_index ?? 0) - (b.question?.order_index ?? 0)
  );
  return (
    <div className="rounded border border-gray-200 bg-white">
      <div className="flex items-start justify-between gap-2 p-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-left min-w-0 flex items-start gap-2">
          <svg className={`h-4 w-4 mt-0.5 opacity-50 transition-transform shrink-0 print:hidden ${open ? "rotate-90" : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4l4 4-4 4" /></svg>
          <span>
            <span className="block text-sm font-semibold text-gray-900">{batch.checklist?.name}</span>
            <span className="block text-xs text-gray-500">{formatDateTime(batch.submitted_at)} · by {batch.submitted_by}</span>
          </span>
        </button>
        <Link href={`/submission/${batch.id}?back=${linkBack}`} className="btn-ghost text-xs shrink-0 print:hidden">Open ↗</Link>
      </div>
      {open && (
        <div className="border-t border-gray-100">
          {answers.length === 0 ? (
            <p className="px-5 py-3 text-xs text-gray-400">No answers recorded.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {answers.map((a) => <AnswerRow key={a.id} answer={a} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Per-lot mass balance: where every gram went, with reasons + an unaccounted flag. */
function IngredientReconciliation({ rows }: { rows: LotReconciliation[] }) {
  const TOLERANCE = 1; // grams — ignore rounding dust
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[640px]">
          <thead>
            <tr className="text-gray-500">
              <th className="text-left py-1 font-medium">Ingredient</th>
              <th className="text-left py-1 font-medium">Julian code</th>
              <th className="text-right py-1 font-medium">Received</th>
              <th className="text-right py-1 font-medium">Used</th>
              <th className="text-right py-1 font-medium">Written off</th>
              <th className="text-right py-1 font-medium">Remaining</th>
              <th className="text-right py-1 font-medium">Unaccounted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const flagged = Math.abs(r.unaccounted_g) > TOLERANCE;
              return (
                <tr key={r.lot_id}>
                  <td className="py-1.5 font-medium text-gray-900">{r.ingredient_name}</td>
                  <td className="py-1.5 font-mono font-semibold text-gray-900">{r.julian_code}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-600">{g(r.received_g)}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-600">{g(r.used_g)}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-600">{r.written_off_g ? g(r.written_off_g) : "—"}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-600">{g(r.remaining_g)}</td>
                  <td className={`py-1.5 text-right tabular-nums font-semibold ${flagged ? "text-red-600" : "text-green-700"}`}>
                    {flagged ? g(r.unaccounted_g) : "✓ 0 g"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Write-off reasons */}
      {rows.some((r) => r.reasons.length > 0) && (
        <div className="space-y-1.5">
          {rows.filter((r) => r.reasons.length > 0).map((r) => (
            <div key={r.lot_id} className="text-xs text-gray-600">
              <span className="font-medium text-gray-800">{r.ingredient_name} ({r.julian_code}):</span>{" "}
              {r.reasons.map((reason, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  {g(reason.grams)} {reason.reason}{reason.notes ? ` — ${reason.notes}` : ""}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Unaccounted banner */}
      {rows.some((r) => Math.abs(r.unaccounted_g) > TOLERANCE) ? (
        <p className="text-xs text-red-700 bg-red-50 rounded px-3 py-2">
          ⚠ Some ingredient quantities are unaccounted for — received does not equal used + written off + remaining. Record the missing usage or a wastage write-off (with a reason) to close the gap.
        </p>
      ) : (
        <p className="text-xs text-green-700 bg-green-50 rounded px-3 py-2">
          ✓ All ingredient lots reconcile — every gram received is accounted for as used, written off, or remaining in stock.
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 border-b border-brand/50 bg-brand-light text-brown text-left transition hover:opacity-90 focus:outline-none"
      >
        <span className="h-2 w-2 rounded-full shrink-0 bg-brand" />
        <span className="text-sm font-semibold flex-1">{title}</span>
        <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-brand-light text-brown">{count}</span>
        <svg className={`h-4 w-4 opacity-60 transition-transform print:hidden ${open ? "rotate-90" : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 4l4 4-4 4" />
        </svg>
      </button>
      {open && <div className="px-4 py-3 overflow-x-auto">{children}</div>}
    </div>
  );
}
