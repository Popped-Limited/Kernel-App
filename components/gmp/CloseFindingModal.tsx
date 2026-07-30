"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { uploadGmpPhoto, RISK_CHIP, RISK_LABEL, type GmpFinding } from "@/lib/gmp";
import { formatDate } from "@/lib/utils";
import PhotoPicker from "@/components/gmp/PhotoPicker";

// Close-out for a GMP finding: the assignee records what was done, with an
// optional "after" photo, stamped with who closed it and when. Used from both
// the GMP Audits live list and the audit detail page.

export default function CloseFindingModal({
  finding,
  areaName,
  onDone,
  onCancel,
}: {
  finding: GmpFinding;
  areaName: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function closeOut() {
    if (!note.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (const f of photos) {
        urls.push(await uploadGmpPhoto(f, finding.organisation_id, finding.audit_id));
      }
      const { data: { user } } = await supabase.auth.getUser();
      const closedBy = user?.user_metadata?.full_name ?? user?.email ?? "";
      const { error: e } = await supabase
        .from("gmp_findings")
        .update({
          status: "closed",
          close_note: note.trim(),
          close_photos: urls,
          closed_by: closedBy,
          closed_at: new Date().toISOString(),
        })
        .eq("id", finding.id)
        .eq("status", "open"); // never re-close (protects the original close-out record)
      if (e) throw new Error(e.message);
      onDone();
    } catch (err: any) {
      setError(err?.message === "photo-upload-failed"
        ? "Photo upload failed — please try again. The finding has NOT been closed."
        : (err?.message ?? "Something went wrong"));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
      <div className="card w-full max-w-md p-6 space-y-4 my-8">
        <h3 className="font-semibold text-gray-900">Close out finding</h3>

        <div className="bg-brand-cream rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${RISK_CHIP[finding.risk]}`}>
              {RISK_LABEL[finding.risk]} risk
            </span>
            {areaName && <span className="text-xs text-gray-500">{areaName}</span>}
          </div>
          <p className="text-sm text-gray-800">{finding.description}</p>
          {finding.action_plan && <p className="text-xs text-gray-500">Action plan: {finding.action_plan}</p>}
          {finding.due_date && <p className="text-xs text-gray-500">Due {formatDate(finding.due_date)}</p>}
        </div>

        <div>
          <label className="label">What was done? *</label>
          <textarea
            className="input resize-none"
            rows={3}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Damaged door seal replaced, engineer visit 30/07"
            autoFocus
          />
        </div>

        <div>
          <label className="label">After photo <span className="text-gray-400 font-normal">(optional)</span></label>
          <PhotoPicker photos={photos} onChange={setPhotos} />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button onClick={closeOut} disabled={saving || !note.trim()} className="btn-primary flex-1">
            {saving ? "Closing…" : "Mark closed"}
          </button>
          <button onClick={onCancel} disabled={saving} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}
