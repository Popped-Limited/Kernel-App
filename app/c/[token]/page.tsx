"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Checklist, Question } from "@/lib/types";
import QuestionField from "@/components/QuestionField";

type AnswerMap = Record<string, string>;

export default function GuestChecklistPage() {
  const { token } = useParams<{ token: string }>();

  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [questions, setQuestions]  = useState<Question[]>([]);
  const [visitorName, setVisitorName] = useState("");
  const [answers, setAnswers]      = useState<AnswerMap>({});
  const [errors, setErrors]        = useState<Record<string, string>>({});
  const [nameError, setNameError]  = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]  = useState(false);
  const [loading, setLoading]      = useState(true);
  const [notFound, setNotFound]    = useState(false);

  useEffect(() => {
    async function load() {
      const [clRes] = await Promise.all([
        supabase.from("checklists").select("*").eq("public_token", token).single(),
      ]);
      if (!clRes.data) { setNotFound(true); setLoading(false); return; }
      setChecklist(clRes.data);

      const { data: qData } = await supabase
        .from("questions")
        .select("*")
        .eq("checklist_id", clRes.data.id)
        .order("order_index");
      if (qData) setQuestions(qData);
      setLoading(false);
    }
    load();
  }, [token]);

  function validate(): boolean {
    let valid = true;
    if (!visitorName.trim()) { setNameError("Please enter your name"); valid = false; }
    else setNameError("");

    const errs: Record<string, string> = {};
    for (const q of questions) {
      if (!q.required) continue;
      const val = answers[q.id] ?? "";
      if (!val || val === "false" || val === "[]") errs[q.id] = "This field is required";
    }
    setErrors(errs);
    return valid && Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) {
      const firstErr = document.querySelector("[data-error]");
      firstErr?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);

    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checklist_id: checklist!.id,
        submitted_by: visitorName.trim(),
        answers: questions.map((q) => ({
          question_id: q.id,
          value: answers[q.id] ?? null,
        })),
      }),
    });

    setSubmitting(false);
    if (res.ok) {
      setSubmitted(true);
    } else {
      let msg = "Something went wrong — please try again.";
      try {
        const data = await res.json();
        if (data?.error) msg = `Error: ${data.error}${data.detail ? ` (${data.detail})` : ""}`;
      } catch {}
      alert(msg);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-cream">
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-cream px-4">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kernel.png" alt="Kernel" className="h-16 w-auto mx-auto mb-4 opacity-40" />
          <p className="text-lg font-semibold text-gray-900">This link is no longer active</p>
          <p className="mt-1 text-sm text-gray-500">Please ask a member of staff for assistance.</p>
        </div>
      </div>
    );
  }

  // ── Submitted ────────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-brand-cream px-4">
        <div className="card max-w-sm w-full p-8 text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand/20">
            <svg className="h-8 w-8 text-brown" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Thank you, {visitorName.split(" ")[0]}!</h2>
            <p className="mt-2 text-sm text-gray-600">{checklist!.name} has been recorded.</p>
          </div>
          <p className="text-xs text-gray-400 pt-2">Powered by Kernel</p>
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-brand-cream">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
        <div className="px-4 py-3 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kernel.png" alt="Kernel" className="h-8 w-auto shrink-0" />
          <div>
            <h1 className="text-sm font-semibold text-gray-900 leading-tight">{checklist!.name}</h1>
            <p className="text-xs text-gray-500">Please complete all required fields</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="pb-safe">
        <div className="mx-auto max-w-xl px-4 py-4 space-y-4">

          {checklist!.description && (
            <p className="text-sm text-gray-600 bg-white border border-brand/30 rounded-xl px-4 py-3">
              {checklist!.description}
            </p>
          )}

          {/* Visitor name — always required */}
          <div className="card p-4" data-error={nameError ? true : undefined}>
            <label className="label">Your full name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={visitorName}
              onChange={e => { setVisitorName(e.target.value); if (nameError) setNameError(""); }}
              className="input"
              placeholder="e.g. Jane Smith"
              autoComplete="name"
              autoFocus
            />
            {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
          </div>

          {/* Checklist questions */}
          {questions.map((q) => (
            <div key={q.id} data-error={errors[q.id] ? true : undefined}>
              <QuestionField
                question={q}
                value={answers[q.id] ?? ""}
                onChange={(val) => {
                  setAnswers((prev) => ({ ...prev, [q.id]: val }));
                  if (errors[q.id]) setErrors((prev) => { const e = { ...prev }; delete e[q.id]; return e; });
                }}
                error={errors[q.id]}
                ingredientLots={{}}
                densityByName={{}}
              />
            </div>
          ))}

          {Object.keys(errors).length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Please fill in all required fields before submitting.
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full py-3 text-base rounded-xl"
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>

          <p className="text-center text-xs text-gray-400 pb-8">Powered by Kernel</p>
        </div>
      </form>
    </div>
  );
}
