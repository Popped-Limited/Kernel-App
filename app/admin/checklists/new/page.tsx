"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import SaveButton from "@/components/SaveButton";
import { useOrganisation } from "@/contexts/OrganisationContext";
import type { ChecklistFrequency } from "@/lib/types";
import { FREQUENCIES } from "@/lib/constants";
import { DEFAULT_CATEGORIES } from "@/lib/categories";

export default function NewChecklistPage() {
  const router = useRouter();
  const { orgId } = useOrganisation();
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<ChecklistFrequency>("adhoc");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    const { data, error: err } = await supabase
      .from("checklists")
      .insert({ name: name.trim(), frequency, description: description.trim() || null, category: category.trim() || null, active: true, organisation_id: orgId })
      .select("id")
      .single();
    setSaving(false);
    if (err) { setError(err.message); return; }
    router.push(`/admin/checklists/${data.id}`);
  }

  return (
    <>
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 sm:px-6 min-h-[68px]">
          <Link href="/admin/checklists" className="btn-ghost text-xs px-2">← Back</Link>
          <h1 className="text-base font-semibold text-gray-900">New Checklist</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <form onSubmit={handleSubmit} className="card p-6 space-y-5">
          <div>
            <label className="label">Checklist name <span className="text-brown/60">*</span></label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="input"
              placeholder="e.g. Temperature Log"
              autoFocus
            />
          </div>

          <div>
            <label className="label">Frequency <span className="text-brown/60">*</span></label>
            <select value={frequency} onChange={e => setFrequency(e.target.value as ChecklistFrequency)} className="input">
              {FREQUENCIES.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Category <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              type="text"
              list="category-options"
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="input"
              placeholder="e.g. Cleaning"
            />
            <datalist id="category-options">
              {DEFAULT_CATEGORIES.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          <div>
            <label className="label">Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="input resize-none"
              placeholder="Brief instructions shown at the top of the form"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <SaveButton type="submit" saving={saving} savingLabel="Creating…" className="btn-primary flex-1">
              Create &amp; add questions →
            </SaveButton>
            <Link href="/admin/checklists" className="btn-secondary">Cancel</Link>
          </div>
        </form>
      </main>
    </>
  );
}
