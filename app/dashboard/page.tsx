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
  // Quick time-range presets. Default to this week so the page opens with a
  // manageable recent view; custom From/To dates override the preset.
  const [rangePreset, setRangePreset] = useState<"this_week" | "last_week" | "this_month" | "last_month" | "all">("this_week");

  // [fromISO, toISO) — to is exclusive (start of the day after the range ends)
  function presetBounds(preset: typeof rangePreset): [string, string] | null {
    if (preset === "all") return null;
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    // Week starts Monday
    const dow = (now.getDay() + 6) % 7;
    const monday = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow));
    if (preset === "this_week") {
      const end = new Date(monday); end.setDate(end.getDate() + 7);
      return [iso(monday), iso(end)];
    }
    if (preset === "last_week") {
      const start = new Date(monday); start.setDate(start.getDate() - 7);
      return [iso(start), iso(monday)];
    }
    if (preset === "this_month") {
      return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(new Date(now.getFullYear(), now.getMonth() + 1, 1))];
    }
    // last_month
    return [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 1))];
  }

  useEffect(() => {
    async function load() {
      const [clRes, subRes] = await Promise.all([
        supabase.from("checklists").select("*").eq("active", true).order("name"),
        supabase
          .from("submissions")
          .select("*, checklist:checklists(*)")
          .order("submitted_at", { ascending: false }),
      ]);
      if (clRes.data) setChecklists(clRes.data);
      if (subRes.data) setSubmissions(subRes.data as SubmissionWithChecklist[]);
      setLoading(false);
    }
    load();
  }, []);

  // Custom From/To dates take precedence over the quick-range preset
  const usingCustomDates = Boolean(dateFrom || dateTo);
  const bounds = usingCustomDates ? null : presetBounds(rangePreset);

  const filtered = submissions.filter((s) => {
    if (filterChecklist && s.checklist_id !== filterChecklist) return false;
    if (filterSigned === "pending" && s.signed_off_at) return false;
    if (filterSigned === "signed" && !s.signed_off_at) return false;
    if (dateFrom && s.submitted_at < dateFrom) return false;
    if (dateTo && s.submitted_at > dateTo + "T23:59:59") return false;
    if (bounds && (s.submitted_at < bounds[0] || s.submitted_at >= bounds[1])) return false;
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

  function getRowSecondary(s: SubmissionWithChecklist): string {
    const clName = s.checklist?.name?.toLowerCase() ?? "";
    if (clName.includes("goods in") && s.batch_notes) {
      const line = s.batch_notes.split("\n").find(l => l.startsWith("Supplier:"));
      if (line) return line.slice("Supplier:".length).trim();
    }
    if (clName.includes("goods out") && s.batch_notes) {
      const line = s.batch_notes.split("\n").find(l => l.startsWith("Customer:"));
      if (line) return line.slice("Customer:".length).trim();
    }
    return s.submitted_by;
  }

  return (
    <PortalShell>
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-6xl w-full mx-auto space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold text-gray-900">Checklist Submissions</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{filtered.length} records</span>
            <button onClick={handleExport} disabled={exporting || loading} className="btn-secondary text-sm">
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </div>
        {/* Quick time ranges */}
        <div className="flex flex-wrap gap-2">
          {([
            ["this_week", "This week"],
            ["last_week", "Last week"],
            ["this_month", "This month"],
            ["last_month", "Last month"],
            ["all", "All time"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setRangePreset(key); setDateFrom(""); setDateTo(""); }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                !usingCustomDates && rangePreset === key
                  ? "bg-brand text-brown"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="card p-4 space-y-3">
          <div>
            <label className="label mb-1">Checklist</label>
            <select
              value={filterChecklist}
              onChange={(e) => setFilterChecklist(e.target.value)}
              className="input w-full"
            >
              <option value="">All checklists</option>
              {checklists.map((cl) => (
                <option key={cl.id} value={cl.id}>{cl.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label mb-1">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input w-full"
              />
            </div>
            <div>
              <label className="label mb-1">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input w-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
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
            {(dateFrom || dateTo || filterChecklist || filterSigned !== "all") && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); setFilterChecklist(""); setFilterSigned("all"); setRangePreset("this_week"); }}
                className="text-xs text-gray-400 hover:text-gray-600 ml-auto"
              >
                Clear filters
              </button>
            )}
          </div>
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
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Submitted by / Supplier</th>
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
                      </td>
                      <td className="px-4 py-3 text-gray-700">{getRowSecondary(s)}</td>
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
