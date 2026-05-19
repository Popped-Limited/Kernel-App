"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

interface TeamMember { id: string; name: string; position: string | null; active: boolean; }
interface TrainingItem { id: string; name: string; sort_order: number; active: boolean; }
interface TrainingRecord {
  id: string;
  team_member_id: string;
  training_item_id: string;
  completed_at: string | null;
  completed_by: string | null;
}

type CellStatus = "none" | "ok" | "due_soon" | "overdue";

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
  const [members, setMembers]     = useState<TeamMember[]>([]);
  const [items, setItems]         = useState<TrainingItem[]>([]);
  const [records, setRecords]     = useState<TrainingRecord[]>([]);
  const [loading, setLoading]     = useState(true);

  // Modal state for marking complete
  const [modal, setModal] = useState<{ memberId: string; itemId: string; record?: TrainingRecord } | null>(null);
  const [modalDate, setModalDate] = useState("");
  const [modalBy, setModalBy]     = useState("");
  const [saving, setSaving]       = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const [mRes, iRes, rRes] = await Promise.all([
      supabase.from("team_members").select("id,name,position,active").eq("active", true).order("name"),
      supabase.from("training_items").select("id,name,sort_order,active").eq("active", true).order("sort_order"),
      supabase.from("training_records").select("*"),
    ]);
    setMembers((mRes.data ?? []) as TeamMember[]);
    setItems((iRes.data ?? []) as TrainingItem[]);
    setRecords((rRes.data ?? []) as TrainingRecord[]);
    setLoading(false);
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
            <h1 className="text-xl font-bold text-gray-900">Training Matrix</h1>
            <p className="text-sm text-gray-500 mt-0.5">Click any cell to mark training as complete</p>
          </div>
          <a href="/admin/training-setup" className="btn-ghost text-sm">Manage training items →</a>
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
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
      ) : members.length === 0 ? (
        <div className="card p-8 text-center text-sm text-gray-400">Add staff members first to see the training matrix.</div>
      ) : items.length === 0 ? (
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
              {items.map((item, ri) => (
                <tr key={item.id} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                  {/* Sticky item name */}
                  <td className="sticky left-0 z-10 px-4 py-2.5 text-xs font-medium text-gray-700 border-r border-gray-200 bg-inherit">
                    {item.name}
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
