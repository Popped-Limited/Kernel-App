"use client";
import { useState } from "react";
import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/utils";
import AnswerRow from "@/components/AnswerRow";
import { getBatchCode, type BatchInfo, type TraceResult } from "@/lib/traceability";

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
  linkBack = "/compliance/traceability",
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

      {/* The raw-material mass balance (received = used + written off + remaining
          + unaccounted) is rendered once by <LotMassBalance>, alongside this
          chain on every page — deliberately NOT repeated here. */}

      {/* Dispatches, returns & stock adjustments — one chronological timeline so
          every unit that left (or came back to) the batch reads top to bottom */}
      {(() => {
        type Movement = {
          kind: "dispatch" | "return" | "adjustment";
          id: string;
          date: string;
          product: string;
          customer: string;
          batchId: string | null;
          batchCodeOverride?: string;
          units: number;
          by: string;
          ref: string | null;
          packed?: boolean;
        };
        const movements: Movement[] = [
          ...result.dispatches.map((d) => ({
            kind: "dispatch" as const, id: d.id, date: d.dispatch_date, product: d.product,
            customer: d.customer, batchId: d.batch_submission_id, units: d.total_units,
            by: d.dispatched_by, ref: d.reference,
            // Packed but not yet shipped — the units have left stock but are
            // still on site, so a recall can intercept them before dispatch.
            packed: d.status === "packed",
          })),
          ...(result.returns ?? []).map((r) => ({
            kind: "return" as const, id: r.id, date: r.return_date, product: r.product,
            customer: r.customer, batchId: r.batch_submission_id, units: r.quantity,
            by: r.returned_by, ref: null,
          })),
          ...(result.adjustments ?? []).map((a) => ({
            kind: "adjustment" as const, id: a.id, date: a.created_at, product: a.product,
            customer: "", batchId: null, batchCodeOverride: a.batch_code ?? "", units: a.quantity,
            by: a.created_by ?? "", ref: [a.reason, a.notes].filter(Boolean).join(" — ") || null,
          })),
        ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return (
          <Section title="Dispatches, returns & adjustments" count={movements.length} defaultOpen={defaultOpen}>
            {movements.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No dispatches linked to these batch records yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[640px]">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left py-1 font-medium">Date</th>
                      <th className="text-left py-1 font-medium">Movement</th>
                      <th className="text-left py-1 font-medium">Product</th>
                      <th className="text-left py-1 font-medium">Customer</th>
                      <th className="text-left py-1 font-medium">Batch code</th>
                      <th className="text-right py-1 font-medium">Units</th>
                      <th className="text-left py-1 font-medium pl-3">Ref</th>
                      <th className="text-left py-1 font-medium">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {movements.map((m) => {
                      const linkedBatch = m.batchId ? result.batches.find((b) => b.id === m.batchId) : null;
                      const batchCode = m.batchCodeOverride ?? (linkedBatch ? getBatchCode(linkedBatch) : "");
                      const isReturn = m.kind === "return";
                      const isAdjustment = m.kind === "adjustment";
                      return (
                        <tr key={`${m.kind}-${m.id}`}>
                          <td className="py-1.5 text-gray-600 whitespace-nowrap">{formatDate(m.date)}</td>
                          <td className="py-1.5">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${isReturn ? "bg-amber-100 text-amber-800" : isAdjustment ? "bg-purple-100 text-purple-800" : m.packed ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-700"}`}>
                              {isReturn ? "Returned" : isAdjustment ? "Adjustment" : m.packed ? "Packed — not shipped" : "Dispatched"}
                            </span>
                          </td>
                          <td className="py-1.5 font-medium text-gray-900">{m.product}</td>
                          <td className="py-1.5 text-gray-600">{m.customer || <span className="text-gray-300">—</span>}</td>
                          <td className="py-1.5 font-mono text-gray-700">{batchCode || <span className="text-gray-300">—</span>}</td>
                          <td className={`py-1.5 text-right tabular-nums font-bold ${isReturn ? "text-amber-700" : isAdjustment ? "text-purple-700" : "text-gray-900"}`}>
                            {isReturn ? `+${m.units}` : isAdjustment && m.units > 0 ? `+${m.units}` : m.units}
                          </td>
                          <td className="py-1.5 pl-3 text-gray-500">{m.ref ?? "—"}</td>
                          <td className="py-1.5 text-gray-500">{m.by}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        );
      })()}

      {/* Traceability gap: dispatches of this product with no batch link. A recall
          can't rule these in or out — they must be surfaced, not hidden. */}
      {(() => {
        // In a product-wide trace these rows already sit in the main timeline;
        // only list the ones the timeline doesn't show.
        const shown = new Set(result.dispatches.map((d) => d.id));
        const gaps = (result.unlinked_dispatches ?? []).filter((d) => !shown.has(d.id));
        const total = (result.unlinked_dispatches ?? []).length;
        if (total === 0) return null;
        return (
          <div className="card border-red-200 bg-red-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700 mb-1">
              ⚠ {total} dispatch{total !== 1 ? "es" : ""} not linked to any batch record
            </p>
            <p className="text-xs text-red-700 mb-2">
              These dispatches of the same product were logged without a batch link, so they cannot be ruled in or out of this recall.
              Edit each dispatch in Goods Out and link it to its production batch.
            </p>
            {gaps.length > 0 && (
              <table className="w-full text-xs">
                <tbody className="divide-y divide-red-100">
                  {gaps.map((d) => (
                    <tr key={d.id}>
                      <td className="py-1 text-red-900 whitespace-nowrap">{formatDate(d.dispatch_date)}</td>
                      <td className="py-1 font-medium text-red-900">{d.product}</td>
                      <td className="py-1 text-red-800">{d.customer || "—"}</td>
                      <td className="py-1 text-right tabular-nums font-semibold text-red-900">{d.total_units} units</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })()}

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
            {(() => {
              const dispatched = result.dispatches.reduce((s, d) => s + d.total_units, 0);
              const returned = (result.returns ?? []).reduce((s, r) => s + (r.quantity ?? 0), 0);
              return (
                <>
                  <p className="text-2xl font-bold">{dispatched - returned}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    units out{returned > 0 ? ` (${dispatched} sent − ${returned} returned)` : ""}
                  </p>
                </>
              );
            })()}
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
      <div className={`border-t border-gray-100 ${open ? "" : "hidden print:block"}`}>
        {answers.length === 0 ? (
          <p className="px-5 py-3 text-xs text-gray-400">No answers recorded.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {answers.map((a) => <AnswerRow key={a.id} answer={a} />)}
          </div>
        )}
      </div>
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
      {/* Collapsed content stays in the DOM (hidden) so Print / save PDF always
          includes the full chain regardless of what's expanded on screen. */}
      <div className={`px-4 py-3 overflow-x-auto ${open ? "" : "hidden print:block"}`}>{children}</div>
    </div>
  );
}
