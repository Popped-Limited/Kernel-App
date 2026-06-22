"use client";
import BackButton from "@/components/BackButton";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import TraceChain from "@/components/TraceChain";
import {
  searchByLot,
  searchByBatch,
  searchIngredientLots,
  traceFromLot,
  searchByProduct,
  computeMassBalance,
  type LotInfo,
  type TraceResult,
} from "@/lib/traceability";
import { formatDate } from "@/lib/utils";

type Direction = "forward" | "backward";
type Outcome = "pass" | "pass_with_actions" | "fail";

interface CustomerContact {
  customer: string;
  contacted_by: string;
  response: string;
}

export default function MockRecallPage() {
  const router = useRouter();
  const { orgId } = useOrganisation();

  // The clock starts as soon as the flow opens — SALSA wants time-to-complete.
  const startedAt = useRef<string>(new Date().toISOString());

  const [step, setStep] = useState<"direction" | "trigger" | "report">("direction");
  const [direction, setDirection] = useState<Direction | null>(null);

  // Trigger search
  const [triggerMode, setTriggerMode] = useState<"name" | "julian">("name");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ingredientLots, setIngredientLots] = useState<LotInfo[] | null>(null);

  // Result + findings
  const [result, setResult] = useState<TraceResult | null>(null);
  const [triggerLabel, setTriggerLabel] = useState("");
  const [findings, setFindings] = useState("");
  const [correctiveActions, setCorrectiveActions] = useState("");
  const [customers, setCustomers] = useState<CustomerContact[]>([]);
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [conductedBy, setConductedBy] = useState("");
  const [signedOffBy, setSignedOffBy] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const name = (user?.user_metadata as { full_name?: string } | undefined)?.full_name;
      if (name) setConductedBy(name);
    });
  }, []);

  function chooseDirection(d: Direction) {
    setDirection(d);
    setTriggerMode("name");
    setQuery("");
    setError("");
    setIngredientLots(null);
    setStep("trigger");
  }

  function adoptResult(r: TraceResult, label: string) {
    setResult(r);
    setTriggerLabel(label);
    setIngredientLots(null);
    setStep("report");
  }

  async function handleTriggerSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setIngredientLots(null);

    try {
      if (direction === "forward") {
        if (triggerMode === "julian") {
          const out = await searchByLot(query.trim());
          if ("error" in out) setError(out.error);
          else adoptResult(out.result, `Raw material — Julian ${query.trim()}`);
        } else {
          const out = await searchIngredientLots(query.trim());
          if ("error" in out) setError(out.error);
          else setIngredientLots(out.lots);
        }
      } else {
        if (triggerMode === "julian") {
          const out = await searchByBatch(query.trim());
          if ("error" in out) setError(out.error);
          else adoptResult(out.result, `Finished product — Julian ${query.trim()}`);
        } else {
          const out = await searchByProduct(query.trim());
          if ("error" in out) setError(out.error);
          else adoptResult(out.result, out.result.query);
        }
      }
    } catch {
      setError("Search failed — please try again.");
    }
    setLoading(false);
  }

  async function pickLot(lot: LotInfo) {
    setLoading(true);
    setError("");
    try {
      const out = await traceFromLot(lot);
      if ("error" in out) setError(out.error);
      else adoptResult(out.result, `${lot.ingredient?.name ?? "Ingredient"} — Julian ${lot.julian_code}`);
    } catch {
      setError("Trace failed — please try again.");
    }
    setLoading(false);
  }

  function addCustomer() {
    setCustomers((c) => [...c, { customer: "", contacted_by: conductedBy, response: "" }]);
  }
  function updateCustomer(i: number, patch: Partial<CustomerContact>) {
    setCustomers((c) => c.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function removeCustomer(i: number) {
    setCustomers((c) => c.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!orgId || !result || !direction || !outcome) return;
    setSaving(true);
    const massBalance = computeMassBalance(result);
    const { data, error: insErr } = await supabase
      .from("mock_recalls")
      .insert({
        organisation_id: orgId,
        direction,
        trigger_type: direction === "forward" ? "ingredient_lot" : "finished_product",
        trigger_label: triggerLabel,
        trace_snapshot: result,
        mass_balance: massBalance,
        findings: findings.trim() || null,
        corrective_actions: correctiveActions.trim() || null,
        customers_contacted: customers.filter((c) => c.customer.trim()),
        time_started: startedAt.current,
        time_completed: new Date().toISOString(),
        outcome,
        conducted_by: conductedBy.trim(),
        signed_off_by: signedOffBy.trim() || null,
      })
      .select("id")
      .single();

    setSaving(false);
    if (insErr || !data) {
      setError("Could not save the recall. Please try again.");
      return;
    }
    router.push(`/compliance/traceability/recalls/${data.id}`);
  }

  const massBalance = result ? computeMassBalance(result) : null;
  const canSave = !!result && !!outcome && conductedBy.trim().length > 0 && !saving;

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-4xl w-full mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="text-xl font-bold text-gray-900">Mock recall</h1>
      </div>

      {/* Step indicator */}
      <ol className="flex items-center gap-2 text-xs font-medium">
        <StepDot active={step === "direction"} done={step !== "direction"} label="1 · Direction" />
        <span className="text-gray-300">→</span>
        <StepDot active={step === "trigger"} done={step === "report"} label="2 · Starting point" />
        <span className="text-gray-300">→</span>
        <StepDot active={step === "report"} done={false} label="3 · Findings & sign-off" />
      </ol>

      {/* ── Step 1: direction ─────────────────────────────────────────── */}
      {step === "direction" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            onClick={() => chooseDirection("backward")}
            className="card p-5 text-left hover:border-brand hover:shadow-md transition border-2 border-transparent"
          >
            <p className="text-sm font-bold text-gray-900 mb-1">Backward trace</p>
            <p className="text-xs text-gray-500 mb-3">Start from a finished product and trace back to every raw-material lot and supplier.</p>
            <p className="text-xs text-brown bg-brand-cream rounded px-2 py-1.5">“If <strong>this product</strong> is unsafe — what’s in it and who supplied it?”</p>
          </button>
          <button
            onClick={() => chooseDirection("forward")}
            className="card p-5 text-left hover:border-brand hover:shadow-md transition border-2 border-transparent"
          >
            <p className="text-sm font-bold text-gray-900 mb-1">Forward trace</p>
            <p className="text-xs text-gray-500 mb-3">Start from a raw-material lot and trace forward to every batch and customer it reached.</p>
            <p className="text-xs text-brown bg-brand-cream rounded px-2 py-1.5">“If <strong>this ingredient</strong> is unsafe — what did I make with it and who did I sell it to?”</p>
          </button>
        </div>
      )}

      {/* ── Step 2: choose starting point ─────────────────────────────── */}
      {step === "trigger" && direction && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">
              {direction === "forward" ? "Select the raw material to trace forward" : "Select the finished product to trace back"}
            </h2>
            <button onClick={() => setStep("direction")} className="text-xs text-gray-500 hover:text-gray-800">← Change direction</button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <ModeTab active={triggerMode === "name"} onClick={() => setTriggerMode("name")}>
              {direction === "forward" ? "Ingredient name" : "Finished product name"}
            </ModeTab>
            <ModeTab active={triggerMode === "julian"} onClick={() => setTriggerMode("julian")}>
              {direction === "forward" ? "Raw material Julian code" : "Finished product Julian code"}
            </ModeTab>
          </div>

          <form onSubmit={handleTriggerSearch} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                direction === "forward"
                  ? triggerMode === "julian" ? "e.g. 26124 (raw material Julian code)" : "e.g. Shallots, Garlic, Naga chilli…"
                  : triggerMode === "julian" ? "e.g. 26134 (batch Julian code)" : "e.g. Garlic Chilli Oil…"
              }
              className="input flex-1"
            />
            <button type="submit" disabled={loading} className="btn-primary shrink-0">
              {loading ? "Searching…" : "Search"}
            </button>
          </form>
          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Forward ingredient → lot picker */}
          {ingredientLots && (
            <div className="border border-brand/30 rounded overflow-hidden">
              <div className="px-4 py-2.5 border-b border-brand/30 bg-brand-cream">
                <span className="font-semibold text-sm text-brown">Goods-in records</span>
                <span className="text-xs text-brown/60 ml-2">{ingredientLots.length} lot{ingredientLots.length !== 1 ? "s" : ""} — select one to trace</span>
              </div>
              <div className="divide-y divide-gray-100">
                {ingredientLots.map((lot) => (
                  <button
                    key={lot.id}
                    onClick={() => pickLot(lot)}
                    className="w-full text-left px-4 py-3 hover:bg-brand/10 transition-colors flex items-center justify-between gap-4 group"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="font-mono font-semibold text-sm text-gray-900 shrink-0">{lot.julian_code}</span>
                      <span className="text-sm font-medium text-gray-700 truncate">{lot.ingredient?.name}</span>
                      {lot.supplier && <span className="text-xs text-gray-400 truncate hidden sm:block">{lot.supplier}</span>}
                    </div>
                    <div className="flex items-center gap-4 shrink-0 text-xs text-gray-500">
                      <span>{formatDate(lot.received_date)}</span>
                      <span className="text-brown font-medium opacity-0 group-hover:opacity-100 transition-opacity">Trace →</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: report ────────────────────────────────────────────── */}
      {step === "report" && result && massBalance && (
        <div className="space-y-6">
          {/* Trigger summary */}
          <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">{direction === "forward" ? "Forward trace from" : "Backward trace from"}</p>
              <p className="text-sm font-semibold text-gray-900">{triggerLabel}</p>
            </div>
            <button onClick={() => setStep("trigger")} className="text-xs text-gray-500 hover:text-gray-800">← Change starting point</button>
          </div>

          {/* Mass balance reconciliation */}
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Mass-balance reconciliation</p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">{massBalance.produced.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-0.5">units produced</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{massBalance.dispatched.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-0.5">units dispatched</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{massBalance.remaining.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-0.5">unaccounted / in stock</p>
              </div>
            </div>
            {massBalance.produced === 0 ? (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded px-3 py-2">No “units produced” figure found on the traced batch record(s) — enter it in the batch record so the mass balance can reconcile.</p>
            ) : massBalance.reconciled ? (
              <p className="mt-3 text-xs text-green-700 bg-green-50 rounded px-3 py-2">✓ Reconciles — dispatched units do not exceed units produced.</p>
            ) : (
              <p className="mt-3 text-xs text-red-700 bg-red-50 rounded px-3 py-2">⚠ Does not reconcile — more units dispatched than produced. Investigate before closing this recall.</p>
            )}
          </div>

          {/* The chain */}
          <TraceChain result={result} defaultOpen linkBack="/compliance/traceability/mock-recall" />

          {/* Findings */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Findings &amp; outcome</h2>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Findings</label>
              <textarea
                value={findings}
                onChange={(e) => setFindings(e.target.value)}
                rows={3}
                placeholder="What did the trace show? Were all records present and matching?"
                className="input w-full text-base"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Corrective actions (if any)</label>
              <textarea
                value={correctiveActions}
                onChange={(e) => setCorrectiveActions(e.target.value)}
                rows={2}
                placeholder="Leave blank if none required."
                className="input w-full text-base"
              />
            </div>

            {/* Customers contacted */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-600">Customers contacted</label>
                <button type="button" onClick={addCustomer} className="text-xs text-brown font-medium hover:underline">+ Add customer</button>
              </div>
              {customers.length === 0 ? (
                <p className="text-xs text-gray-400">None recorded.</p>
              ) : (
                <div className="space-y-2">
                  {customers.map((c, i) => (
                    <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-start border border-gray-200 rounded p-2">
                      <input
                        value={c.customer}
                        onChange={(e) => updateCustomer(i, { customer: e.target.value })}
                        placeholder="Customer"
                        className="input text-base"
                      />
                      <input
                        value={c.response}
                        onChange={(e) => updateCustomer(i, { response: e.target.value })}
                        placeholder="Their response"
                        className="input text-base"
                      />
                      <button type="button" onClick={() => removeCustomer(i)} className="text-xs text-red-500 hover:text-red-700 px-2 py-2">Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Outcome</label>
              <div className="flex flex-wrap gap-2">
                {([
                  ["pass", "Pass"],
                  ["pass_with_actions", "Pass with actions"],
                  ["fail", "Fail"],
                ] as [Outcome, string][]).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setOutcome(val)}
                    className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${outcome === val ? "bg-brand border-brand/50 text-brown font-medium" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Conducted by</label>
                <input value={conductedBy} onChange={(e) => setConductedBy(e.target.value)} className="input w-full text-base" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Signed off by (optional)</label>
                <input value={signedOffBy} onChange={(e) => setSignedOffBy(e.target.value)} className="input w-full text-base" />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <button onClick={handleSave} disabled={!canSave} className="btn-primary">
              {saving ? "Saving…" : "Save mock recall"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <span className={`px-2.5 py-1 rounded-full ${active ? "bg-brand text-brown" : done ? "bg-brand-light text-brown" : "bg-gray-100 text-gray-400"}`}>
      {label}
    </span>
  );
}

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-xs font-medium transition ${active ? "bg-brand text-brown" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
    >
      {children}
    </button>
  );
}
