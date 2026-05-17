"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Checklist } from "@/lib/types";
import { frequencyLabel, frequencyBadgeColor } from "@/lib/utils";

export default function AdminChecklistsPage() {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <>
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/home" className="btn-ghost text-xs px-2">← Dashboard</Link>
            <h1 className="text-base font-semibold text-gray-900">Edit Checklists</h1>
          </div>
          <Link href="/admin/checklists/new" className="btn-primary">
            + New checklist
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 space-y-2">
        {loading ? (
          <div className="card p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : checklists.map(cl => (
          <div key={cl.id} className={`card flex items-center gap-4 px-4 py-3 ${!cl.active ? "opacity-50" : ""}`}>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900">{cl.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`badge ${frequencyBadgeColor(cl.frequency as never)}`}>
                  {frequencyLabel(cl.frequency as never)}
                </span>
                {!cl.active && <span className="badge bg-gray-100 text-gray-500">Inactive</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleActive(cl)}
                className="btn-ghost text-xs"
              >
                {cl.active ? "Disable" : "Enable"}
              </button>
              <Link href={`/admin/checklists/${cl.id}`} className="btn-secondary text-xs">
                Edit questions
              </Link>
            </div>
          </div>
        ))}
      </main>
    </>
  );
}
