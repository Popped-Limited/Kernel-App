"use client";

import {
  RAW_MATERIAL_QUESTIONS,
  PACKAGING_QUESTIONS,
  REVIEW_FREQUENCY_MATRIX,
  type Risk,
} from "@/lib/supplierRisk";

// Read-only reference of the full SALSA supplier risk-assessment model.
// Opened from the supplier form and the calculator so an auditor can see the
// scoring basis in one click. Pure presentation — no state, no DB.

const RISK_CELL: Record<Risk, string> = {
  low: "bg-brand/30 text-brown",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
};

function ScoreTable({ title, questions }: { title: string; questions: typeof RAW_MATERIAL_QUESTIONS }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-2">{title}</p>
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium">Factor</th>
              <th className="text-left px-2 py-1.5 font-medium">Score 1</th>
              <th className="text-left px-2 py-1.5 font-medium">Score 2</th>
              <th className="text-left px-2 py-1.5 font-medium">Score 3</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {questions.map(q => {
              const byVal = (v: number) => q.options.find(o => o.value === v)?.label ?? "—";
              return (
                <tr key={q.id}>
                  <td className="px-3 py-1.5 text-gray-700">{q.label}</td>
                  <td className="px-2 py-1.5 text-brown bg-brand/10">{byVal(1)}</td>
                  <td className="px-2 py-1.5 text-amber-800 bg-amber-50">{byVal(2)}</td>
                  <td className="px-2 py-1.5 text-red-800 bg-red-50">{byVal(3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SupplierRiskMatrix({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  const risks: Risk[] = ["low", "medium", "high"];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="fixed inset-0 z-[60] flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0 bg-gray-50">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Supplier Risk Assessment — Scoring Basis</h2>
            <p className="text-xs text-gray-500 mt-0.5">SALSA Supplier Approval Matrix</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          <ScoreTable title="Raw material risk factors (each scored 1–3)" questions={RAW_MATERIAL_QUESTIONS} />
          <p className="text-[11px] text-gray-500 -mt-3">
            Total score → <strong>&lt; 10 Low · 10–15 Medium · &gt; 15 High</strong>
          </p>

          <ScoreTable title="Packaging risk factors (each scored 1–3)" questions={PACKAGING_QUESTIONS} />
          <p className="text-[11px] text-gray-500 -mt-3">
            Total score → <strong>&lt; 6 Low · 6–7 Medium · &gt; 7 High</strong>
          </p>

          {/* Supplier risk grid */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Supplier risk (SAQ × accreditation)</p>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-[11px]">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-medium">SAQ completed</th>
                    <th className="text-left px-3 py-1.5 font-medium">Accreditation / hygiene rating</th>
                    <th className="text-left px-3 py-1.5 font-medium">Supplier risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    ["Yes", "Yes", "low"],
                    ["No", "Yes", "medium"],
                    ["Yes", "No", "medium"],
                    ["No", "No", "high"],
                  ].map(([saq, cert, risk]) => (
                    <tr key={`${saq}-${cert}`}>
                      <td className="px-3 py-1.5 text-gray-700">{saq}</td>
                      <td className="px-3 py-1.5 text-gray-700">{cert}</td>
                      <td className="px-3 py-1.5">
                        <span className={`inline-block rounded-full px-2 py-0.5 font-semibold ${RISK_CELL[risk as Risk]}`}>
                          {cap(risk)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Review frequency matrix */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Review frequency (supplier risk × raw-material risk)</p>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-[11px] text-center">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-1.5 font-medium text-left">Material risk ↓ / Supplier risk →</th>
                    {risks.map(r => <th key={r} className="px-3 py-1.5 font-medium">{cap(r)}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {risks.map(materialRisk => (
                    <tr key={materialRisk}>
                      <td className="px-3 py-1.5 text-left font-medium text-gray-700">{cap(materialRisk)}</td>
                      {risks.map(supplierRisk => {
                        const yrs = REVIEW_FREQUENCY_MATRIX[materialRisk][supplierRisk];
                        return (
                          <td key={supplierRisk} className="px-3 py-1.5 text-gray-700">
                            Every {yrs} yr{yrs !== 1 ? "s" : ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        <div className="border-t border-gray-200 px-6 py-4 shrink-0">
          <button onClick={onClose} className="btn-primary w-full">Close</button>
        </div>
      </div>
    </div>
  );
}
