"use client";
import BackButton from "@/components/BackButton";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Checklist, Submission, Answer, Question } from "@/lib/types";
import { formatDateTime, frequencyLabel, frequencyBadgeColor } from "@/lib/utils";
import PortalShell from "@/components/PortalShell";

type SubmissionWithChecklist = Submission & { checklist: Checklist };

function SubmissionsPageInner() {
  const searchParams = useSearchParams();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionWithChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filterChecklist, setFilterChecklist] = useState("");
  const [filterSigned, setFilterSigned] = useState<"all" | "pending" | "signed">(
    searchParams.get("filter") === "pending" ? "pending" : "all"
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    async function load() {
      const [clRes, subRes] = await Promise.all([
        supabase.from("checklists").select("*").eq("active", true).order("name"),
        supabase
          .from("submissions")
          .select("*, checklist:checklists(*)")
          .order("submitted_at", { ascending: false })
          .limit(500),
      ]);
      if (clRes.data) setChecklists(clRes.data);
      if (subRes.data) setSubmissions(subRes.data as SubmissionWithChecklist[]);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = submissions.filter((s) => {
    if (filterChecklist && s.checklist_id !== filterChecklist) return false;
    if (filterSigned === "pending" && s.signed_off_at) return false;
    if (filterSigned === "signed" && !s.signed_off_at) return false;
    if (dateFrom && s.submitted_at < dateFrom) return false;
    if (dateTo && s.submitted_at > dateTo + "T23:59:59") return false;
    return true;
  });

  async function handleExport() {
    setExporting(true);
    try {
      const ids = filtered.map((s) => s.id);
      if (ids.length === 0) {
        alert("No submissions to export.");
        setExporting(false);
        return;
      }

      // Fetch answers + questions for filtered submissions
      const { data: answers } = await supabase
        .from("answers")
        .select("*, question:questions(*)")
        .in("submission_id", ids);

      const answerMap: Record<string, (Answer & { question: Question })[]> = {};
      for (const a of (answers ?? []) as (Answer & { question: Question })[]) {
        if (!answerMap[a.submission_id]) answerMap[a.submission_id] = [];
        answerMap[a.submission_id].push(a);
      }

      const rows: string[][] = [];
      rows.push([
        "Date",
        "Time",
        "Checklist",
        "Category",
        "Submitted By",
        "Signed Off",
        "Signed Off By",
        "Signed Off At",
        "Question",
        "Answer",
      ]);

      for (const s of filtered) {
        const submittedAt = new Date(s.submitted_at);
        const date = submittedAt.toLocaleDateString("en-GB");
        const time = submittedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        const checklist = s.checklist?.name ?? "(Deleted checklist)";
        const category = s.checklist?.category ?? "Uncategorised";
        const submittedBy = s.submitted_by;
        const signedOff = s.signed_off_at ? "Yes" : "No";
        const signedOffBy = s.signed_off_by ?? "";
        const signedOffAt = s.signed_off_at
          ? new Date(s.signed_off_at).toLocaleString("en-GB")
          : "";

        const subAnswers = answerMap[s.id] ?? [];
        if (subAnswers.length === 0) {
          rows.push([date, time, checklist, category, submittedBy, signedOff, signedOffBy, signedOffAt, "", ""]);
        } else {
          const sorted = [...subAnswers].sort(
            (a, b) => (a.question?.order_index ?? 0) - (b.question?.order_index ?? 0)
          );
          for (const ans of sorted) {
            const question = ans.question?.label ?? "";
            let value = ans.value ?? "";
            // Pretty-print JSON arrays (multiple_choice)
            try {
              const parsed = JSON.parse(value);
              if (Array.isArray(parsed)) value = parsed.join(", ");
            } catch {}
            rows.push([date, time, checklist, category, submittedBy, signedOff, signedOffBy, signedOffAt, question, value]);
          }
        }
      }

      const csv = rows
        .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const label = dateFrom && dateTo
        ? `kernel-export-${dateFrom}-to-${dateTo}`
        : `kernel-export-${new Date().toISOString().slice(0, 10)}`;
      a.href = url;
      a.download = `${label}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <PortalShell>
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 min-h-[68px]">
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-base font-semibold text-gray-900">All Submissions</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{filtered.length} records</span>
            <button
              onClick={handleExport}
              disabled={exporting || loading}
              className="btn-secondary text-xs"
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-4">
        {/* Filters */}
        <div className="card p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="label mb-1">Checklist</label>
            <select
              value={filterChecklist}
              onChange={(e) => setFilterChecklist(e.target.value)}
              className="input max-w-xs"
            >
              <option value="">All checklists</option>
              {checklists.map((cl) => (
                <option key={cl.id} value={cl.id}>{cl.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input w-40"
            />
          </div>

          <div>
            <label className="label mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input w-40"
            />
          </div>

          <div className="flex gap-2">
            {(["all", "pending", "signed"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setFilterSigned(v)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  filterSigned === v ? "bg-brand text-brown" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {v === "all" ? "All" : v === "pending" ? "Pending" : "Signed off"}
              </button>
            ))}
          </div>

          {(dateFrom || dateTo || filterChecklist || filterSigned !== "all") && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); setFilterChecklist(""); setFilterSigned("all"); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="card p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="card p-8 text-center text-sm text-gray-500">No submissions found.</div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Checklist</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Submitted by</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Date / Time</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {s.checklist?.name ?? <span className="text-gray-400 italic">Deleted checklist</span>}
                        </p>
                        {s.checklist?.frequency && (
                          <span className={`badge text-xs mt-0.5 ${frequencyBadgeColor(s.checklist.frequency as never)}`}>
                            {frequencyLabel(s.checklist.frequency as never)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{s.submitted_by}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDateTime(s.submitted_at)}</td>
                      <td className="px-4 py-3">
                        {s.signed_off_at ? (
                          <span className="badge bg-brand/30 text-brown">Signed off</span>
                        ) : (
                          <span className="badge bg-amber-100 text-amber-700">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/submission/${s.id}`} className="text-brown/80 hover:text-brown hover:underline font-medium">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </PortalShell>
  );
}

export default function SubmissionsPage() {
  return (
    <Suspense>
      <SubmissionsPageInner />
    </Suspense>
  );
}
