"use client";

import { useState } from "react";
import {
  materialQuestions,
  materialTotal,
  calcMaterialRisk,
  calcSupplierRisk,
  calcReviewFrequency,
  reviewDueDate,
  THRESHOLD_LABELS,
  RISK_STYLES,
  type Risk,
  type RiskAssessmentData,
} from "@/lib/supplierRisk";
import SupplierRiskMatrix from "@/components/SupplierRiskMatrix";

interface Props {
  open: boolean;
  onClose: () => void;
  supplierType: "raw_material" | "packaging" | "service";
  saqCompleted: boolean;
  /** Whether the supplier has a valid (uploaded, non-expired) certificate. */
  hasValidCert: boolean;
  onApply: (result: {
    raw_material_risk: Risk;
    supplier_risk: Risk;
    review_frequency_years: number;
    next_review_due: string;
    risk_assessment_data: RiskAssessmentData;
  }) => void;
}

export default function RiskCalculator({ open, onClose, supplierType, saqCompleted, hasValidCert, onApply }: Props) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [matrixOpen, setMatrixOpen] = useState(false);

  if (!open || supplierType === "service") return null;

  const questions = materialQuestions(supplierType);
  const answered = questions.filter(q => scores[q.id] !== undefined).length;
  const allAnswered = answered === questions.length;
  const total = materialTotal(scores, supplierType);
  const materialRisk = calcMaterialRisk(scores, supplierType);
  const supplierRisk = calcSupplierRisk(saqCompleted, hasValidCert);
  const reviewYears = materialRisk ? calcReviewFrequency(supplierRisk, materialRisk) : null;
  const nextReviewDate = reviewYears ? reviewDueDate(reviewYears) : null;

  function setScore(id: string, val: number) {
    setScores(prev => ({ ...prev, [id]: val }));
  }

  function handleApply() {
    if (!materialRisk || !reviewYears || !nextReviewDate) return;
    onApply({
      raw_material_risk: materialRisk,
      supplier_risk: supplierRisk,
      review_frequency_years: reviewYears,
      next_review_due: nextReviewDate,
      risk_assessment_data: {
        material_type: supplierType as "raw_material" | "packaging",
        material_scores: scores,
        material_total: total,
        material_band: materialRisk,
        saq_completed: saqCompleted,
        has_valid_cert: hasValidCert,
        supplier_risk: supplierRisk,
        review_frequency_years: reviewYears,
        assessed_at: new Date().toISOString().split("T")[0],
      },
    });
    onClose();
  }

  const srStyle = RISK_STYLES[supplierRisk];
  const mrStyle = materialRisk ? RISK_STYLES[materialRisk] : null;
  const thresholdLabel = THRESHOLD_LABELS[supplierType];

  // Always-on colour tint per score value (green/amber/red), heavier ring when selected.
  const valueClass = (val: number, selected: boolean) => {
    const base =
      val === 1 ? "bg-brand/20 border-brown/20 text-brown"
      : val === 2 ? "bg-amber-50 border-amber-300 text-amber-800"
      : "bg-red-50 border-red-300 text-red-800";
    const sel =
      val === 1 ? "ring-2 ring-brown/40 bg-brand"
      : val === 2 ? "ring-2 ring-amber-400 bg-amber-100"
      : "ring-2 ring-red-400 bg-red-100";
    return `${base} ${selected ? sel : "hover:brightness-95"}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0 bg-gray-50">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Risk Assessment Calculator</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {supplierType === "raw_material" ? "Raw material supplier — 9 factors" : "Packaging supplier — 3 factors"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Supplier risk (auto) */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Supplier Risk (auto-calculated)</p>
            <div className="grid grid-cols-2 gap-3 text-xs text-gray-700 mb-3">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${saqCompleted ? "bg-green-500" : "bg-red-400"}`} />
                SAQ: <strong>{saqCompleted ? "Completed" : "Not completed"}</strong>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${hasValidCert ? "bg-green-500" : "bg-red-400"}`} />
                Valid cert: <strong>{hasValidCert ? "Yes" : "No"}</strong>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">Supplier risk:</span>
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${srStyle.bg} ${srStyle.text}`}>
                {srStyle.label}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">SAQ ✓ + Cert ✓ = Low · One missing = Medium · Both missing = High</p>
          </div>

          {/* Scoring questions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                {supplierType === "raw_material" ? "Raw Material" : "Packaging Material"} Risk Factors
              </p>
              <button
                type="button"
                onClick={() => setMatrixOpen(true)}
                className="text-xs font-medium text-brown hover:underline"
              >
                How is this calculated?
              </button>
            </div>
            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={q.id} className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs font-medium text-gray-800 mb-2.5">
                    <span className="text-gray-400 mr-1">{i + 1}.</span> {q.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map(opt => {
                      const selected = scores[q.id] === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setScore(q.id, opt.value)}
                          className={`px-3 py-1.5 rounded text-xs font-medium border transition ${valueClass(opt.value, selected)}`}
                        >
                          <span className="text-[10px] font-bold mr-1 opacity-50">{opt.value}</span>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Score summary */}
          <div className="rounded-lg border-2 border-brand/40 bg-brand/5 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Score Summary</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">Questions answered</span>
              <span className="font-semibold text-gray-900">{answered} / {questions.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">Total score</span>
              <span className="text-lg font-bold text-brown">{total > 0 ? total : "—"}</span>
            </div>
            <p className="text-[10px] text-gray-400">{thresholdLabel}</p>

            {materialRisk && mrStyle && (
              <div className="border-t border-brand/20 pt-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">{supplierType === "raw_material" ? "Raw material risk" : "Packaging material risk"}</span>
                  <span className={`inline-block rounded-full px-2.5 py-0.5 font-semibold ${mrStyle.bg} ${mrStyle.text}`}>{mrStyle.label}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">Review frequency</span>
                  <span className="font-semibold text-gray-900">Every {reviewYears} year{reviewYears !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">Next review due</span>
                  <span className="font-semibold text-gray-900">
                    {nextReviewDate ? new Date(nextReviewDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                  </span>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex gap-3 shrink-0">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button onClick={handleApply} disabled={!allAnswered} className="btn-primary flex-1 disabled:opacity-40">
            Apply to Supplier
          </button>
        </div>

      </div>

      <SupplierRiskMatrix open={matrixOpen} onClose={() => setMatrixOpen(false)} />
    </div>
  );
}
