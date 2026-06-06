"use client";
import BackButton from "@/components/BackButton";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Checklist } from "@/lib/types";
import { frequencyLabel, frequencyBadgeColor } from "@/lib/utils";

type Tab = "all" | "production" | "other";

export default function AdminChecklistsPage() {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from("checklists").select("*").order("name");
    if (data) setChecklists(data as Checklist[]);
    setLoading(false);
  }

  async function toggleActive(cl: Checklist) {
    await supabase.from("checklists").update({ active: !cl.active }).eq("id", cl.id);
    setChecklists(prev => prev.map(c => c.id === cl.id ? { ...c, active: !c.active } : c));
  }

  async function deleteChecklist(cl: Checklist) {
    if (!confirm(`Delete "${cl.name}"?\n\nThis will also delete all its questions. Submissions will NOT be deleted but will lose their checklist link.`)) return;
    setDeletingId(cl.id);
    setDeleteError(null);

    // First delete questions (in case cascade isn't set up)
    await supabase.from("questions").delete().eq("checklist_id", cl.id);

    const { error } = await supabase.from("checklists").delete().eq("id", cl.id);
    if (error) {
      setDeleteError(`Could not delete "${cl.name}": ${error.message}`);
      setDeletingId(null);
      return;
    }
    setChecklists(prev => prev.filter(c => c.id !== cl.id));
    setDeletingId(null);
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const production = checklists.filter(c => c.category === "Production");
  const other = checklists.filter(c => c.category !== "Production");

  const visible = tab === "all" ? checklists : tab === "production" ? production : other;

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "all",        label: "All",        count: checklists.length },
    { key: "production", label: "Production", count: production.length },
    { key: "other",      label: "Other",      count: other.length },
  ];

  return (
    <>
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 sm:px-6 min-h-[68px]">
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-base font-semibold text-gray-900">Manage Checklists</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/production-builder" className="btn-secondary text-xs">
              + Production run
            </Link>
            <Link href="/admin/checklists/new" className="btn-primary">
              + New checklist
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? "border-brand-dark text-brown"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                tab === t.key ? "bg-brand text-brown" : "bg-gray-100 text-gray-500"
              }`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {deleteError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {deleteError}
            <button onClick={() => setDeleteError(null)} className="ml-3 text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {loading ? (
          <div className="card p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="card p-8 text-center text-sm text-gray-400">
            {tab === "production"
              ? <>No production runs yet. <Link href="/admin/production-builder" className="underline text-brown">Create one →</Link></>
              : "No checklists in this category."}
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map(cl => (
              <div key={cl.id} className={`card flex items-center gap-4 px-4 py-3 ${!cl.active ? "opacity-50" : ""}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{cl.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`badge ${frequencyBadgeColor(cl.frequency as never)}`}>
                      {frequencyLabel(cl.frequency as never)}
                    </span>
                    {cl.category && cl.category !== "Production" && (
                      <span className="badge bg-gray-100 text-gray-500">{cl.category}</span>
                    )}
                    {!cl.active && <span className="badge bg-gray-100 text-gray-500">Inactive</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleActive(cl)}
                    className="btn-ghost text-xs"
                  >
                    {cl.active ? "Disable" : "Enable"}
                  </button>
                  <Link href={`/admin/checklists/${cl.id}`} className="btn-secondary text-xs">
                    Edit
                  </Link>
                  <button
                    onClick={() => deleteChecklist(cl)}
                    disabled={deletingId === cl.id}
                    className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition"
                    title="Delete checklist"
                  >
                    {deletingId === cl.id ? (
                      <span className="text-xs text-gray-400">…</span>
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
