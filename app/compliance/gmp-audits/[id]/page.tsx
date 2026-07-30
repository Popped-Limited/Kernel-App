"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import { formatDate } from "@/lib/utils";
import type { TeamMember } from "@/lib/types";
import CloseFindingModal from "@/components/gmp/CloseFindingModal";
import PhotoPicker from "@/components/gmp/PhotoPicker";
import {
  RISK_CHIP, RISK_LABEL, dueDateForRisk, isOverdue, uploadGmpPhoto,
  type GmpAudit, type GmpFinding, type GmpRisk,
} from "@/lib/gmp";

// One GMP audit: the walkthrough record for a single area. While in progress
// the auditor adds findings (photos + what was discovered + risk + assignee);
// completing it freezes the record. Findings stay closable after completion.

export default function GmpAuditDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { orgId } = useOrganisation();

  const [audit, setAudit] = useState<GmpAudit | null>(null);
  const [findings, setFindings] = useState<GmpFinding[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [closing, setClosing] = useState<GmpFinding | null>(null);
  const [completing, setCompleting] = useState(false);
  const [emailWarning, setEmailWarning] = useState<string | null>(null);

  useEffect(() => { if (orgId && id) load(); }, [orgId, id]);

  async function load() {
    const [{ data: a }, { data: f }, { data: m }] = await Promise.all([
      supabase.from("gmp_audits").select("*, gmp_areas(name)").eq("id", id).single(),
      // Per-audit list — bounded by one walkthrough, no pagination needed
      supabase.from("gmp_findings").select("*").eq("audit_id", id).order("created_at"),
      supabase.from("team_members").select("*").eq("organisation_id", orgId).eq("active", true).order("name"),
    ]);
    if (!a) { router.push("/compliance/gmp-audits"); return; }
    setAudit(a as GmpAudit);
    setNotes((a as GmpAudit).notes ?? "");
    setFindings((f ?? []) as GmpFinding[]);
    setMembers((m ?? []) as TeamMember[]);
    setLoading(false);
  }

  async function saveNotes() {
    if (!audit || audit.status !== "in_progress") return;
    if ((audit.notes ?? "") === notes) return;
    await supabase.from("gmp_audits").update({ notes: notes || null }).eq("id", audit.id);
    setAudit({ ...audit, notes: notes || null });
  }

  async function completeAudit() {
    if (!audit) return;
    setCompleting(true);
    const { error } = await supabase
      .from("gmp_audits")
      .update({ status: "completed", completed_at: new Date().toISOString(), notes: notes || null })
      .eq("id", audit.id)
      .eq("status", "in_progress");
    if (error) {
      alert("Could not complete the audit: " + error.message);
      setCompleting(false);
      return;
    }
    router.push("/compliance/gmp-audits");
  }

  // After a finding with an assignee is saved, ask the server to email them.
  // The finding is already saved — a failed email must never look like a failed save.
  async function notifyAssignee(findingId: string) {
    try {
      const res = await fetch("/api/gmp/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finding_id: findingId }),
      });
      if (!res.ok) throw new Error();
      setEmailWarning(null);
    } catch {
      setEmailWarning("The finding was saved, but the notification email could not be sent — let the assignee know directly.");
    }
  }

  if (loading || !audit) {
    return <main className="flex-1 p-8"><p className="text-sm text-gray-400 text-center">Loading…</p></main>;
  }

  const editable = audit.status === "in_progress";
  const openCount = findings.filter(f => f.status === "open").length;

  return (
    <>
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-4xl w-full mx-auto space-y-6">
        <div>
          <Link href="/compliance/gmp-audits" className="text-xs text-gray-400 hover:text-gray-600">← GMP Audits</Link>
          <div className="flex items-center justify-between gap-2 flex-wrap mt-1">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{audit.gmp_areas?.name ?? "GMP audit"}</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatDate(audit.audit_date)} · {audit.auditor_name || "—"}
              </p>
            </div>
            <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${audit.status === "completed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              {audit.status === "completed" ? "Completed" : "In progress"}
            </span>
          </div>
        </div>

        {/* Walkthrough notes */}
        <section className="card p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Walkthrough notes</h2>
          {editable ? (
            <textarea
              className="input resize-none w-full"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="General observations from the walkthrough — what was checked, overall state of the area. If everything was in order, say so."
            />
          ) : (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{audit.notes || "No general notes recorded."}</p>
          )}
        </section>

        {/* Findings */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Findings ({findings.length})</h2>
            {editable && (
              <button onClick={() => setShowAdd(true)} className="btn-primary text-xs">+ Add finding</button>
            )}
          </div>

          {emailWarning && (
            <div className="card p-3 border-amber-300 bg-amber-50">
              <p className="text-xs text-amber-800">{emailWarning}</p>
            </div>
          )}

          {findings.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-sm text-gray-500">
                {editable
                  ? "No findings yet. Photograph anything that isn't right and record it here — or complete the audit with none if the area is in good order."
                  : "No findings — the area was in good order. ✓"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {findings.map(f => {
                const overdue = isOverdue(f);
                return (
                  <div key={f.id} className={`card p-4 space-y-3 ${f.status === "closed" ? "opacity-80" : ""}`}>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${RISK_CHIP[f.risk]}`}>
                          {RISK_LABEL[f.risk]} risk
                        </span>
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${f.status === "closed" ? "bg-green-100 text-green-700" : overdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                          {f.status === "closed" ? "Closed" : overdue ? "Overdue" : "Open"}
                        </span>
                      </div>
                      {f.status === "open" && (
                        <button onClick={() => setClosing(f)} className="btn-secondary text-xs">Close out</button>
                      )}
                    </div>

                    <p className="text-sm text-gray-800">{f.description}</p>
                    {f.action_plan && (
                      <p className="text-xs text-gray-600"><span className="font-medium">Action plan:</span> {f.action_plan}</p>
                    )}
                    <p className="text-xs text-gray-500">
                      {f.assigned_to_name ? <>Assigned to <span className="font-medium">{f.assigned_to_name}</span></> : "Unassigned"}
                      {f.due_date && (
                        <> · <span className={overdue ? "text-red-600 font-semibold" : ""}>due {formatDate(f.due_date)}</span></>
                      )}
                    </p>

                    {f.photos.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {f.photos.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`Finding photo ${i + 1}`} className="h-20 w-20 object-cover rounded-lg border border-gray-200" />
                          </a>
                        ))}
                      </div>
                    )}

                    {f.status === "closed" && (
                      <div className="bg-green-50 border border-green-100 rounded-lg p-3 space-y-2">
                        <p className="text-xs text-green-800">
                          <span className="font-semibold">Closed {f.closed_at ? formatDate(f.closed_at) : ""}</span>
                          {f.closed_by && <> by {f.closed_by}</>}
                          {f.close_note && <> — {f.close_note}</>}
                        </p>
                        {f.close_photos.length > 0 && (
                          <div className="flex gap-2 flex-wrap">
                            {f.close_photos.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt={`After photo ${i + 1}`} className="h-20 w-20 object-cover rounded-lg border border-green-200" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {editable && (
          <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-gray-500">
              {findings.length === 0
                ? "Completing with no findings records a clean audit of this area."
                : openCount > 0
                  ? `${openCount} open finding${openCount > 1 ? "s" : ""} will stay on the close-out list after completing.`
                  : "All findings closed."}
            </p>
            <button onClick={completeAudit} disabled={completing} className="btn-primary text-sm">
              {completing ? "Completing…" : "Complete audit ✓"}
            </button>
          </div>
        )}
      </main>

      {showAdd && orgId && (
        <AddFindingModal
          orgId={orgId}
          auditId={audit.id}
          members={members}
          onCancel={() => setShowAdd(false)}
          onSaved={findingId => {
            setShowAdd(false);
            load();
            if (findingId) notifyAssignee(findingId);
          }}
        />
      )}

      {closing && (
        <CloseFindingModal
          finding={closing}
          areaName={audit.gmp_areas?.name ?? null}
          onCancel={() => setClosing(null)}
          onDone={() => { setClosing(null); load(); }}
        />
      )}
    </>
  );
}

// ── Add finding ──────────────────────────────────────────────

function AddFindingModal({
  orgId, auditId, members, onCancel, onSaved,
}: {
  orgId: string;
  auditId: string;
  members: TeamMember[];
  onCancel: () => void;
  // findingId is passed back when an assignee was set (triggers the email)
  onSaved: (findingIdToNotify: string | null) => void;
}) {
  const [description, setDescription] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [risk, setRisk] = useState<GmpRisk | null>(null);
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTouched, setDueTouched] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickRisk(r: GmpRisk) {
    setRisk(r);
    // Auto due date from risk (high 7d / medium 30d / low 90d) unless hand-edited
    if (!dueTouched) setDueDate(dueDateForRisk(r));
  }

  async function save() {
    if (!description.trim() || !risk) return;
    setSaving(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (const file of photos) {
        urls.push(await uploadGmpPhoto(file, orgId, auditId));
      }
      const member = members.find(m => m.id === assignee) ?? null;
      const { data, error: e } = await supabase
        .from("gmp_findings")
        .insert({
          organisation_id: orgId,
          audit_id: auditId,
          description: description.trim(),
          action_plan: actionPlan.trim() || null,
          risk,
          photos: urls,
          assigned_to: member?.id ?? null,
          assigned_to_name: member?.name ?? null,
          due_date: dueDate || null,
        })
        .select("id")
        .single();
      if (e || !data) throw new Error(e?.message ?? "Could not save the finding");
      onSaved(member ? data.id : null);
    } catch (err: any) {
      setError(err?.message === "photo-upload-failed"
        ? "Photo upload failed — please try again. The finding has NOT been saved."
        : (err?.message ?? "Something went wrong"));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
      <div className="card w-full max-w-md p-6 space-y-4 my-8">
        <h3 className="font-semibold text-gray-900">Add finding</h3>

        <div>
          <label className="label">What did you find? *</label>
          <textarea
            className="input resize-none"
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Flaking paint above the filling line, ~1m section"
            autoFocus
          />
        </div>

        <div>
          <label className="label">Photos</label>
          <PhotoPicker photos={photos} onChange={setPhotos} />
        </div>

        <div>
          <label className="label">Risk *</label>
          <div className="flex gap-2">
            {(["high", "medium", "low"] as GmpRisk[]).map(r => (
              <button
                key={r}
                type="button"
                onClick={() => pickRisk(r)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition ${
                  risk === r
                    ? r === "high" ? "bg-red-100 border-red-300 text-red-700"
                      : r === "medium" ? "bg-amber-100 border-amber-300 text-amber-700"
                      : "bg-green-100 border-green-300 text-green-700"
                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {RISK_LABEL[r]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Action plan <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea
            className="input resize-none"
            rows={2}
            value={actionPlan}
            onChange={e => setActionPlan(e.target.value)}
            placeholder="What needs doing to put it right"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Assign to</label>
            <select className="input" value={assignee} onChange={e => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Due date</label>
            <input
              type="date"
              className="input"
              value={dueDate}
              onChange={e => { setDueTouched(true); setDueDate(e.target.value); }}
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button onClick={save} disabled={saving || !description.trim() || !risk} className="btn-primary flex-1">
            {saving ? "Saving…" : "Save finding"}
          </button>
          <button onClick={onCancel} disabled={saving} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}
