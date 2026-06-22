"use client";
import BackButton from "@/components/BackButton";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import TraceChain from "@/components/TraceChain";
import { formatDate, formatDateTime } from "@/lib/utils";
import { recallDurationLabel, outcomeBadge, type MockRecall } from "@/lib/mock-recall";

export default function RecallReportPage() {
  const params = useParams<{ id: string }>();
  const [recall, setRecall] = useState<MockRecall | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.id) return;
    supabase
      .from("mock_recalls")
      .select("*")
      .eq("id", params.id)
      .single()
      .then(({ data }) => {
        setRecall((data as MockRecall) ?? null);
        setLoading(false);
      });
  }, [params?.id]);

  if (loading) {
    return <main className="flex-1 px-4 py-6 max-w-4xl w-full mx-auto"><p className="text-sm text-gray-400">Loading…</p></main>;
  }
  if (!recall) {
    return <main className="flex-1 px-4 py-6 max-w-4xl w-full mx-auto"><p className="text-sm text-gray-500">Recall not found.</p></main>;
  }

  const badge = outcomeBadge(recall.outcome);
  const mb = recall.mass_balance;
  const customers = recall.customers_contacted ?? [];

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-4xl w-full mx-auto space-y-6 print:px-0 print:py-0">
      <div className="flex items-center justify-between gap-2 flex-wrap print:hidden">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-xl font-bold text-gray-900">Mock recall report</h1>
        </div>
        <button onClick={() => window.print()} className="btn-secondary text-sm">Print / save PDF</button>
      </div>

      {/* Report header */}
      <div className="card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">
              {recall.direction === "forward" ? "Forward traceability test" : "Backward traceability test"}
            </p>
            <p className="text-lg font-bold text-gray-900">{recall.trigger_label}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${badge.className}`}>{badge.label}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm pt-1 border-t border-gray-100">
          <Field label="Date" value={formatDate(recall.created_at)} />
          <Field label="Time to complete" value={recallDurationLabel(recall.time_started, recall.time_completed)} />
          <Field label="Conducted by" value={recall.conducted_by || "—"} />
          <Field label="Signed off by" value={recall.signed_off_by || "—"} />
        </div>
      </div>

      {/* Mass balance */}
      <div className="card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Mass-balance reconciliation</p>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-gray-900">{(mb?.produced ?? 0).toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-0.5">units produced</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{(mb?.dispatched ?? 0).toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-0.5">units dispatched</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{(mb?.remaining ?? 0).toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-0.5">unaccounted / in stock</p>
          </div>
        </div>
        {mb && (mb.produced === 0 ? (
          <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded px-3 py-2">No “units produced” figure recorded on the traced batch(es).</p>
        ) : mb.reconciled ? (
          <p className="mt-3 text-xs text-green-700 bg-green-50 rounded px-3 py-2">✓ Reconciles — dispatched units do not exceed units produced.</p>
        ) : (
          <p className="mt-3 text-xs text-red-700 bg-red-50 rounded px-3 py-2">⚠ Does not reconcile — more units dispatched than produced.</p>
        ))}
      </div>

      {/* The frozen chain */}
      <TraceChain result={recall.trace_snapshot} defaultOpen linkBack={`/compliance/traceability/recalls/${recall.id}`} />

      {/* Findings */}
      <div className="card p-5 space-y-4">
        <ReportText label="Findings" value={recall.findings} />
        <ReportText label="Corrective actions" value={recall.corrective_actions} />

        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">Customers contacted</p>
          {customers.length === 0 ? (
            <p className="text-sm text-gray-400">None recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs">
                  <th className="text-left py-1 font-medium">Customer</th>
                  <th className="text-left py-1 font-medium">Response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map((c, i) => (
                  <tr key={i}>
                    <td className="py-1.5 font-medium text-gray-900">{c.customer}</td>
                    <td className="py-1.5 text-gray-600">{c.response || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
          Test started {recall.time_started ? formatDateTime(recall.time_started) : "—"} · completed {recall.time_completed ? formatDateTime(recall.time_completed) : "—"}
        </p>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-medium text-gray-900">{value}</p>
    </div>
  );
}

function ReportText({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-600 mb-1">{label}</p>
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{value?.trim() || <span className="text-gray-400">—</span>}</p>
    </div>
  );
}
