"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Checklist, Question, QuestionType, ChecklistFrequency } from "@/lib/types";
import { FREQUENCIES, QUESTION_TYPES } from "@/lib/constants";
import { DEFAULT_CATEGORIES } from "@/lib/categories";

const BLANK_QUESTION: Omit<Question, "id" | "checklist_id" | "created_at"> = {
  label: "",
  type: "checkbox",
  required: true,
  order_index: 0,
  options: null,
  hint: null,
};

export default function EditChecklistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Checklist meta editing
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaName, setMetaName] = useState("");
  const [metaFreq, setMetaFreq] = useState<ChecklistFrequency>("adhoc");
  const [metaDesc, setMetaDesc] = useState("");
  const [metaCategory, setMetaCategory] = useState("");

  // Question being added/edited (null = none open)
  const [editingQ, setEditingQ] = useState<Partial<Question> | null>(null);
  const [editingQId, setEditingQId] = useState<string | null>(null); // null = new

  useEffect(() => { load(); }, [id]);

  async function load() {
    const [clRes, qRes] = await Promise.all([
      supabase.from("checklists").select("*").eq("id", id).single(),
      supabase.from("questions").select("*").eq("checklist_id", id).order("order_index"),
    ]);
    if (clRes.data) {
      const cl = clRes.data as Checklist;
      setChecklist(cl);
      setMetaName(cl.name);
      setMetaFreq(cl.frequency as ChecklistFrequency);
      setMetaDesc(cl.description ?? "");
      setMetaCategory(cl.category ?? "");
    }
    if (qRes.data) setQuestions(qRes.data as Question[]);
    setLoading(false);
  }

  // ── Checklist meta ────────────────────────────────────────────────────────

  async function saveMeta() {
    if (!metaName.trim()) return;
    setSaving(true);
    const { data } = await supabase
      .from("checklists")
      .update({ name: metaName.trim(), frequency: metaFreq, description: metaDesc.trim() || null, category: metaCategory.trim() || null })
      .eq("id", id)
      .select("*")
      .single();
    if (data) setChecklist(data as Checklist);
    setSaving(false);
    setEditingMeta(false);
  }

  // ── Question CRUD ─────────────────────────────────────────────────────────

  function openNewQuestion() {
    setEditingQId(null);
    setEditingQ({ ...BLANK_QUESTION, order_index: questions.length });
  }

  function openEditQuestion(q: Question) {
    setEditingQId(q.id);
    setEditingQ({ ...q });
  }

  async function saveQuestion() {
    if (!editingQ?.label?.trim()) return;
    setSaving(true);

    const payload = {
      checklist_id: id,
      label: editingQ.label!.trim(),
      type: editingQ.type!,
      required: editingQ.required ?? true,
      order_index: editingQ.order_index ?? questions.length,
      options: editingQ.options ?? null,
      hint: editingQ.hint?.trim() || null,
    };

    if (editingQId) {
      // Update existing
      await supabase.from("questions").update(payload).eq("id", editingQId);
      setQuestions(prev => prev.map(q => q.id === editingQId ? { ...q, ...payload } : q));
    } else {
      // Insert new
      const { data } = await supabase.from("questions").insert(payload).select("*").single();
      if (data) setQuestions(prev => [...prev, data as Question]);
    }

    setSaving(false);
    setEditingQ(null);
    setEditingQId(null);
  }

  async function deleteQuestion(qId: string) {
    if (!confirm("Delete this question? Any existing answers to this question will also be removed.")) return;
    // Must delete child answers before the question (foreign key constraint)
    await supabase.from("answers").delete().eq("question_id", qId);
    const { error } = await supabase.from("questions").delete().eq("id", qId);
    if (error) { alert("Failed to delete: " + error.message); return; }
    const remaining = questions.filter(q => q.id !== qId);
    await Promise.all(
      remaining.map((q, i) => supabase.from("questions").update({ order_index: i }).eq("id", q.id))
    );
    setQuestions(remaining.map((q, i) => ({ ...q, order_index: i })));
  }

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (index !== dragOverIndex) setDragOverIndex(index);
  }

  async function handleDrop(dropIndex: number) {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const reordered = [...questions];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    const withIndexes = reordered.map((q, i) => ({ ...q, order_index: i }));
    setQuestions(withIndexes);
    setDragIndex(null);
    setDragOverIndex(null);
    await Promise.all(
      withIndexes.map(q => supabase.from("questions").update({ order_index: q.order_index }).eq("id", q.id))
    );
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  async function deleteChecklist() {
    if (!confirm(`Delete "${checklist?.name}" and all its questions? This cannot be undone.`)) return;
    await supabase.from("questions").delete().eq("checklist_id", id);
    await supabase.from("checklists").delete().eq("id", id);
    router.push("/admin/checklists");
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Loading…</div>;
  }

  if (!checklist) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Checklist not found.</div>;
  }

  return (
    <>
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 sm:px-6 min-h-[68px]">
          <div className="flex items-center gap-3">
            <Link href="/admin/checklists" className="btn-ghost text-xs px-2">← Back</Link>
            <h1 className="text-base font-semibold text-gray-900 truncate">{checklist.name}</h1>
          </div>
          <a
            href={`/checklist/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs"
          >
            Preview form ↗
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-6">

        {/* ── Checklist details ── */}
        <div className="card p-5">
          {editingMeta ? (
            <div className="space-y-4">
              <h2 className="font-semibold text-gray-900">Checklist details</h2>
              <div>
                <label className="label">Name <span className="text-brown/60">*</span></label>
                <input type="text" value={metaName} onChange={e => setMetaName(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">Frequency</label>
                <select value={metaFreq} onChange={e => setMetaFreq(e.target.value as ChecklistFrequency)} className="input">
                  {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Category <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  list="category-options"
                  value={metaCategory}
                  onChange={e => setMetaCategory(e.target.value)}
                  className="input"
                  placeholder="e.g. Cleaning"
                />
                <datalist id="category-options">
                  {DEFAULT_CATEGORIES.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className="label">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea value={metaDesc} onChange={e => setMetaDesc(e.target.value)} rows={2} className="input resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={saveMeta} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save"}</button>
                <button onClick={() => setEditingMeta(false)} className="btn-secondary">Cancel</button>
                <button onClick={deleteChecklist} className="ml-auto text-sm text-red-500 hover:text-red-700 transition">Delete checklist</button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-900">{checklist.name}</h2>
                {checklist.description && <p className="mt-1 text-sm text-gray-500">{checklist.description}</p>}
                <p className="mt-1 text-xs text-gray-400">{FREQUENCIES.find(f => f.value === checklist.frequency)?.label ?? checklist.frequency}</p>
              </div>
              <button onClick={() => setEditingMeta(true)} className="btn-secondary text-xs shrink-0">Edit details</button>
            </div>
          )}
        </div>

        {/* ── Questions ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">Questions <span className="text-gray-400 font-normal text-sm">({questions.length})</span></h2>
            <button onClick={openNewQuestion} className="btn-primary text-sm">+ Add question</button>
          </div>

          <div className="space-y-2">
            {questions.map((q, i) => (
              <QuestionRow
                key={q.id}
                question={q}
                index={i}
                isDragging={dragIndex === i}
                isDragOver={dragOverIndex === i && dragIndex !== i}
                onEdit={() => openEditQuestion(q)}
                onDelete={() => deleteQuestion(q.id)}
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={() => handleDrop(i)}
                onDragEnd={handleDragEnd}
              />
            ))}
            {questions.length === 0 && (
              <div className="card p-8 text-center text-sm text-gray-400">
                No questions yet — click "Add question" to get started.
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Question editor modal ── */}
      {editingQ !== null && (
        <QuestionEditor
          question={editingQ}
          isNew={editingQId === null}
          saving={saving}
          onChange={setEditingQ}
          onSave={saveQuestion}
          onCancel={() => { setEditingQ(null); setEditingQId(null); }}
        />
      )}
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function QuestionRow({ question, index, isDragging, isDragOver, onEdit, onDelete, onDragStart, onDragOver, onDrop, onDragEnd }: {
  question: Question;
  index: number;
  isDragging: boolean;
  isDragOver: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const typeLabel = QUESTION_TYPES.find(t => t.value === question.type)?.label ?? question.type;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`card flex items-center gap-3 px-4 py-3 transition-all ${isDragging ? "opacity-40" : ""} ${isDragOver ? "ring-2 ring-brand ring-offset-1" : ""}`}
    >
      {/* Drag handle */}
      <div className="shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition select-none" title="Drag to reorder">
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="5.5" cy="4" r="1.2"/><circle cx="10.5" cy="4" r="1.2"/>
          <circle cx="5.5" cy="8" r="1.2"/><circle cx="10.5" cy="8" r="1.2"/>
          <circle cx="5.5" cy="12" r="1.2"/><circle cx="10.5" cy="12" r="1.2"/>
        </svg>
      </div>

      {/* Number */}
      <span className="text-xs text-gray-400 w-5 shrink-0 text-center">{index + 1}</span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {question.label}
          {question.required && <span className="ml-1 text-brown/60 text-xs">*</span>}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="badge bg-gray-100 text-gray-500">{typeLabel}</span>
          {question.hint && <span className="text-xs text-gray-400 truncate">{question.hint}</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onEdit} className="btn-ghost text-xs px-2">Edit</button>
        <button onClick={onDelete} className="btn-ghost text-xs px-2 text-red-400 hover:text-red-600">Delete</button>
      </div>
    </div>
  );
}

function QuestionEditor({ question, isNew, saving, onChange, onSave, onCancel }: {
  question: Partial<Question>;
  isNew: boolean;
  saving: boolean;
  onChange: (q: Partial<Question>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const needsOptions = question.type === "dropdown" || question.type === "multiple_choice";
  const optionsStr = question.options?.join("\n") ?? "";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">{isNew ? "Add question" : "Edit question"}</h3>

        <div>
          <label className="label">Question text <span className="text-brown/60">*</span></label>
          <textarea
            value={question.label ?? ""}
            onChange={e => onChange({ ...question, label: e.target.value })}
            rows={2}
            className="input resize-none"
            placeholder="e.g. Are handwashing facilities stocked?"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Answer type</label>
            <select
              value={question.type ?? "checkbox"}
              onChange={e => onChange({ ...question, type: e.target.value as QuestionType, options: null })}
              className="input"
            >
              {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col justify-end pb-0.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={question.required ?? true}
                onChange={e => onChange({ ...question, required: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
              />
              <span className="text-sm font-medium text-gray-700">Required</span>
            </label>
          </div>
        </div>

        {needsOptions && (
          <div>
            <label className="label">Options <span className="text-gray-400 font-normal text-xs">— one per line</span></label>
            <textarea
              value={optionsStr}
              onChange={e => onChange({ ...question, options: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })}
              rows={4}
              className="input resize-none font-mono text-xs"
              placeholder={"Option A\nOption B\nOption C"}
            />
          </div>
        )}

        <div>
          <label className="label">Hint / helper text <span className="text-gray-400 font-normal">(optional)</span></label>
          <input
            type="text"
            value={question.hint ?? ""}
            onChange={e => onChange({ ...question, hint: e.target.value })}
            className="input"
            placeholder="Small grey text shown below the question"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onSave} disabled={saving || !question.label?.trim()} className="btn-primary flex-1">
            {saving ? "Saving…" : isNew ? "Add question" : "Save changes"}
          </button>
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}
