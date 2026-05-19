"use client";

import { useState } from "react";

// ─── Scoring Definitions ─────────────────────────────────────────────────────

type Risk = "low" | "medium" | "high";

interface ScoreOption { label: string; value: number }
interface ScoreQuestion { id: string; label: string; options: ScoreOption[] }

const RAW_MATERIAL_QUESTIONS: ScoreQuestion[] = [
  {
    id: "temperature",
    label: "Temperature / storage condition",
    options: [
      { label: "Ambient", value: 1 },
      { label: "Frozen", value: 2 },
      { label: "Chilled", value: 3 },
    ],
  },
  {
    id: "packaging",
    label: "How is the raw material packaged on delivery?",
    options: [
      { label: "Enclosed / sealed", value: 1 },
      { label: "Open / unsealed", value: 3 },
    ],
  },
  {
    id: "ips",
    label: "Identity Preserved Status – end product legal declaration",
    options: [
      { label: "No legal declaration (standard product)", value: 1 },
      { label: "Legal declaration present (e.g. Gluten Free, RSPO, Free Range)", value: 3 },
    ],
  },
  {
    id: "micro_results",
    label: "Historic microbiological test results",
    options: [
      { label: "Within target", value: 1 },
      { label: "Acceptable", value: 2 },
      { label: "Unsatisfactory", value: 3 },
    ],
  },
  {
    id: "quality",
    label: "Historic quality of supply",
    options: [
      { label: "Good", value: 1 },
      { label: "Fair", value: 2 },
      { label: "Poor", value: 3 },
    ],
  },
  {
    id: "allergen",
    label: "Allergen risk of the raw material",
    options: [
      { label: "Low – allergen absent from raw material", value: 1 },
      { label: "Medium – may contain allergens", value: 2 },
      { label: "High – allergen present in raw material", value: 3 },
    ],
  },
  {
    id: "foreign_body",
    label: "Foreign body risk",
    options: [
      { label: "Low", value: 1 },
      { label: "Medium", value: 2 },
      { label: "High", value: 3 },
    ],
  },
  {
    id: "micro_risk",
    label: "Microbiological contamination risk",
    options: [
      { label: "Low", value: 1 },
      { label: "Medium", value: 2 },
      { label: "High", value: 3 },
    ],
  },
  {
    id: "chemical",
    label: "Chemical contamination risk",
    options: [
      { label: "Low", value: 1 },
      { label: "Medium", value: 2 },
      { label: "High", value: 3 },
    ],
  },
];

const PACKAGING_QUESTIONS: ScoreQuestion[] = [
  {
    id: "pkg_type",
    label: "Type of packaging",
    options: [
      { label: "Secondary – non-food contact (e.g. outer case)", value: 1 },
      { label: "Primary – unprinted, food contact (e.g. plain jars / lids)", value: 2 },
      { label: "Primary – printed, food contact (e.g. labels, printed film)", value: 3 },
    ],
  },
  {
    id: "mandatory_info",
    label: "Does the packaging carry mandatory information that could cause illness if incorrect? (e.g. allergens, cooking instructions)",
    options: [
      { label: "None – no mandatory safety information", value: 1 },
      { label: "Present – carries mandatory safety information", value: 3 },
    ],
  },
  {
    id: "quality",
    label: "Historic quality of supply",
    options: [
      { label: "Good", value: 1 },
      { label: "Fair", value: 2 },
      { label: "Poor or new supplier", value: 3 },
    ],
  },
];

// ─── Scoring Logic ────────────────────────────────────────────────────────────

function calcMaterialRisk(scores: Record<string, number>, type: "raw_material" | "packaging"): Risk | null {
  const questions = type === "raw_material" ? RAW_MATERIAL_QUESTIONS : PACKAGING_QUESTIONS;
  const vals = questions.map(q => scores[q.id]).filter(v => v !== undefined);
  if (vals.length < questions.length) return null;
  const total = vals.reduce((a, b) => a + b, 0);
  if (type === "raw_material") {
    if (total < 10) return "low";
    if (total <= 15) return "medium";
    return "high";
  } else {
    if (total < 6) return "low";
    if (total <= 7) return "medium";
    return "high";
  }
}

