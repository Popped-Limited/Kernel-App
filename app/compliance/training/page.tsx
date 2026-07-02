"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fetchAll } from "@/lib/fetchAll";
import { useOrganisation } from "@/contexts/OrganisationContext";
import TrainingSessionFlow from "@/components/TrainingSessionFlow";

interface TeamMember { id: string; name: string; position: string | null; active: boolean; }
interface TrainingItem { id: string; name: string; sort_order: number; active: boolean; document_path?: string | null; }
interface TrainingRecord {
  id: string;
  team_member_id: string;
  training_item_id: string;
  completed_at: string | null;
  completed_by: string | null;
}

type CellStatus = "none" | "ok" | "due_soon" | "overdue";

// The Employee Induction Record is the first row of the matrix. Unlike normal
// training items it is filled per employee as a multi-step checklist with a
// begin → continue (draft) → completed lifecycle, and once completed it stays
// completed permanently (induction is a one-time event — no annual review).
type InductionStatus = "begin" | "continue" | "completed";

interface InductionSubmission { team_member_id: string; submitted_at: string; }

function cellStatus(record: TrainingRecord | undefined): CellStatus {
  if (!record?.completed_at) return "none";
  const completed = new Date(record.completed_at);
  const reviewDue = new Date(completed);
  reviewDue.setFullYear(reviewDue.getFullYear() + 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((reviewDue.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 30) return "due_soon";
  return "ok";
}

const STATUS_STYLES: Record<CellStatus, string> = {
  none:     "bg-gray-50 hover:bg-gray-100 text-gray-300",
  ok:       "bg-green-50 hover:bg-green-100 text-green-600",
  due_soon: "bg-amber-50 hover:bg-amber-100 text-amber-600",
  overdue:  "bg-red-50 hover:bg-red-100 text-red-600",
};

export default function TrainingPage() {
  const { orgId } = useOrganisation();
  const router = useRouter();
  const [members, setMembers]     = useState<TeamMember[]>([]);
  const [items, setItems]         = useState<TrainingItem[]>([]);
  const [records, setRecords]     = useState<TrainingRecord[]>([]);
  const [loading, setLoading]     = useState(true);

  // Employee Induction Record (first matrix row) — looked up per org.
  const [inductionId, setInductionId] = useState<string | null>(null);
  const [inductionSubs, setInductionSubs] = useState<InductionSubmission[]>([]);
  const [inductionDraftMembers, setInductionDraftMembers] = useState<string[]>([]);

  // Modal state for marking complete
  const [modal, setModal] = useState<{ memberId: string; itemId: string; record?: TrainingRecord } | null>(null);
  const [modalDate, setModalDate] = useState("");
  const [modalBy, setModalBy]     = useState("");
  const [saving, setSaving]       = useState(false);

  // Training documents
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<TrainingItem | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [docMenu, setDocMenu] = useState<string | null>(null); // item id with open View/Update menu

  // Group training session flow
  const [sessionOpen, setSessionOpen] = useState(false);

  useEffect(() => { if (orgId) load(); }, [orgId]);

  async function load() {
    const [mRes, iRes, records] = await Promise.all([
      supabase.from("team_members").select("id,name,position,active").eq("active", true).order("name"),
      // select * so the page keeps working if document_path hasn't been migrated yet
      supabase.from("training_items").select("*").eq("active", true).order("sort_order"),
      // records = staff × training items — passes the 1000-row cap quickly, so paginate
      fetchAll<TrainingRecord>((from, to) =>
        supabase.from("training_records").select("*").order("id").range(from, to)),
    ]);
    setMembers((mRes.data ?? []) as TeamMember[]);
    setItems((iRes.data ?? []) as TrainingItem[]);
    setRecords(records);

    // Find this org's Employee Induction Record (RLS scopes to the org — never
    // hardcode an id). It's the per_new_start checklist named "…induction…".
    const { data: induction } = await supabase
      .from("checklists")
      .select("id")
      .ilike("name", "%induction%")
      .order("name")
      .limit(1)
      .maybeSingle();

    if (induction?.id) {
      setInductionId(induction.id);
      const [subs, drafts] = await Promise.all([
        fetchAll<InductionSubmission>((from, to) =>
          supabase.from("submissions").select("team_member_id, submitted_at")
            .eq("checklist_id", induction.id).not("team_member_id", "is", null).order("id").range(from, to)),
        fetchAll<{ team_member_id: string }>((from, to) =>
          supabase.from("batch_drafts").select("team_member_id")
            .eq("checklist_id", induction.id).not("team_member_id", "is", null).order("id").range(from, to)),
      ]);
      setInductionSubs(subs);
      setInductionDraftMembers(drafts.map(d => d.team_member_id));
    } else {
      setInductionId(null);
      setInductionSubs([]);
      setInductionDraftMembers([]);
    }

    setLoading(false);
  }

  // ── Training documents ───────────────────────────────────────────────────

  function pickDocument(item: TrainingItem) {
    uploadTargetRef.current = item;
    setDocMenu(null);
    fileInputRef.current?.click();
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    const item = uploadTargetRef.current;
    if (!file || !item || !orgId) return;

    setUploadingItemId(item.id);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
    const path = `training/${orgId}/${item.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("team-documents").upload(path, file, { upsert: true });
    if (upErr) {
      alert("Upload failed: " + upErr.message);
      setUploadingItemId(null);
      return;
    }
    const oldPath = item.document_path;
    const { error: dbErr } = await supabase.from("training_items").update({ document_path: path }).eq("id", item.id);
    if (dbErr) {
      alert("Could not link the document — has the training-documents migration been run? " + dbErr.message);
    } else if (oldPath) {
      // Tidy up the replaced file; non-fatal if it fails
      await supabase.storage.from("team-documents").remove([oldPath]);
    }
    setUploadingItemId(null);
    await load();
  }

  async function viewDocument(item: TrainingItem) {
    setDocMenu(null);
    if (!item.document_path) return;
    const { data } = await supabase.storage.from("team-documents").createSignedUrl(item.document_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  // Build fast lookup map
  const recordMap = useMemo(() => {
    const map: Record<string, Record<string, TrainingRecord>> = {};
    for (const r of records) {
      if (!map[r.team_member_id]) map[r.team_member_id] = {};
      map[r.team_member_id][r.training_item_id] = r;
    }
    return map;
  }, [records]);

  // Per-member induction status: a submission → completed (latest date),
  // else an in-progress draft → continue, else begin.
  const inductionByMember = useMemo(() => {
    const map: Record<string, { status: InductionStatus; completedAt?: string }> = {};
    const drafts = new Set(inductionDraftMembers);
    for (const s of inductionSubs) {
      const existing = map[s.team_member_id];
      if (!existing || (existing.completedAt && s.submitted_at > existing.completedAt)) {
        map[s.team_member_id] = { status: "completed", completedAt: s.submitted_at };
      }
    }
    for (const memberId of drafts) {
      if (!map[memberId]) map[memberId] = { status: "continue" };
    }
    return map;
  }, [inductionSubs, inductionDraftMembers]);

  function openInduction(memberId: string) {
    if (!inductionId) return;
    router.push(`/checklist/${inductionId}?member=${memberId}`);
  }

  function openCell(memberId: string, itemId: string) {
    const record = recordMap[memberId]?.[itemId];
    setModal({ memberId, itemId, record });
    setModalDate(record?.completed_at ?? new Date().toISOString().slice(0, 10));
    setModalBy(record?.completed_by ?? "");
  }

  async function saveRecord() {
    if (!modal) return;
    setSaving(true);
    const payload = {
      team_member_id:   modal.memberId,
      training_item_id: modal.itemId,
      completed_at:     modalDate || null,
      completed_by:     modalBy.trim() || null,
      organisation_id:  orgId,
    };
    const existing = recordMap[modal.memberId]?.[modal.itemId];
    if (existing) {
      await supabase.from("training_records").update({ completed_at: payload.completed_at, completed_by: payload.completed_by }).eq("id", existing.id);
    } else {
      await supabase.from("training_records").insert(payload);
    }
    await load();
    setSaving(false);
    setModal(null);
  }

  async function clearRecord() {
    if (!modal) return;
    const existing = recordMap[modal.memberId]?.[modal.itemId];
    if (existing) {
      await supabase.from("training_records").delete().eq("id", existing.id);
      await load();
    }
    setModal(null);
  }

  const memberName = (id: string) => members.find(m => m.id === id)?.name ?? "";
  const itemName   = (id: string) => items.find(i => i.id === id)?.name ?? "";

  // Summary stats
  const totalCells = members.length * items.length;
  const completedCells = records.filter(r => r.completed_at).length;
  const overdueCells  = records.filter(r => cellStatus(r) === "overdue").length;
  const dueSoonCells  = records.filter(r => cellStatus(r) === "due_soon").length;

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 max-w-full w-full mx-auto">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Training Portal</h1>
            <p className="text-sm text-gray-500 mt-0.5">Click any cell to mark training as complete · Click a training name to attach its policy document</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/admin/training-setup" className="btn-ghost text-sm">Manage training items →</a>
            <button
              onClick={() => setSessionOpen(true)}
              disabled={loading || members.length === 0 || items.length === 0}
              className="btn-primary text-sm"
            >
              Begin training session
            </button>
          </div>
        </div>

        {/* Summary pills */}
        {!loading && members.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="rounded-full bg-gray-100 text-gray-600 px-3 py-1 text-xs font-medium">{completedCells} / {totalCells} completed</span>
            {overdueCells > 0 && <span className="rounded-full bg-red-100 text-red-700 px-3 py-1 text-xs font-medium">{overdueCells} overdue review</span>}
            {dueSoonCells > 0 && <span className="rounded-full bg-amber-100 text-amber-700 px-3 py-1 text-xs font-medium">{dueSoonCells} due for review soon</span>}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-green-100 border border-green-200" />Completed</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-amber-100 border border-amber-200" />Review due soon (&lt;30 days)</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-red-100 border border-red-200" />Review overdue</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-gray-100 border border-gray-200" />Not completed</span>
        <span className="flex items-center gap-1.5 ml-1 pl-3 border-l border-gray-200">Induction: Begin → Continue → Completed</span>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
      ) : members.length === 0 ? (
        <div className="card p-8 text-center text-sm text-gray-400">Add staff members first to see the training matrix.</div>
      ) : items.length === 0 && !inductionId ? (
        <div className="card p-8 text-center text-sm text-gray-400">No active training items. Enable some in <a href="/admin/training-setup" className="underline text-brown">Manage Training</a>.</div>
      ) : (
        /* Scrollable matrix */
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="border-collapse" style={{ minWidth: `${180 + members.length * 130}px` }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {/* Sticky first column header */}
                <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-semibold text-gray-600 w-48 border-r border-gray-200">
                  Training item
                </th>
                {members.map(m => (
                  <th key={m.id} className="px-3 py-3 text-center text-xs font-semibold text-gray-600 min-w-[120px]">
                    <div>{m.name.split(" ")[0]}</div>
                    {m.name.split(" ").length > 1 && <div className="font-normal text-gray-400">{m.name.split(" ").slice(1).join(" ")}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* Employee Induction Record — always the first row, filled per employee */}
              {inductionId && (
                <tr className="bg-white">
                  <td className="sticky left-0 z-10 px-4 py-2.5 text-xs font-medium text-gray-700 border-r border-gray-200 bg-inherit">
                    <span className="font-semibold text-gray-800">Employee Induction Record</span>
                  </td>
                  {members.map(member => {
                    const ind = inductionByMember[member.id]?.status ?? "begin";
                    const completedAt = inductionByMember[member.id]?.completedAt;
                    return (
                      <td key={member.id} className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => openInduction(member.id)}
                          className={`w-full rounded-md px-2 py-2 text-xs font-medium transition ${
                            ind === "completed" ? "bg-green-50 hover:bg-green-100 text-green-700"
                            : ind === "continue" ? "bg-amber-50 hover:bg-amber-100 text-amber-700"
                            : "bg-gray-50 hover:bg-gray-100 text-gray-500"
                          }`}
                          title={
                            ind === "completed" ? `Induction completed${completedAt ? ` ${completedAt.slice(0, 10)}` : ""}`
                            : ind === "continue" ? "Induction in progress — click to continue"
                            : "Click to begin this employee's induction"
                          }
                        >
                          {ind === "completed" ? (
                            <div>
                              <div className="text-base leading-none mb-0.5">✓</div>
                              <div className="text-[10px] leading-tight">{completedAt?.slice(0, 10)}</div>
                            </div>
                          ) : ind === "continue" ? (
                            <span className="flex items-center justify-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />Continue
                            </span>
                          ) : (
                            <span>Begin</span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              )}
              {items.map((item, ri) => (
                <tr key={item.id} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                  {/* Sticky item name — click to attach a policy document */}
                  {/* Raise the cell above sibling sticky cells while its doc menu is open,
                      otherwise the next row's sticky cell paints over the dropdown */}
                  <td className={`sticky left-0 ${docMenu === item.id ? "z-30" : "z-10"} px-4 py-2.5 text-xs font-medium text-gray-700 border-r border-gray-200 bg-inherit`}>
                    <div className="flex items-center gap-1.5 relative">
                      <button
                        type="button"
                        onClick={() => { if (!item.document_path) pickDocument(item); }}
                        className={`text-left ${item.document_path ? "cursor-default" : "hover:text-brown hover:underline decoration-dotted underline-offset-2"}`}
                        title={item.document_path ? undefined : "Click to upload the policy document"}
                      >
                        {item.name}
                      </button>
                      {uploadingItemId === item.id ? (
                        <span className="h-3.5 w-3.5 shrink-0 border-2 border-brown/20 border-t-brown rounded-full animate-spin" />
                      ) : item.document_path ? (
                        <button
                          type="button"
                          onClick={() => setDocMenu(docMenu === item.id ? null : item.id)}
                          className="shrink-0 text-brown/60 hover:text-brown transition"
                          title="Policy document attached"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V5L9 1z"/><path d="M9 1v4h4"/>
                          </svg>
                        </button>
                      ) : null}
                      {docMenu === item.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setDocMenu(null)} />
                          <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-lg border border-gray-200 shadow-lg py-1 w-28">
                            <button onClick={() => viewDocument(item)} className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-brand-light transition">View</button>
                            <button onClick={() => pickDocument(item)} className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-brand-light transition">Update</button>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                  {members.map(member => {
                    const record = recordMap[member.id]?.[item.id];
                    const status = cellStatus(record);
                    return (
                      <td key={member.id} className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => openCell(member.id, item.id)}
                          className={`w-full rounded-md px-2 py-2 text-xs transition ${STATUS_STYLES[status]}`}
                          title={record?.completed_at ? `Completed ${record.completed_at}` : "Click to mark complete"}
                        >
                          {status === "none" ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <div>
                              <div className="text-base leading-none mb-0.5">✓</div>
                              <div className="text-[10px] leading-tight">{record!.completed_at}</div>
                              {status === "overdue" && <div className="text-[9px] font-semibold mt-0.5">REVIEW DUE</div>}
                              {status === "due_soon" && <div className="text-[9px] font-semibold mt-0.5">REVIEW SOON</div>}
                            </div>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Hidden file input for training document uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={handleFileChosen}
      />

      {/* Group training session flow */}
      {sessionOpen && orgId && (
        <TrainingSessionFlow
          members={members}
          items={items}
          records={records}
          orgId={orgId}
          onClose={() => setSessionOpen(false)}
          onSaved={() => load()}
        />
      )}

      {/* Cell modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModal(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">{itemName(modal.itemId)}</h3>
            <p className="text-sm text-gray-500">{memberName(modal.memberId)}</p>

            <div className="space-y-3">
              <div>
                <label className="label">Date completed</label>
                <input type="date" className="input" value={modalDate} onChange={e => setModalDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Signed off by <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="text" className="input" value={modalBy} onChange={e => setModalBy(e.target.value)} placeholder="Manager name" />
              </div>
            </div>

            {modal.record?.completed_at && (
              <p className="text-xs text-gray-400">
                Review due: {(() => {
                  const d = new Date(modal.record.completed_at);
                  d.setFullYear(d.getFullYear() + 1);
                  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
                })()}
              </p>
            )}

            <div className="flex justify-between pt-1">
              {modal.record?.completed_at ? (
                <button onClick={clearRecord} className="text-sm text-red-500 hover:text-red-700 transition">Clear record</button>
              ) : <span />}
              <div className="flex gap-2">
                <button onClick={() => setModal(null)} className="btn-ghost text-sm">Cancel</button>
                <button onClick={saveRecord} disabled={saving || !modalDate} className="btn-primary text-sm">
                  {saving ? "Saving…" : "Mark complete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
