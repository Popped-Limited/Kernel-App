"use client";
import BackButton from "@/components/BackButton";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Checklist, Submission, Answer, Question } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import PortalShell from "@/components/PortalShell";

type FullSubmission = Submission & {
  checklist: Checklist;
  answers: (Answer & { question: Question })[];
  batch_notes?: string | null;
};

export default function SubmissionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const backHref = searchParams.get("back") ?? "/home";
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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold text-gray-900">
              {submission.checklist?.name ?? <span className="text-gray-400 italic font-normal">Deleted checklist</span>}
            </h1>
          </div>
          <div className="flex items-center gap-2">
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
            let inProducts = false;
            for (const line of lines) {
              if (line === "Products:") { inProducts = true; continue; }
              if (inProducts && line.startsWith("•")) {
                products.push(line.replace(/^•\s*/, ""));
                continue;
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
        {submission.answers.length > 0 && (
          <div className="card divide-y divide-gray-100">
            {submission.answers.map((a) => (
              <AnswerRow key={a.id} answer={a} />
            ))}
          </div>
        )}

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

function AnswerRow({ answer }: { answer: Answer }) {
  const q = answer.question;
  const val = answer.value;

  let display: React.ReactNode;

  if (!val || val === "null") {
    display = <span className="text-gray-400 text-sm italic">Not answered</span>;
  } else if (q?.type === "checkbox") {
    display = (
      <span className={`badge ${val === "true" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
        {val === "true" ? "✓ Yes / Pass" : "✗ No / Fail"}
      </span>
    );
  } else if (q?.type === "photo") {
    display = val.startsWith("http") ? (
      <a href={val} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={val} alt="Photo" className="mt-1 h-32 rounded-lg object-cover border border-gray-200 hover:opacity-90 transition" />
      </a>
    ) : <span className="text-gray-400 text-sm italic">Photo not available</span>;
  } else if (q?.type === "signature") {
    display = val.startsWith("data:") ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={val} alt="Signature" className="mt-1 h-16 rounded border border-gray-200 bg-white" />
    ) : <span className="text-gray-400 text-sm italic">No signature</span>;
  } else if (q?.type === "multiple_choice") {
    try {
      const parsed = JSON.parse(val);
      const items: string[] = Array.isArray(parsed) ? parsed : (parsed.selected ?? []);
      const followUpText: string = Array.isArray(parsed) ? "" : (parsed.followUp ?? "");
      display = (
        <div className="mt-1 space-y-1">
          <div className="flex flex-wrap gap-1">
            {items.map((i) => <span key={i} className="badge bg-brand-cream text-brown">{i}</span>)}
          </div>
          {followUpText && (
            <p className="text-sm text-gray-700 pl-1 italic">"{followUpText}"</p>
          )}
        </div>
      );
    } catch { display = <p className="text-sm text-gray-900">{val}</p>; }
  } else if (q?.type === "multi_number") {
    try {
      const nums: string[] = JSON.parse(val);
      const parsed = nums.map(Number).filter(n => !isNaN(n));
      const min = parsed.length ? Math.min(...parsed) : null;
      const avg = parsed.length ? parsed.reduce((a, b) => a + b, 0) / parsed.length : null;
      display = (
        <div>
          <div className="flex flex-wrap gap-2 mt-1">
            {nums.map((n, i) => (
              <span key={i} className="inline-block bg-gray-100 rounded px-2 py-0.5 text-sm font-mono font-medium text-gray-900">{n}</span>
            ))}
          </div>
          {min !== null && (
            <p className="text-xs text-gray-500 mt-1">Min: <strong>{min}</strong> · Avg: <strong>{avg?.toFixed(1)}</strong></p>
          )}
        </div>
      );
    } catch { display = <p className="text-sm text-gray-900">{val}</p>; }
  } else if (q?.type === "ingredient_table") {
    try {
      const parsedVal = JSON.parse(val);
      const rows: Array<{ name: string; lots: Array<{ julian_code: string; weight_g: string }> }> =
        Array.isArray(parsedVal) ? parsedVal : (parsedVal?.rows ?? []);
      display = (
        <div className="mt-1 rounded-lg border border-gray-200 overflow-hidden text-xs">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Ingredient</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Julian code</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">Weight (g)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.flatMap(row =>
                (row.lots ?? []).map((lot, i) => (
                  <tr key={`${row.name}-${i}`}>
                    <td className="px-3 py-1.5 text-gray-900 font-medium">{i === 0 ? row.name : ""}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-700">{lot.julian_code}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-900">{Number(lot.weight_g).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      );
    } catch { display = <p className="text-sm text-gray-900">{val}</p>; }
  } else if (q?.type === "packing_runs") {
    try {
      const runs: Array<{ pack_weight: string; jars_used: string; jar_batch: string; lids_count: string; lids_batch: string; packed_by: string }> = JSON.parse(val);
      display = (
        <div className="mt-1 rounded-lg border border-gray-200 overflow-hidden text-xs">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Pack weight</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Jars</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Jar batch</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Lids</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Lid batch</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Packed by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.filter(r => r.pack_weight || r.jars_used).map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 tabular-nums font-medium text-gray-900">{r.pack_weight}g</td>
                  <td className="px-3 py-1.5 tabular-nums text-gray-700">{r.jars_used}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-600">{r.jar_batch || "—"}</td>
                  <td className="px-3 py-1.5 tabular-nums text-gray-700">{r.lids_count || "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-600">{r.lids_batch || "—"}</td>
                  <td className="px-3 py-1.5 text-gray-700">{r.packed_by || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } catch { display = <p className="text-sm text-gray-900">{val}</p>; }
  } else {
    display = <p className="text-sm text-gray-900">{val}</p>;
  }

  return (
    <div className="px-5 py-3">
      <p className="text-xs text-gray-500 font-medium mb-0.5">{q?.label ?? "Question"}</p>
      {display}
    </div>
  );
}
