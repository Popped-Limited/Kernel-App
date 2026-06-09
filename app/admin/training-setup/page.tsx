"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";

interface TrainingItem {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
}

export default function TrainingSetupPage() {
  const { orgId } = useOrganisation();
  const [items, setItems]       = useState<TrainingItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [newName, setNewName]   = useState("");
  const [adding, setAdding]     = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { if (orgId) load(); }, [orgId]);

  async function load() {
    const { data } = await supabase.from("training_items").select("*").order("sort_order").order("name");
    setItems((data ?? []) as TrainingItem[]);
    setLoading(false);
  }

  async function toggleActive(item: TrainingItem) {
    await supabase.from("training_items").update({ active: !item.active }).eq("id", item.id);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, active: !i.active } : i));
  }

  async function addItem() {
    if (!newName.trim() || !orgId) return;
    setAdding(true);
    const maxOrder = items.reduce((m, i) => Math.max(m, i.sort_order), 0);
    await supabase.from("training_items").insert({ name: newName.trim(), sort_order: maxOrder + 1, active: true, organisation_id: orgId });
    setNewName("");
    await load();
    setAdding(false);
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this training item? Any completion records for this item will also be removed.")) return;
    setDeletingId(id);
    await supabase.from("training_items").delete().eq("id", id);
    await load();
    setDeletingId(null);
  }

  const active   = items.filter(i => i.active);
  const inactive = items.filter(i => !i.active);

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 max-w-3xl w-full mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Manage Training Items</h1>
        <p className="text-sm text-gray-500 mt-0.5">Toggle items on or off, or add custom ones for your business.</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="space-y-6">
          {/* Active items */}
          <div className="card divide-y divide-gray-100">
            {active.length === 0 && (
              <div className="px-5 py-4 text-sm text-gray-400">No active training items.</div>
            )}
            {active.map(item => (
              <ItemRow key={item.id} item={item} onToggle={toggleActive} onDelete={deleteItem} deleting={deletingId === item.id} />
            ))}
          </div>

          {/* Inactive */}
          {inactive.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2 px-1">Disabled</p>
              <div className="card divide-y divide-gray-100 opacity-60">
                {inactive.map(item => (
                  <ItemRow key={item.id} item={item} onToggle={toggleActive} onDelete={deleteItem} deleting={deletingId === item.id} />
                ))}
              </div>
            </div>
          )}

          {/* Add new */}
          <div className="card p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">Add custom training item</p>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="e.g. Cold Chain Management"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addItem(); }}
              />
              <button onClick={addItem} disabled={adding || !newName.trim()} className="btn-primary shrink-0">
                {adding ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ItemRow({ item, onToggle, onDelete, deleting }: {
  item: TrainingItem;
  onToggle: (i: TrainingItem) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-3">
      <span className="flex-1 text-sm text-gray-800">{item.name}</span>

      {/* Toggle */}
      <button
        onClick={() => onToggle(item)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${item.active ? "bg-brand-dark" : "bg-gray-300"}`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${item.active ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>

      {/* Delete */}
      <button
        onClick={() => onDelete(item.id)}
        disabled={deleting}
        className="shrink-0 p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition"
        title="Delete"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"/>
        </svg>
      </button>
    </div>
  );
}
