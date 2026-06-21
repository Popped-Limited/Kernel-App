"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type SupplierType = "raw_material" | "packaging" | "service";

interface SupplierRow {
  id: string;
  name: string;
  type: SupplierType;
  saq_token: string | null;
  saq_completed: boolean;
  saq_date: string | null;
  organisation_id: string | null;
}

interface QuestionDef {
  id: string;           // maps to question_id from DB
  text: string;         // maps to question_text
  type: "yesnona" | "text" | "textarea" | "date";
  placeholder?: string;
  required?: boolean;
  forTypes?: string[];  // maps to for_types
}

interface SectionDef {
  number: string;
  title: string;
  forTypes?: string[];
  questions: QuestionDef[];
}

function visibleSections(sections: SectionDef[], supplierType: SupplierType): SectionDef[] {
  return sections.filter(s => !s.forTypes || s.forTypes.includes(supplierType));
}

function visibleQuestions(questions: QuestionDef[], supplierType: SupplierType): QuestionDef[] {
  return questions.filter(q => !q.forTypes || q.forTypes.includes(supplierType));
}

function YesNoNa({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-4">
      {(["Yes", "No", "N/A"] as const).map(opt => (
        <label key={opt} className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="radio"
            name={id}
            value={opt}
            checked={value === opt}
            onChange={() => onChange(opt)}
            className="h-4 w-4 border-gray-300 text-brown accent-amber-400"
          />
          <span className="text-sm text-gray-700">{opt}</span>
        </label>
      ))}
    </div>
  );
}

export default function SAQPage() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : Array.isArray(params.token) ? params.token[0] : "";

  const [supplier, setSupplier] = useState<SupplierRow | null>(null);
  const [sections, setSections] = useState<SectionDef[]>([]);
  const [status, setStatus] = useState<"loading" | "not_found" | "already_done" | "form" | "submitted">("loading");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setStatus("not_found"); return; }
    (async () => {
      const res = await fetch(`/api/saq/${encodeURIComponent(token)}`);
      if (!res.ok) { setStatus("not_found"); return; }
      const { supplier: sup, questions: qData } = await res.json();

      if (!sup) { setStatus("not_found"); return; }
      setSupplier(sup as SupplierRow);

      if (qData?.length) {
        const sectionMap = new Map<string, SectionDef>();
        for (const q of qData) {
          if (!sectionMap.has(q.section_number)) {
            sectionMap.set(q.section_number, { number: q.section_number, title: q.section_title, forTypes: undefined, questions: [] });
          }
          sectionMap.get(q.section_number)!.questions.push({
            id: q.question_id,
            text: q.question_text,
            type: q.answer_type,
            placeholder: q.placeholder ?? undefined,
            required: q.required ?? false,
            forTypes: q.for_types ?? undefined,
          });
        }
        setSections(Array.from(sectionMap.values()));
      }

      setStatus((sup as SupplierRow).saq_completed ? "already_done" : "form");
    })();
  }, [token]);

  function setAnswer(id: string, value: string) {
    setAnswers(prev => ({ ...prev, [id]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplier) return;
    setSubmitting(true);

    await fetch(`/api/saq/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });

    setSubmitting(false);
    setStatus("submitted");
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6 flex items-center gap-3">
          <img src="/kernel.png" alt="Kernel" className="h-8 w-auto" />
          <span className="font-serif text-lg font-bold text-brown">Kernel</span>
          <span className="text-gray-300 text-sm">|</span>
          <span className="text-sm text-gray-500">Supplier Self-Assessment Questionnaire</span>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {(status === "loading" || (status === "form" && sections.length === 0)) && (
          <div className="py-24 text-center text-gray-400 text-sm">Loading questionnaire…</div>
        )}

        {status === "not_found" && (
          <div className="py-24 text-center space-y-3">
            <p className="text-2xl font-serif text-brown font-bold">Link not found</p>
            <p className="text-sm text-gray-500">This questionnaire link is invalid or has expired. Please contact the team who sent you this link.</p>
          </div>
        )}

        {status === "already_done" && supplier && (
          <div className="py-24 text-center space-y-3">
            <div className="text-4xl">✅</div>
            <p className="text-2xl font-serif text-brown font-bold">Already submitted</p>
            <p className="text-sm text-gray-600">
              <span className="font-semibold">{supplier.name}</span> has already completed this self-assessment questionnaire.
            </p>
            <p className="text-sm text-gray-400">If you believe this is an error, please contact the team who sent you this link.</p>
          </div>
        )}

        {status === "submitted" && supplier && (
          <div className="py-24 text-center space-y-4">
            <div className="text-5xl">✅</div>
            <p className="text-2xl font-serif text-brown font-bold">Thank you, {supplier.name}!</p>
            <p className="text-sm text-gray-600 max-w-sm mx-auto">
              Your self-assessment has been received and will be reviewed shortly.
            </p>
            <p className="text-sm text-gray-400">You can now close this window.</p>
          </div>
        )}

        {status === "form" && supplier && sections.length > 0 && (
          <form onSubmit={handleSubmit} noValidate>
            {/* Supplier name */}
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Questionnaire for</p>
              <h1 className="text-2xl font-serif font-bold text-brown">{supplier.name}</h1>
              <p className="text-sm text-gray-500 mt-1">
                Please complete all sections as fully as possible. Your responses will be treated confidentially.
              </p>
            </div>

            {visibleSections(sections, supplier.type).map(section => {
              const qs = visibleQuestions(section.questions, supplier.type);
              if (qs.length === 0) return null;
              return (
                <div key={section.number} className="mb-8">
                  <h2 className="text-sm font-semibold text-brown bg-brand/20 px-4 py-2 rounded-t-lg border border-brand/30">
                    Section {section.number}: {section.title}
                  </h2>
                  <div className="border border-t-0 border-brand/30 rounded-b-lg divide-y divide-gray-100">
                    {qs.map(q => (
                      <div key={q.id} className="px-4 py-4">
                        <label className="block text-sm text-gray-800 mb-2">
                          {q.text}
                          {q.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        {q.type === "yesnona" && (
                          <YesNoNa
                            id={q.id}
                            value={answers[q.id] ?? ""}
                            onChange={v => setAnswer(q.id, v)}
                          />
                        )}
                        {q.type === "text" && (
                          <input
                            className="input w-full"
                            type="text"
                            value={answers[q.id] ?? ""}
                            onChange={e => setAnswer(q.id, e.target.value)}
                            placeholder={q.placeholder}
                            required={q.required}
                          />
                        )}
                        {q.type === "textarea" && (
                          <textarea
                            className="input w-full"
                            rows={3}
                            value={answers[q.id] ?? ""}
                            onChange={e => setAnswer(q.id, e.target.value)}
                            placeholder={q.placeholder}
                            required={q.required}
                          />
                        )}
                        {q.type === "date" && (
                          <input
                            className="input w-full"
                            type="date"
                            value={answers[q.id] ?? ""}
                            onChange={e => setAnswer(q.id, e.target.value)}
                            required={q.required}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="mt-6">
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full py-3 text-sm font-semibold"
              >
                {submitting ? "Submitting…" : "Submit Self-Assessment"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
