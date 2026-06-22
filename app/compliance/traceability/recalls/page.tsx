"use client";
import BackButton from "@/components/BackButton";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import { formatDate } from "@/lib/utils";
import { recallDurationLabel, outcomeBadge, type MockRecallRow } from "@/lib/mock-recall";

export default function RecallsListPage() {
  const { orgId } = useOrganisation();
  const [recalls, setRecalls] = useState<MockRecallRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("mock_recalls")
      .select("id, direction, trigger_type, trigger_label, outcome, time_started, time_completed, conducted_by, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setRecalls((data ?? []) as MockRecallRow[]);
        setLoading(false);
      });
  }, [orgId]);

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-4xl w-full mx-auto space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-xl font-bold text-gray-900">Mock recall reports</h1>
        </div>
        <Link href="/compliance/traceability/mock-recall" className="btn-primary text-sm">Begin mock recall</Link>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : recalls.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-600 mb-1">No mock recalls yet.</p>
          <p className="text-xs text-gray-400 mb-4">Run a forward or backward traceability test to build your audit history.</p>
          <Link href="/compliance/traceability/mock-recall" className="btn-primary text-sm">Begin mock recall</Link>
        </div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {recalls.map((r) => {
            const badge = outcomeBadge(r.outcome);
            return (
              <Link
                key={r.id}
                href={`/compliance/traceability/recalls/${r.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-brand/5 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{r.trigger_label}</p>
                  <p className="text-xs text-gray-500">
                    {r.direction === "forward" ? "Forward" : "Backward"} · {formatDate(r.created_at)} · {r.conducted_by || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs">
                  <span className="text-gray-400 hidden sm:block">{recallDurationLabel(r.time_started, r.time_completed)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 font-medium ${badge.className}`}>{badge.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