function calcSupplierRisk(saqCompleted: boolean, hasCert: boolean): Risk {
  if (saqCompleted && hasCert) return "low";
  if (saqCompleted || hasCert) return "medium";
  return "high";
}

function calcReviewFrequency(supplierRisk: Risk, materialRisk: Risk): number {
  if (supplierRisk === "high") return 1;
  if (supplierRisk === "medium" && materialRisk === "high") return 1;
  if (supplierRisk === "low" && materialRisk === "high") return 2;
  if (supplierRisk === "medium" && materialRisk === "medium") return 2;
  return 3;
}

function calcTotal(scores: Record<string, number>, type: "raw_material" | "packaging"): number {
  const questions = type === "raw_material" ? RAW_MATERIAL_QUESTIONS : PACKAGING_QUESTIONS;
  return questions.reduce((sum, q) => sum + (scores[q.id] ?? 0), 0);
}

const RISK_STYLES: Record<Risk, { bg: string; text: string; label: string }> = {
  low:    { bg: "bg-brand/30",  text: "text-brown",     label: "Low" },
  medium: { bg: "bg-amber-100", text: "text-amber-800", label: "Medium" },
  high:   { bg: "bg-red-100",   text: "text-red-800",   label: "High" },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  supplierType: "raw_material" | "packaging" | "service";
  saqCompleted: boolean;
  hasCertification: boolean;
  onApply: (result: {
    raw_material_risk: Risk;
    supplier_risk: Risk;
    review_frequency_years: number;
    next_review_due: string;
  }) => void;
}

export default function RiskCalculator({ open, onClose, supplierType, saqCompleted, hasCertification, onApply }: Props) {
  const [scores, setScores] = useState<Record<string, number>>({});

  if (!open || supplierType === "service") return null;

  const questions = supplierType === "raw_material" ? RAW_MATERIAL_QUESTIONS : PACKAGING_QUESTIONS;
  const answered = questions.filter(q => scores[q.id] !== undefined).length;
  const allAnswered = answered === questions.length;
  const total = calcTotal(scores, supplierType);
  const materialRisk = calcMaterialRisk(scores, supplierType);
  const supplierRisk = calcSupplierRisk(saqCompleted, hasCertification);
  const reviewYears = materialRisk ? calcReviewFrequency(supplierRisk, materialRisk) : null;

  const nextReviewDate = reviewYears
    ? (() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() + reviewYears);
        return d.toISOString().split("T")[0];
      })()
    : null;

  function setScore(id: string, val: number) {
    setScores(prev => ({ ...prev, [id]: val }));
  }

  function handleApply() {
    if (!materialRisk || !reviewYears || !nextReviewDate) return;
    onApply({ raw_material_risk: materialRisk, supplier_risk: supplierRisk, review_frequency_years: reviewYears, next_review_due: nextReviewDate });
    onClose();
  }

  const srStyle = RISK_STYLES[supplierRisk];
  const mrStyle = materialRisk ? RISK_STYLES[materialRisk] : null;
  const thresholdLabel = supplierType === "raw_material"
    ? "< 10 = Low  ·  10–15 = Medium  ·  > 15 = High"
    : "< 6 = Low  ·  6–7 = Medium  ·  > 7 = High";

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
                <span className={`w-2 h-2 rounded-full ${hasCertification ? "bg-green-500" : "bg-red-400"}`} />
                Accreditation: <strong>{hasCertification ? "Held" : "None"}</strong>
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
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">
              {supplierType === "raw_material" ? "Raw Material" : "Packaging Material"} Risk Factors
            </p>
            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={q.id} className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs font-medium text-gray-800 mb-2.5">
                    <span className="text-gray-400 mr-1">{i + 1}.</span> {q.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map(opt => {
                      const selected = scores[q.id] === opt.value;
                      const selClass = opt.value === 1
                        ? "bg-brand border-brown/20 text-brown"
                        : opt.value === 2
                        ? "bg-amber-100 border-amber-300 text-amber-800"
                        : "bg-red-100 border-red-300 text-red-800";
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setScore(q.id, opt.value)}
                          className={`px-3 py-1.5 rounded text-xs font-medium border transition ${selected ? selClass : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}
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
    </div>
  );
}
