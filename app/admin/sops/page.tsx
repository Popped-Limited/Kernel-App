"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import type { SOP } from "@/lib/types";
import { formatDate } from "@/lib/utils";
const CATEGORIES = ["Production", "Cleaning", "Fulfilment", "Health & Safety", "Allergen Management", "Other"];

export default function SOPsPage() {
  const router = useRouter();
  const { orgId, role } = useOrganisation();
  const [sops, setSops] = useState<SOP[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // New SOP modal
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => { if (orgId) load(); }, [orgId]);

  async function load() {
    const { data } = await supabase
      .from("sops")
      .select("*")
      .eq("organisation_id", orgId)
      .order("updated_at", { ascending: false });
    setSops((data ?? []) as SOP[]);
    setLoading(false);
  }

  async function createSOP() {
    if (!newTitle.trim() || !orgId) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("sops")
      .insert({
        organisation_id: orgId,
        title: newTitle.trim(),
        category: newCategory.trim() || null,
        description: newDesc.trim() || null,
        status: "draft",
        created_by: "",
      })
      .select("*")
      .single();

    if (!error && data) {
      router.push(`/admin/sops/${data.id}`);
    }
    setCreating(false);
  }

  const isAdmin = role === "admin" || role === "manager";

  const filtered = sops.filter(s => {
    if (filter !== "all" && s.status !== filter) return false;
    if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
    return true;
  });

  const usedCategories = Array.from(new Set(sops.map(s => s.category).filter(Boolean))) as string[];

  return (
    <>
      <header className="border-b border-gray-200 bg-white shadow-sm">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6 min-h-[68px]">
            <div className="flex items-center gap-3">
              <h1 className="text-base font-semibold text-gray-900">Standard Operating Procedures</h1>
            </div>
            {isAdmin && (
              <button onClick={() => setShowNew(true)} className="btn-primary text-xs">
                + New SOP
              </button>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 space-y-5">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "published", "draft"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${filter === f ? "bg-brown text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"}`}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <button
              onClick={() => setCategoryFilter("all")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${categoryFilter === "all" ? "bg-brand text-brown" : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"}`}
            >
              All categories
            </button>
            {usedCategories.map(c => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${categoryFilter === c ? "bg-brand text-brown" : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"}`}
              >
                {c}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-3xl mb-3">📖</p>
              <p className="text-sm font-medium text-gray-700 mb-1">No SOPs yet</p>
              <p className="text-xs text-gray-400 mb-4">Create your first standard operating procedure</p>
              {isAdmin && <button onClick={() => setShowNew(true)} className="btn-primary text-xs">+ New SOP</button>}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(sop => (
                <div key={sop.id} className="card p-4 hover:border-brand/40 transition-colors flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-gray-900 truncate">{sop.title}</p>
                      {sop.category && (
                        <span className="inline-block mt-1 text-[10px] uppercase tracking-wide font-medium text-brand bg-brand/10 rounded-full px-2 py-0.5">
                          {sop.category}
                        </span>
                      )}
                    </div>
                    <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${sop.status === "published" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                      {sop.status}
                    </span>
                  </div>
                  {sop.description && <p className="text-xs text-gray-500 line-clamp-2">{sop.description}</p>}
                  <div className="flex items-center justify-between mt-auto pt-1">
                    <p className="text-[10px] text-gray-400">Updated {formatDate(sop.updated_at)}</p>
                    <div className="flex items-center gap-2">
                      {sop.status === "published" && (
                        <Link href={`/sop/${sop.id}`} className="btn-ghost text-xs">View</Link>
                      )}
                      {isAdmin && (
                        <Link href={`/admin/sops/${sop.id}`} className="btn-secondary text-xs">Edit</Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

      {/* New SOP modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">New SOP</h3>
            <div>
              <label className="label">Title *</label>
              <input
                className="input"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. Filling & Packing — Chilli Oil"
                autoFocus
                onKeyDown={e => e.key === "Enter" && createSOP()}
              />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={newCategory} onChange={e => setNewCategory(e.target.value)}>
                <option value="">Select or leave blank</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Description <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                className="input resize-none"
                rows={2}
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Brief summary of what this SOP covers"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={createSOP} disabled={creating || !newTitle.trim()} className="btn-primary flex-1">
                {creating ? "Creating…" : "Create & build →"}
              </button>
              <button onClick={() => { setShowNew(false); setNewTitle(""); setNewCategory(""); setNewDesc(""); }} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
