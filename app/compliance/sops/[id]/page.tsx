"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import type { SOP, SOPStep } from "@/lib/types";
const CATEGORIES = ["Production", "Cleaning", "Fulfilment", "Health & Safety", "Allergen Management", "Other"];

export default function SOPBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { orgId } = useOrganisation();

  const [sop, setSop] = useState<SOP | null>(null);
  const [steps, setSteps] = useState<SOPStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingStep, setUploadingStep] = useState<string | null>(null);

  useEffect(() => { load(); }, [id]);

  async function load() {
    const [sopRes, stepsRes] = await Promise.all([
      supabase.from("sops").select("*").eq("id", id).single(),
      supabase.from("sop_steps").select("*").eq("sop_id", id).order("order_index"),
    ]);
    if (sopRes.data) setSop(sopRes.data as SOP);
    if (stepsRes.data) setSteps(stepsRes.data as SOPStep[]);
    setLoading(false);
  }

  // ── SOP meta ──────────────────────────────────────────────────────────────

  async function saveMeta(field: Partial<SOP>) {
    if (!sop) return;
    const update = { ...field, updated_at: new Date().toISOString() };
    setSop(prev => prev ? { ...prev, ...update } : prev);
    await supabase.from("sops").update(update).eq("id", id);
  }

  async function togglePublish() {
    if (!sop) return;
    setPublishing(true);
    const newStatus = sop.status === "published" ? "draft" : "published";
    await saveMeta({ status: newStatus });
    setPublishing(false);
  }

  async function deleteSOP() {
    if (!confirm("Delete this SOP and all its steps? This cannot be undone.")) return;
    setDeleting(true);
    await supabase.from("sops").delete().eq("id", id);
    router.push("/compliance/sops");
  }

  // ── Steps ─────────────────────────────────────────────────────────────────

  async function addStep() {
    setSaving(true);
    const order = steps.length;
    const { data, error } = await supabase
      .from("sop_steps")
      .insert({ sop_id: id, order_index: order, title: null, body: null, image_url: null })
      .select("*")
      .single();
    if (!error && data) {
      setSteps(prev => [...prev, data as SOPStep]);
      await supabase.from("sops").update({ updated_at: new Date().toISOString() }).eq("id", id);
    }
    setSaving(false);
  }

  async function updateStep(stepId: string, field: Partial<SOPStep>) {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, ...field } : s));
    await supabase.from("sop_steps").update(field).eq("id", stepId);
    await supabase.from("sops").update({ updated_at: new Date().toISOString() }).eq("id", id);
  }

  async function deleteStep(stepId: string) {
    if (!confirm("Remove this step?")) return;
    await supabase.from("sop_steps").delete().eq("id", stepId);
    const remaining = steps.filter(s => s.id !== stepId);
    setSteps(remaining);
    // Re-index
    await Promise.all(remaining.map((s, i) => supabase.from("sop_steps").update({ order_index: i }).eq("id", s.id)));
  }

  async function moveStep(stepId: string, direction: "up" | "down") {
    const idx = steps.findIndex(s => s.id === stepId);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === steps.length - 1) return;

    const newSteps = [...steps];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [newSteps[idx], newSteps[swapIdx]] = [newSteps[swapIdx], newSteps[idx]];
    const reindexed = newSteps.map((s, i) => ({ ...s, order_index: i }));
    setSteps(reindexed);
    await Promise.all(reindexed.map(s => supabase.from("sop_steps").update({ order_index: s.order_index }).eq("id", s.id)));
  }

  // ── Image upload ──────────────────────────────────────────────────────────

  async function uploadImage(stepId: string, file: File) {
    if (!orgId) return;
    setUploadingStep(stepId);
    const ext = file.name.split(".").pop();
    const path = `${orgId}/${id}/${stepId}_${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage.from("sop-images").upload(path, file, { upsert: true });
    if (upErr) { alert("Upload failed: " + upErr.message); setUploadingStep(null); return; }

    const { data: { publicUrl } } = supabase.storage.from("sop-images").getPublicUrl(path);
    await updateStep(stepId, { image_url: publicUrl });
    setUploadingStep(null);
  }

  async function removeImage(stepId: string) {
    await updateStep(stepId, { image_url: null });
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-sm text-gray-400">Loading…</p></div>;
  if (!sop) return <div className="flex min-h-screen items-center justify-center"><p className="text-sm text-gray-500">SOP not found.</p></div>;

  return (
    <>
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-20">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 sm:px-6 min-h-[68px] gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/compliance/sops" className="btn-ghost text-xs shrink-0">← SOPs</Link>
              <span className="text-gray-300 shrink-0">/</span>
              <p className="text-sm font-medium text-gray-700 truncate">{sop.title}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {sop.status === "published" && (
                <Link href={`/sop/${id}`} target="_blank" className="btn-ghost text-xs">Preview ↗</Link>
              )}
              <button
                onClick={togglePublish}
                disabled={publishing}
                className={`text-xs font-medium px-3 py-1.5 rounded transition ${
                  sop.status === "published"
                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                    : "btn-primary"
                }`}
              >
                {publishing ? "…" : sop.status === "published" ? "✓ Published" : "Publish"}
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 space-y-6">
          {/* Meta card */}
          <div className="card p-5 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Title *</label>
                <input
                  className="input"
                  value={sop.title}
                  onChange={e => setSop(s => s ? { ...s, title: e.target.value } : s)}
                  onBlur={e => saveMeta({ title: e.target.value.trim() || sop.title })}
                />
              </div>
              <div>
                <label className="label">Category</label>
                <select
                  className="input"
                  value={sop.category ?? ""}
                  onChange={e => saveMeta({ category: e.target.value || null })}
                >
                  <option value="">No category</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Description <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                className="input resize-none"
                rows={2}
                value={sop.description ?? ""}
                onChange={e => setSop(s => s ? { ...s, description: e.target.value } : s)}
                onBlur={e => saveMeta({ description: e.target.value.trim() || null })}
                placeholder="Brief summary of what this SOP covers"
              />
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Steps <span className="text-gray-400 font-normal ml-1">{steps.length}</span></h2>
            </div>

            {steps.length === 0 && (
              <div className="card p-8 text-center border-dashed">
                <p className="text-sm text-gray-400 mb-3">No steps yet — add your first step below</p>
              </div>
            )}

            {steps.map((step, idx) => (
              <StepCard
                key={step.id}
                step={step}
                stepNumber={idx + 1}
                totalSteps={steps.length}
                uploading={uploadingStep === step.id}
                onUpdate={field => updateStep(step.id, field)}
                onDelete={() => deleteStep(step.id)}
                onMove={dir => moveStep(step.id, dir)}
                onUpload={file => uploadImage(step.id, file)}
                onRemoveImage={() => removeImage(step.id)}
              />
            ))}

            <button onClick={addStep} disabled={saving} className="btn-secondary w-full">
              {saving ? "Adding…" : "+ Add step"}
            </button>
          </div>

          {/* Danger zone */}
          <div className="card p-4 border-red-100">
            <button
              onClick={deleteSOP}
              disabled={deleting}
              className="text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              {deleting ? "Deleting…" : "Delete this SOP"}
            </button>
          </div>
        </main>
    </>
  );
}

// ── Step card ─────────────────────────────────────────────────────────────────

function StepCard({
  step, stepNumber, totalSteps, uploading,
  onUpdate, onDelete, onMove, onUpload, onRemoveImage,
}: {
  step: SOPStep;
  stepNumber: number;
  totalSteps: number;
  uploading: boolean;
  onUpdate: (f: Partial<SOPStep>) => void;
  onDelete: () => void;
  onMove: (dir: "up" | "down") => void;
  onUpload: (file: File) => void;
  onRemoveImage: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(step.title ?? "");
  const [body, setBody] = useState(step.body ?? "");

  return (
    <div className="card overflow-hidden">
      {/* Step header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brown text-white text-xs font-bold">
            {stepNumber}
          </span>
          <span className="text-xs text-gray-500 font-medium">Step {stepNumber} of {totalSteps}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onMove("up")}
            disabled={stepNumber === 1}
            className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors"
            title="Move up"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 8l4-4 4 4" />
            </svg>
          </button>
          <button
            onClick={() => onMove("down")}
            disabled={stepNumber === totalSteps}
            className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors"
            title="Move down"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 4l4 4 4-4" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors ml-1"
            title="Delete step"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Image area */}
        <div>
          {step.image_url ? (
            <div className="relative group rounded-lg overflow-hidden bg-gray-100 aspect-video">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={step.image_url} alt={`Step ${stepNumber}`} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="bg-white text-gray-800 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100 transition"
                >
                  Replace
                </button>
                <button
                  onClick={onRemoveImage}
                  className="bg-white text-red-600 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full aspect-video rounded-lg border-2 border-dashed border-gray-200 hover:border-brand/40 hover:bg-brand/5 transition-colors flex flex-col items-center justify-center gap-2 text-gray-400"
            >
              {uploading ? (
                <p className="text-sm">Uploading…</p>
              ) : (
                <>
                  <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 20.25h18M3.75 3h16.5M12 3v10.5" />
                  </svg>
                  <p className="text-sm font-medium">Add photo</p>
                  <p className="text-xs">Click to upload</p>
                </>
              )}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }}
          />
        </div>

        {/* Title */}
        <div>
          <label className="label">Step title <span className="text-gray-400 font-normal">(optional)</span></label>
          <input
            className="input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={() => onUpdate({ title: title.trim() || null })}
            placeholder="e.g. Sanitise the work surface"
          />
        </div>

        {/* Body */}
        <div>
          <label className="label">Instructions</label>
          <textarea
            className="input resize-none"
            rows={4}
            value={body}
            onChange={e => setBody(e.target.value)}
            onBlur={() => onUpdate({ body: body.trim() || null })}
            placeholder="Describe exactly what needs to be done in this step…"
          />
        </div>
      </div>
    </div>
  );
}
