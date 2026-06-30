"use client";
import BackButton from "@/components/BackButton";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Checklist, Submission, Answer, Question } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import PortalShell from "@/components/PortalShell";
import AnswerRow from "@/components/AnswerRow";
import { getRunQuestionIds } from "@/lib/production-runs";

type FullSubmission = Submission & {
  checklist: Checklist;
  answers: (Answer & { question: Question })[];
  batch_notes?: string | null;
  run_count?: number | null;
  run_meta?: ({ units?: string } | null)[] | null;
};

export default function SubmissionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const backHref = searchParams.get("back") ?? "/dashboard";
  const [submission, setSubmission] = useState<FullSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOff, setSigningOff] = useState(false);
  const [managerName, setManagerName] = useState("");
  const [notes, setNotes] = useState("");
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  useEffect(() => {
    load();
    loadPending();
  }, [id]);

  async function loadPending() {
    const { data } = await supabase
      .from("submissions")
      .select("id")
      .is("signed_off_at", null)
      .order("submitted_at", { ascending: true });
    setPendingIds((data ?? []).map((s: { id: string }) => s.id));
  }

  async function load() {
    const { data, error } = await supabase
      .from("submissions")
      .select(`
        *,
        checklist:checklists(*),
        answers(*, question:questions(*))
      `)
      .eq("id", id)
      .single();

    if (error) { setLoading(false); return; }

    // Sort answers by question order
    if (data.answers) {
      data.answers.sort((a: Answer & { question: Question }, b: Answer & { question: Question }) =>
        (a.question?.order_index ?? 0) - (b.question?.order_index ?? 0)
      );
    }

    setSubmission(data as FullSubmission);
    setNotes(data.notes ?? "");
    setLoading(false);
  }

  async function handleSignOff() {
    if (!managerName.trim()) return;
    setSigningOff(true);

    const { error } = await supabase
      .from("submissions")
      .update({
        signed_off_by: managerName.trim(),
        signed_off_at: new Date().toISOString(),
        notes: notes || null,
      })
      .eq("id", id);

    if (!error) {
      await Promise.all([load(), loadPending()]);
    } else {
      alert("Sign-off failed — please try again.");
    }
    setSigningOff(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-gray-600">Submission not found.</p>
      </div>
    );
  }

  const isSigned = !!submission.signed_off_at;
  const nextPendingId = pendingIds.find(pid => pid !== id) ?? null;
  const pendingCount = pendingIds.filter(pid => pid !== id).length;

  return (
    <PortalShell>
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-3xl w-full mx-auto space-y-6">
        {/* Page header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <BackButton />
            <h1 className="text-xl font-bold text-gray-900 truncate">
              {submission.checklist?.name ?? <span className="text-gray-400 italic font-normal">Deleted checklist</span>}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isSigned ? (
              <span className="badge bg-brand/30 text-brown px-3 py-1">Signed off ✓</span>
            ) : (
              <span className="badge bg-amber-100 text-amber-700 px-3 py-1">Pending review</span>
            )}
            {nextPendingId && (
              <button
                onClick={() => router.push(`/submission/${nextPendingId}`)}
                className="btn-primary text-xs py-1 px-3"
              >
                Next to approve ({pendingCount}) →
              </button>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="card p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Submitted by</p>
              <p className="mt-0.5 font-medium text-gray-900">{submission.submitted_by}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Submitted at</p>
              <p className="mt-0.5 font-medium text-gray-900">{formatDateTime(submission.submitted_at)}</p>
            </div>
            {isSigned && (
              <>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Signed off by</p>
                  <p className="mt-0.5 font-medium text-brown">{submission.signed_off_by}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Signed off at</p>
                  <p className="mt-0.5 font-medium text-gray-900">{formatDateTime(submission.signed_off_at!)}</p>
                </div>
              </>
            )}
          </div>
          {submission.batch_notes && (() => {
            // Production batch notes are free text written by the operator —
            // show them verbatim. Only goods in/out records store structured
            // "Label: value" notes that should be parsed into fields below.
            if (submission.checklist?.category === "Production") {
              return (
                <div className="-mx-5 mt-3 border-t border-gray-100 px-5 py-3">
                  <p className="text-xs text-gray-500 font-medium mb-0.5">Batch notes</p>
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{submission.batch_notes}</p>
                </div>
              );
            }
            // Parse batch_notes into structured fields (same style as checklist answers)
            const lines = submission.batch_notes!.split("\n").map(l => l.trim()).filter(Boolean);
            const fields: { label: string; value: string }[] = [];
            const products: string[] = [];
            // Goods-in item lines: "Name: 70,200g (Lot: 26162) · BBE: 2027-08-27"
            const items: { name: string; qty: string; lot: string; bbe: string }[] = [];
            // Goods-out lines: "Product: 2×6, 1×3 (15 units) — Batch: GCO-123 · BBE: 2027-08-27"
            const dispatched: { name: string; breakdown: string; units: string; batch: string; bbe: string }[] = [];
            let inProducts = false;
            for (const line of lines) {
              if (line === "Products:" || line === "Items:") { inProducts = line === "Products:"; continue; }
              if (line.startsWith("•")) {
                const txt = line.replace(/^•\s*/, "");
                const m = txt.match(/^(.*?):\s*(.*?)\s*\(Lot:\s*([^)]*)\)(?:\s*·\s*BBE:\s*(.*))?$/);
                if (m) { items.push({ name: m[1], qty: m[2], lot: m[3], bbe: m[4] ?? "" }); continue; }
                const d = txt.match(/^(.*?):\s*(.*?)\s*\(([\d,]+)\s*units?\)(?:\s*—\s*(.*))?$/);
                if (d) {
                  const trace = d[4] ?? "";
                  const batch = trace.match(/Batch:\s*([^·]*)/)?.[1]?.trim() ?? "";
                  let bbe = trace.match(/BBE:\s*(.*)/)?.[1]?.trim() ?? "";
                  // Records saved before the BBE extraction fix may have a stray
                  // checkbox value ("true") baked in where the date should be
                  if (!/^\d{4}-\d{2}-\d{2}/.test(bbe)) bbe = "";
                  dispatched.push({ name: d[1], breakdown: d[2], units: d[3], batch, bbe });
                  continue;
                }
                if (inProducts) { products.push(txt); continue; }
              }
              if (!line.startsWith("•")) inProducts = false;
              const colonIdx = line.indexOf(":");
              if (colonIdx > 0) {
                const label = line.slice(0, colonIdx).trim();
                const value = line.slice(colonIdx + 1).trim();
                if (value) fields.push({ label, value });
              }
            }
            return (
              <div className="divide-y divide-gray-100 -mx-5 mt-3 border-t border-gray-100">
                {fields.map(f => (
                  <div key={f.label} className="px-5 py-3">
                    <p className="text-xs text-gray-500 font-medium mb-0.5">{f.label}</p>
                    <p className="text-sm text-gray-900">{f.value}</p>
                  </div>
                ))}
                {items.length > 0 && (
                  <div className="px-5 py-3">
                    <p className="text-xs text-gray-500 font-medium mb-1.5">Items received</p>
                    <div className="rounded-lg border border-gray-200 overflow-x-auto text-xs">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600">Ingredient</th>
                            <th className="text-right px-3 py-2 font-semibold text-gray-600">Quantity</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600">Batch code</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600">BBE</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {items.map((it, i) => (
                            <tr key={i}>
                              <td className="px-3 py-1.5 font-medium text-gray-900">{it.name}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-gray-900">{it.qty}</td>
                              <td className="px-3 py-1.5 font-mono text-gray-700">{it.lot}</td>
                              <td className="px-3 py-1.5 text-gray-700">{it.bbe || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {dispatched.length > 0 && (
                  <div className="px-5 py-3">
                    <p className="text-xs text-gray-500 font-medium mb-1.5">Products dispatched</p>
                    <div className="rounded-lg border border-gray-200 overflow-x-auto text-xs">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600">Product</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600">Breakdown</th>
                            <th className="text-right px-3 py-2 font-semibold text-gray-600">Units</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600">Batch code</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600">BBE</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {dispatched.map((d, i) => (
                            <tr key={i}>
                              <td className="px-3 py-1.5 font-medium text-gray-900">{d.name}</td>
                              <td className="px-3 py-1.5 text-gray-700">{d.breakdown}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-gray-900">{d.units}</td>
                              <td className="px-3 py-1.5 font-mono text-gray-700">{d.batch || "—"}</td>
                              <td className="px-3 py-1.5 text-gray-700">{d.bbe || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {products.length > 0 && (
                  <div className="px-5 py-3">
                    <p className="text-xs text-gray-500 font-medium mb-1.5">Products</p>
                    <div className="space-y-1">
                      {products.map((p, i) => (
                        <p key={i} className="text-sm text-gray-900">{p}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          {submission.notes && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
              <p className="text-xs text-gray-500 font-medium mb-1">Manager notes</p>
              <p className="text-sm text-gray-700">{submission.notes}</p>
            </div>
          )}
        </div>

        {/* Answers */}
        {submission.answers.length > 0 && (() => {
          const answers = submission.answers;
          const runCount = submission.run_count ?? 1;
          const questionsList = answers.map((a) => a.question).filter((q): q is Question => !!q);
          const runIds = getRunQuestionIds(questionsList);
          const isRun = (a: { question?: Question | null }) => !!a.question && runIds.has(a.question.id);

          // Single-run / non-production records render flat, exactly as before.
          if (runCount <= 1 || runIds.size === 0) {
            return (
              <div className="card divide-y divide-gray-100">
                {answers.map((a) => <AnswerRow key={a.id} answer={a} />)}
              </div>
            );
          }

          // Multi-run: master header → each run as its own batch record → master footer.
          const firstRunIdx = answers.findIndex(isRun);
          const header = answers.filter((a, i) => !isRun(a) && i < firstRunIdx);
          const runAnswers = answers.filter(isRun);
          const footer = answers.filter((a, i) => !isRun(a) && i >= firstRunIdx);

          const runVal = (value: string | null, r: number): string | null => {
            if (!value) return null;
            try {
              const p = JSON.parse(value);
              if (p && Array.isArray(p.__runs__)) return (p.__runs__[r] ?? null) as string | null;
            } catch { /* not a runs wrapper */ }
            return value;
          };

          return (
            <div className="space-y-4">
              {header.length > 0 && (
                <div className="card divide-y divide-gray-100">
                  {header.map((a) => <AnswerRow key={a.id} answer={a} />)}
                </div>
              )}

              {Array.from({ length: runCount }, (_, r) => {
                const units = submission.run_meta?.[r]?.units;
                return (
                  <div key={r} className="card overflow-hidden">
                    <div className="flex items-center justify-between bg-brand-cream/70 border-b border-brand/30 px-5 py-2.5">
                      <p className="text-sm font-semibold text-brown">Production run {r + 1} of {runCount}</p>
                      {units && <p className="text-xs text-brown-light">Units produced: <span className="font-semibold text-brown">{Number(units).toLocaleString()}</span></p>}
                    </div>
                    <div className="divide-y divide-gray-100">
                      {runAnswers.map((a) => (
                        <AnswerRow key={`${a.id}-${r}`} answer={{ value: runVal(a.value, r), question: a.question }} />
                      ))}
                    </div>
                  </div>
                );
              })}

              {footer.length > 0 && (
                <div className="card divide-y divide-gray-100">
                  {footer.map((a) => <AnswerRow key={a.id} answer={a} />)}
                </div>
              )}
            </div>
          );
        })()}

        {/* Next pending — shown after sign-off */}
        {isSigned && nextPendingId && (
          <div className="card p-5 flex flex-wrap items-center justify-between gap-3 bg-brand/5 border-brand/20">
            <p className="text-sm font-medium text-gray-900">{pendingCount} more submission{pendingCount !== 1 ? "s" : ""} waiting for approval</p>
            <button onClick={() => router.push(`/submission/${nextPendingId}`)} className="btn-primary shrink-0">
              Next to approve →
            </button>
          </div>
        )}

        {/* Sign off */}
        {!isSigned && (
          <div className="card p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">Manager Sign-Off</h3>
            <div>
              <label className="label">Your name</label>
              <input
                type="text"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                className="input"
                placeholder="e.g. Kernel Mustard"
              />
            </div>
            <div>
              <label className="label">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="input resize-none"
                placeholder="Any notes or observations…"
              />
            </div>
            <button
              onClick={handleSignOff}
              disabled={signingOff || !managerName.trim()}
              className="btn-primary w-full"
            >
              {signingOff ? "Signing off…" : "Sign off"}
            </button>
          </div>
        )}
      </main>
    </PortalShell>
  );
}

