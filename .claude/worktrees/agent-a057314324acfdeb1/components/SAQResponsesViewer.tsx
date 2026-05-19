"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface SAQQuestion {
  id: string;
  section_number: string;
  section_title: string;
  question_id: string;
  question_text: string;
  answer_type: string;
  for_types: string[] | null;
  sort_order: number;
}

interface Section {
  number: string;
  title: string;
  questions: SAQQuestion[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  supplierName: string;
  supplierId: string;
  supplierType: string;
  saqDate: string | null;
}

function AnswerBadge({ value, type }: { value: string; type: string }) {
  if (!value) return <span className="text-gray-400 italic text-xs">No answer</span>;

  if (type === "yesnona") {
    const styles: Record<string, string> = {
      "Yes": "bg-green-100 text-green-800 border border-green-200",
      "No":  "bg-red-100 text-red-700 border border-red-200",
      "N/A": "bg-gray-100 text-gray-500 border border-gray-200",
    };
    return (
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[value] ?? "bg-gray-100 text-gray-600"}`}>
        {value}
      </span>
    );
  }

  if (type === "date") {
    return (
      <span className="text-xs text-gray-700">
        {new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
      </span>
    );
  }

  return <span className="text-xs text-gray-700 whitespace-pre-wrap">{value}</span>;
}

export default function SAQResponsesViewer({ open, onClose, supplierName, supplierId, supplierType, saqDate }: Props) {
  const [responses, setResponses] = useState<Record<string, string> | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);

    Promise.all([
      supabase
        .from("saq_responses")
        .select("*")
        .eq("supplier_id", supplierId)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("saq_questions")
        .select("*")
        .eq("active", true)
        .order("sort_order"),
    ]).then(([{ data: resp }, { data: qs }]) => {
      if (resp) {
        setResponses(resp.responses as Record<string, string>);
        setSubmittedAt(resp.submitted_at);
      } else {
        setResponses(null);
      }

      if (qs) {
        // Filter to questions applicable to this supplier type
        const filtered = (qs as SAQQuestion[]).filter(q =>
          !q.for_types || q.for_types.includes(supplierType)
        );
        // Group into sections
        const map = new Map<string, Section>();
        for (const q of filtered) {
          if (!map.has(q.section_number)) {
            map.set(q.section_number, { number: q.section_number, title: q.section_title, questions: [] });
          }
          map.get(q.section_number)!.questions.push(q);
        }
        setSections(Array.from(map.values()));
      }

      setLoading(false);
    });
  }, [open, supplierId, supplierType]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0 bg-gray-50">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">SAQ Responses — {supplierName}</h2>
            {submittedAt && (
              <p className="text-xs text-gray-500 mt-0.5">
                Submitted {new Date(submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="py-16 text-center text-sm text-gray-400">Loading responses…</div>
          )}

          {!loading && !responses && (
            <div className="py-16 text-center space-y-2">
              <p className="text-sm font-medium text-gray-600">No responses found</p>
              <p className="text-xs text-gray-400">This supplier hasn't submitted the SAQ form yet.</p>
            </div>
          )}

          {!loading && responses && (
            <div className="space-y-6">
              {sections.map(section => (
                <div key={section.number}>
                  {/* Section header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand text-brown text-[10px] font-bold shrink-0">
                      {section.number}
                    </span>
                    <h3 className="text-xs font-semibold text-brown uppercase tracking-wide">{section.title}</h3>
                  </div>

                  {/* Questions */}
                  <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                    {section.questions.map(q => {
                      const answer = responses[q.question_id] ?? "";
                      return (
                        <div key={q.question_id} className="px-4 py-3 flex items-start justify-between gap-4">
                          <p className="text-xs text-gray-700 flex-1 leading-relaxed">{q.question_text}</p>
                          <div className="shrink-0 text-right">
                            <AnswerBadge value={answer} type={q.answer_type} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-6 py-4 shrink-0">
          <button onClick={onClose} className="btn-ghost w-full">Close</button>
        </div>
      </div>
    </div>
  );
}
