"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface TeamMember { id: string; name: string; position: string | null; active: boolean; }
interface TrainingItem { id: string; name: string; sort_order: number; active: boolean; document_path?: string | null; }
interface TrainingRecord {
  id: string;
  team_member_id: string;
  training_item_id: string;
  completed_at: string | null;
  completed_by: string | null;
}

type Step = "select" | "slides" | "signoff" | "done";

export default function TrainingSessionFlow({ members, items, records, orgId, onClose, onSaved }: {
  members: TeamMember[];
  items: TrainingItem[];
  records: TrainingRecord[];
  orgId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<Step>("select");
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [itemIds, setItemIds] = useState<Set<string>>(new Set());

  // Slideshow
  const [slideIdx, setSlideIdx] = useState(0);
  const [slideUrl, setSlideUrl] = useState<string | null>(null);
  const [slideLoading, setSlideLoading] = useState(false);

  // Sign-off
  const [signDate, setSignDate] = useState(new Date().toISOString().slice(0, 10));
  const [signBy, setSignBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedItems = items.filter(i => itemIds.has(i.id));
  const docItems = selectedItems.filter(i => i.document_path);

  function toggle(id: string, update: React.Dispatch<React.SetStateAction<Set<string>>>) {
    update(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Load a signed URL for the current slide's document
  useEffect(() => {
    if (step !== "slides" || !docItems[slideIdx]?.document_path) { setSlideUrl(null); return; }
    let cancelled = false;
    setSlideLoading(true);
    supabase.storage.from("team-documents").createSignedUrl(docItems[slideIdx].document_path!, 3600)
      .then(({ data }) => {
        if (!cancelled) { setSlideUrl(data?.signedUrl ?? null); setSlideLoading(false); }
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, slideIdx]);

  function begin() {
    setSlideIdx(0);
    setStep(docItems.length > 0 ? "slides" : "signoff");
  }

  async function saveSession() {
    if (!signBy.trim() || !signDate) return;
    setSaving(true);
    setError("");

    // Index existing records so we update rather than duplicate
    const existing: Record<string, TrainingRecord> = {};
    for (const r of records) existing[`${r.team_member_id}|${r.training_item_id}`] = r;

    try {
      for (const mId of memberIds) {
        for (const iId of itemIds) {
          const prev = existing[`${mId}|${iId}`];
          if (prev) {
            const { error: e } = await supabase.from("training_records")
              .update({ completed_at: signDate, completed_by: signBy.trim() })
              .eq("id", prev.id);
            if (e) throw e;
          } else {
            const { error: e } = await supabase.from("training_records").insert({
              team_member_id: mId,
              training_item_id: iId,
              completed_at: signDate,
              completed_by: signBy.trim(),
              organisation_id: orgId,
            });
            if (e) throw e;
          }
        }
      }
      // Audit row — non-fatal if the table hasn't been migrated yet
      await supabase.from("training_sessions").insert({
        organisation_id: orgId,
        session_date: signDate,
        signed_off_by: signBy.trim(),
        team_member_ids: [...memberIds],
        training_item_ids: [...itemIds],
      });
      setStep("done");
      onSaved();
    } catch (e) {
      setError("Failed to save — please try again. " + ((e as Error)?.message ?? ""));
    }
    setSaving(false);
  }

  const isPdf = (path: string) => path.toLowerCase().endsWith(".pdf");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={step === "slides" ? undefined : onClose} />

      {/* ── Step 1: pick people + topics ── */}
      {step === "select" && (
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">Begin training session</h3>
            <p className="text-sm text-gray-500 mt-0.5">Choose who&apos;s taking part and what they&apos;re being trained on.</p>
          </div>

          <div>
            <p className="label">Team members taking part</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {members.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id, setMemberIds)}
                  className={`rounded-lg border px-3 py-2 text-sm text-left transition ${
                    memberIds.has(m.id) ? "border-brand bg-brand/10 font-medium text-gray-900" : "border-gray-200 text-gray-600 hover:bg-brand-light"
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label">Training areas</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {items.map(i => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => toggle(i.id, setItemIds)}
                  className={`rounded-lg border px-3 py-2 text-sm text-left transition flex items-center gap-2 ${
                    itemIds.has(i.id) ? "border-brand bg-brand/10 font-medium text-gray-900" : "border-gray-200 text-gray-600 hover:bg-brand-light"
                  }`}
                >
                  <span className="flex-1">{i.name}</span>
                  {i.document_path && (
                    <svg className="h-3.5 w-3.5 shrink-0 text-brown/60" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V5L9 1z"/><path d="M9 1v4h4"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
            {selectedItems.length > 0 && docItems.length < selectedItems.length && (
              <p className="text-xs text-gray-400 mt-2">
                {`${selectedItems.length - docItems.length} selected area${selectedItems.length - docItems.length === 1 ? " has no document uploaded" : "s have no documents uploaded"} — they'll be included in the sign-off but skipped in the slideshow.`}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
            <button onClick={begin} disabled={memberIds.size === 0 || itemIds.size === 0} className="btn-primary text-sm">
              {docItems.length > 0 ? `Begin training (${docItems.length} document${docItems.length === 1 ? "" : "s"})` : "Begin training"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: document slideshow ── */}
      {step === "slides" && docItems[slideIdx] && (
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
            <div>
              <p className="text-xs text-gray-400">Document {slideIdx + 1} of {docItems.length}</p>
              <h3 className="font-semibold text-gray-900">{docItems[slideIdx].name}</h3>
            </div>
            <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 transition">Exit session</button>
          </div>

          <div className="flex-1 bg-gray-100 min-h-0">
            {slideLoading || !slideUrl ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">Loading document…</div>
            ) : isPdf(docItems[slideIdx].document_path!) ? (
              <iframe src={slideUrl} className="w-full h-full" title={docItems[slideIdx].name} />
            ) : (
              <div className="h-full overflow-auto flex items-start justify-center p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slideUrl} alt={docItems[slideIdx].name} className="max-w-full" />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 shrink-0">
            <button
              onClick={() => setSlideIdx(i => i - 1)}
              disabled={slideIdx === 0}
              className="btn-secondary text-sm disabled:opacity-40"
            >
              ← Previous
            </button>
            <div className="flex gap-1.5">
              {docItems.map((_, i) => (
                <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === slideIdx ? "bg-brand-dark" : i < slideIdx ? "bg-brand" : "bg-gray-300"}`} />
              ))}
            </div>
            {slideIdx < docItems.length - 1 ? (
              <button onClick={() => setSlideIdx(i => i + 1)} className="btn-primary text-sm">Next →</button>
            ) : (
              <button onClick={() => setStep("signoff")} className="btn-primary text-sm">Continue to sign-off →</button>
            )}
          </div>
        </div>
      )}

      {/* ── Step 3: sign-off ── */}
      {step === "signoff" && (
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">Sign off training</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              This marks {itemIds.size} training area{itemIds.size === 1 ? "" : "s"} complete for {memberIds.size} team member{memberIds.size === 1 ? "" : "s"}.
            </p>
          </div>

          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 space-y-1.5">
            <p><span className="font-semibold">Team:</span> {members.filter(m => memberIds.has(m.id)).map(m => m.name).join(", ")}</p>
            <p><span className="font-semibold">Areas:</span> {selectedItems.map(i => i.name).join(", ")}</p>
          </div>

          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={signDate} onChange={e => setSignDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Signed off by</label>
            <input type="text" className="input" value={signBy} onChange={e => setSignBy(e.target.value)} placeholder="Trainer / manager name" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-between pt-1">
            {docItems.length > 0 ? (
              <button onClick={() => setStep("slides")} className="btn-ghost text-sm">← Back to documents</button>
            ) : <span />}
            <button onClick={saveSession} disabled={saving || !signBy.trim() || !signDate} className="btn-primary text-sm">
              {saving ? "Saving…" : "Complete training"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: done ── */}
      {step === "done" && (
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-8 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand/20">
            <svg className="h-7 w-7 text-brown" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">Training recorded</h3>
            <p className="text-sm text-gray-500 mt-1">
              {memberIds.size} team member{memberIds.size === 1 ? "" : "s"} signed off across {itemIds.size} training area{itemIds.size === 1 ? "" : "s"}.
            </p>
          </div>
          <button onClick={onClose} className="btn-primary w-full text-sm">Back to matrix</button>
        </div>
      )}
    </div>
  );
}
