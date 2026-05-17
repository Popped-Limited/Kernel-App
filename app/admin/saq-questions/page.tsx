"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface SAQQuestion {
  id: string;
  section_number: string;
  section_title: string;
  question_id: string;
  question_text: string;
  answer_type: "yesnona" | "text" | "textarea" | "date";
  placeholder: string | null;
  required: boolean;
  for_types: string[] | null;
  sort_order: number;
  active: boolean;
}

interface SectionGroup {
  number: string;
  title: string;
  questions: SAQQuestion[];
}

const ANSWER_TYPE_LABELS: Record<SAQQuestion["answer_type"], string> = {
  yesnona: "Yes/No/N/A",
  text: "Text",
  textarea: "Long text",
  date: "Date",
};

const FOR_TYPE_LABELS: Record<string, string> = {
  raw_material: "Raw material",
  packaging: "Packaging",
};

function TypeBadge({ type }: { type: SAQQuestion["answer_type"] }) {
  const isYesNo = type === "yesnona";
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
        isYesNo ? "bg-brand/20 text-brown" : "bg-gray-100 text-gray-600"
      }`}
    >
      {ANSWER_TYPE_LABELS[type]}
    </span>
  );
}

function ForTypesBadges({ forTypes }: { forTypes: string[] | null }) {
  if (!forTypes || forTypes.length === 0) {
    return <span className="text-xs text-gray-400">All suppliers</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {forTypes.map(t => (
        <span
          key={t}
          className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
        >
          {FOR_TYPE_LABELS[t] ?? t}
        </span>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        checked ? "bg-brand" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

const EMPTY_FORM: Omit<SAQQuestion, "id"> = {
  section_number: "",
  section_title: "",
  question_id: "",
  question_text: "",
  answer_type: "yesnona",
  placeholder: null,
  required: false,
  for_types: null,
  sort_order: 0,
  active: true,
};

export default function SAQQuestionsPage() {
  const [questions, setQuestions] = useState<SAQQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<SAQQuestion, "id">>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  async function loadQuestions() {
    const { data } = await supabase
      .from("saq_questions")
      .select("*")
      .order("sort_order");
    if (data) setQuestions(data as SAQQuestion[]);
    setLoading(false);
  }

  useEffect(() => {
    loadQuestions();
  }, []);

  // Group into sections sorted numerically
  const sections: SectionGroup[] = (() => {
    const map = new Map<string, SectionGroup>();
    for (const q of questions) {
      if (!map.has(q.section_number)) {
        map.set(q.section_number, {
          number: q.section_number,
          title: q.section_title,
          questions: [],
        });
      }
      map.get(q.section_number)!.questions.push(q);
    }
    return Array.from(map.values()).sort(
      (a, b) => parseFloat(a.number) - parseFloat(b.number)
    );
  })();

  function openNew(prefillSection?: { number: string; title: string }) {
    setIsNew(true);
    setEditingId(null);
    setDeleteConfirm(false);
    setForm({
      ...EMPTY_FORM,
      section_number: prefillSection?.number ?? "",
      section_title: prefillSection?.title ?? "",
    });
    setPanelOpen(true);
  }

  function openEdit(q: SAQQuestion) {
    setIsNew(false);
    setEditingId(q.id);
    setDeleteConfirm(false);
    setForm({
      section_number: q.section_number,
      section_title: q.section_title,
      question_id: q.question_id,
      question_text: q.question_text,
      answer_type: q.answer_type,
      placeholder: q.placeholder,
      required: q.required,
      for_types: q.for_types,
      sort_order: q.sort_order,
      active: q.active,
    });
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
    setDeleteConfirm(false);
  }

  async function handleSave() {
    setSaving(true);
    const payload = { ...form };
    if (isNew) {
      await supabase.from("saq_questions").insert(payload);
    } else {
      await supabase.from("saq_questions").upsert({ id: editingId, ...payload });
    }
    await loadQuestions();
    setSaving(false);
    closePanel();
  }

  async function handleDelete() {
    if (!editingId) return;
    await supabase.from("saq_questions").delete().eq("id", editingId);
    await loadQuestions();
    closePanel();
  }

  async function toggleActive(q: SAQQuestion) {
    await supabase
      .from("saq_questions")
      .update({ active: !q.active })
      .eq("id", q.id);
    setQuestions(prev =>
      prev.map(item => (item.id === q.id ? { ...item, active: !item.active } : item))
    );
  }

  // for_types checkbox helpers
  const forTypesChecked = (t: string) => !!(form.for_types && form.for_types.includes(t));
  function toggleForType(t: string) {
    const current = form.for_types ?? [];
    if (current.includes(t)) {
      const next = current.filter(x => x !== t);
      setForm(f => ({ ...f, for_types: next.length === 0 ? null : next }));
    } else {
      setForm(f => ({ ...f, for_types: [...current, t] }));
    }
  }

  const totalQuestions = questions.length;
  const sectionCount = sections.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/home" className="btn-ghost text-xs px-2">
              ← Dashboard
            </Link>
            <h1 className="text-base font-semibold text-gray-900">SAQ Questions</h1>
            {!loading && (
              <span className="text-xs text-gray-400">
                {totalQuestions} questions across {sectionCount} sections
              </span>
            )}
          </div>
          <button onClick={() => openNew()} className="btn-primary text-sm">
            + Add Question
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {loading && (
          <p className="text-center text-sm text-gray-400 py-16">Loading…</p>
        )}

        {!loading && sections.length === 0 && (
          <div className="card text-center py-16">
            <p className="text-gray-500 text-sm">No questions yet.</p>
            <button onClick={() => openNew()} className="btn-primary mt-4 text-sm">
              + Add your first question
            </button>
          </div>
        )}

        <div className="space-y-4">
          {sections.map(section => (
            <div key={section.number} className="card overflow-hidden p-0">
              {/* Section header */}
              <div className="flex items-center justify-between bg-brand/10 border-b border-brand/20 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-brown text-xs font-bold">
                    {section.number}
                  </span>
                  <span className="font-semibold text-brown text-sm">{section.title}</span>
                  <span className="text-xs text-gray-400">{section.questions.length} questions</span>
                </div>
                <button
                  onClick={() => openNew({ number: section.number, title: section.title })}
                  className="btn-ghost text-xs px-2 py-1"
                  title="Add question to this section"
                >
                  + Add
                </button>
              </div>

              {/* Questions table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                      <th className="px-4 py-2 text-left font-medium w-16">#</th>
                      <th className="px-4 py-2 text-left font-medium">Question</th>
                      <th className="px-4 py-2 text-left font-medium w-32">Type</th>
                      <th className="px-4 py-2 text-left font-medium w-36">Applies to</th>
                      <th className="px-4 py-2 text-center font-medium w-16">Active</th>
                      <th className="px-4 py-2 w-12" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {section.questions.map(q => (
                      <tr
                        key={q.id}
                        className={`transition-opacity ${q.active ? "" : "opacity-50"}`}
                      >
                        <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">
                          {q.sort_order}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-gray-800 ${q.active ? "" : "line-through text-gray-400"}`}
                          >
                            {q.question_text}
                          </span>
                          {q.required && (
                            <span className="ml-1 text-red-400 text-xs">*</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <TypeBadge type={q.answer_type} />
                        </td>
                        <td className="px-4 py-3">
                          <ForTypesBadges forTypes={q.for_types} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Toggle
                            checked={q.active}
                            onChange={() => toggleActive(q)}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => openEdit(q)}
                            className="btn-ghost text-xs px-2 py-1"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Edit / Add panel (right-side drawer) */}
      {panelOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-20"
            onClick={closePanel}
          />

          {/* Drawer */}
          <aside className="fixed inset-y-0 right-0 z-30 w-full max-w-lg bg-white shadow-xl flex flex-col">
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="font-semibold text-gray-900 text-base">
                {isNew ? "Add Question" : "Edit Question"}
              </h2>
              <button onClick={closePanel} className="btn-ghost text-xs px-2 py-1">
                ✕ Close
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Section number */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Section number
                </label>
                <input
                  className="input w-full"
                  type="text"
                  value={form.section_number}
                  onChange={e => setForm(f => ({ ...f, section_number: e.target.value }))}
                  placeholder="e.g. 3"
                />
              </div>

              {/* Section title */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Section title
                </label>
                <input
                  className="input w-full"
                  type="text"
                  value={form.section_title}
                  onChange={e => setForm(f => ({ ...f, section_title: e.target.value }))}
                  placeholder="e.g. Quality Management System"
                />
              </div>

              {/* Question ID */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Question ID (slug)
                </label>
                <input
                  className="input w-full"
                  type="text"
                  value={form.question_id}
                  onChange={e => setForm(f => ({ ...f, question_id: e.target.value }))}
                  placeholder="e.g. 3_qms"
                />
                <p className="mt-1 text-xs text-gray-400">Unique identifier, no spaces</p>
              </div>

              {/* Question text */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Question text
                </label>
                <textarea
                  className="input w-full"
                  rows={3}
                  value={form.question_text}
                  onChange={e => setForm(f => ({ ...f, question_text: e.target.value }))}
                  placeholder="Enter the question…"
                />
              </div>

              {/* Answer type */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Answer type
                </label>
                <select
                  className="input w-full"
                  value={form.answer_type}
                  onChange={e =>
                    setForm(f => ({
                      ...f,
                      answer_type: e.target.value as SAQQuestion["answer_type"],
                    }))
                  }
                >
                  <option value="yesnona">Yes / No / N/A</option>
                  <option value="text">Short text</option>
                  <option value="textarea">Long text (textarea)</option>
                  <option value="date">Date</option>
                </select>
              </div>

              {/* Placeholder */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Placeholder text{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  className="input w-full"
                  type="text"
                  value={form.placeholder ?? ""}
                  onChange={e =>
                    setForm(f => ({
                      ...f,
                      placeholder: e.target.value || null,
                    }))
                  }
                  placeholder="Hint text shown inside the field"
                />
              </div>

              {/* Required */}
              <div className="flex items-center gap-3">
                <input
                  id="required-chk"
                  type="checkbox"
                  checked={form.required}
                  onChange={e => setForm(f => ({ ...f, required: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 accent-amber-400"
                />
                <label htmlFor="required-chk" className="text-sm text-gray-700 select-none">
                  Required field
                </label>
              </div>

              {/* Applies to */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Applies to</p>
                <div className="space-y-2">
                  {[
                    { value: "raw_material", label: "Raw material suppliers" },
                    { value: "packaging", label: "Packaging suppliers" },
                  ].map(opt => (
                    <label
                      key={opt.value}
                      className="flex items-center gap-3 select-none cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={forTypesChecked(opt.value)}
                        onChange={() => toggleForType(opt.value)}
                        className="h-4 w-4 rounded border-gray-300 accent-amber-400"
                      />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  If neither is checked, the question applies to all suppliers.
                </p>
              </div>

              {/* Sort order */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Sort order
                </label>
                <input
                  className="input w-full"
                  type="number"
                  value={form.sort_order}
                  onChange={e =>
                    setForm(f => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))
                  }
                  placeholder="e.g. 3010"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Lower numbers appear first. Use gaps of 10 (e.g. 3010, 3020) to allow insertions.
                </p>
              </div>

              {/* Active */}
              <div className="flex items-center gap-3">
                <Toggle
                  checked={form.active}
                  onChange={() => setForm(f => ({ ...f, active: !f.active }))}
                />
                <span className="text-sm text-gray-700 select-none">Active</span>
              </div>
            </div>

            {/* Panel footer */}
            <div className="border-t border-gray-200 px-6 py-4 space-y-3">
              {/* Delete (existing only) */}
              {!isNew && (
                <div>
                  {deleteConfirm ? (
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-red-600">Delete this question?</span>
                      <button
                        onClick={handleDelete}
                        className="text-red-600 font-semibold hover:underline"
                      >
                        Yes, delete
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(false)}
                        className="text-gray-500 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(true)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Delete question
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary flex-1 text-sm"
                >
                  {saving ? "Saving…" : isNew ? "Add Question" : "Save Changes"}
                </button>
                <button onClick={closePanel} className="btn-ghost text-sm px-4">
                  Cancel
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
