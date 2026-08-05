"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { fetchAll } from "@/lib/fetchAll";
import { formatDate } from "@/lib/utils";
import { useOrganisation } from "@/contexts/OrganisationContext";
import { loadSpecRow, saveSpecPatch } from "@/components/useProductSpecSheet";
import type { SpecData } from "@/lib/spec-sheet";

// The product's agreed sensory STANDARD (what it should look, smell, feel and
// taste like) is entered here and pulled straight onto the spec sheet — the
// checks below are the evidence that each batch met it. Stored on the product's
// spec sheet row so there's one definition, entered once.

// Per-product organoleptic check history. A check links to the product either
// via its "Production batch record" batch_link answer ({submission_id,
// batch_code, product}) or — for records without a link — by the free-typed
// "Product or material name" answer matching this product exactly
// (case-insensitive, trimmed; same matching rule as everywhere else).

interface CheckRow {
  id: string;
  submittedAt: string;
  submittedBy: string;
  checkType: string;
  batchCode: string;
  result: string;
  linked: boolean; // true when matched via the batch_link answer
}

interface RawSubmission {
  id: string;
  submitted_at: string;
  submitted_by: string | null;
  answers: Array<{ value: string | null; question: { type: string; label: string } | null }>;
}

function ResultBadge({ result }: { result: string }) {
  const r = result.trim().toLowerCase();
  if (r === "pass") return <span className="badge bg-green-100 text-green-700">Pass</span>;
  if (r === "fail") return <span className="badge bg-red-100 text-red-600">Fail</span>;
  return <span className="text-gray-300">—</span>;
}

type Organoleptic = SpecData["organoleptic"];
const EMPTY_STANDARD: Organoleptic = { appearance: "", aroma: "", texture: "", flavour: "" };

const STANDARD_FIELDS: [keyof Organoleptic, string, string][] = [
  ["appearance", "Appearance", "e.g. Dark red oil with 4-6mm particulates, half oil and half sediment when settled"],
  ["aroma", "Aroma", "e.g. Savoury"],
  ["texture", "Texture", "e.g. Lightly toasted, crisp sediment"],
  ["flavour", "Flavour", "e.g. Deeply savoury, spicy, slightly salty"],
];

/** The agreed sensory standard for the product — feeds the spec sheet. */
function StandardPanel({ productName }: { productName: string }) {
  const { orgId } = useOrganisation();
  const [standard, setStandard] = useState<Organoleptic>(EMPTY_STANDARD);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!orgId) return;
    const row = await loadSpecRow(orgId, productName);
    if (row.tableMissing) { setUnavailable(true); setLoading(false); return; }
    setStandard({ ...EMPTY_STANDARD, ...(row.data.organoleptic ?? {}) });
    setLoading(false);
  }, [orgId, productName]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!orgId) return;
    setSaving(true);
    setError("");
    const res = await saveSpecPatch(orgId, productName, { organoleptic: standard });
    setSaving(false);
    if (res.error) { setError("Failed to save: " + res.error); return; }
    setSaved(true);
  }

  if (unavailable) return null;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">Product standard</h2>
      </div>
      {loading ? (
        <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {STANDARD_FIELDS.map(([key, label, placeholder]) => (
              <div key={key} className={key === "appearance" ? "sm:col-span-2" : ""}>
                <label className="label">{label}</label>
                <textarea
                  className="input"
                  rows={key === "appearance" ? 2 : 1}
                  placeholder={placeholder}
                  value={standard[key]}
                  onChange={e => { setStandard(s => ({ ...s, [key]: e.target.value })); setSaved(false); }}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving || !orgId}
              className="btn-primary text-sm disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save standard"}
            </button>
            {saved && <span className="text-xs text-green-600 font-medium">Saved</span>}
            {error && <span className="text-xs text-red-500">{error}</span>}
            {!saved && !error && <span className="text-xs text-gray-400">Appears on the product spec sheet</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductOrganolepticPanel({ productName }: { productName: string }) {
  const [rows, setRows] = useState<CheckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // Tolerant of per-org renames like "Organoleptic Checks (Monthly)".
        const { data: cls, error: clErr } = await supabase
          .from("checklists")
          .select("id")
          .ilike("name", "%organoleptic%");
        if (clErr) throw clErr;
        const ids = (cls ?? []).map((c) => c.id);
        if (ids.length === 0) { if (!cancelled) { setRows([]); setLoading(false); } return; }

        // fetchAll<any> + cast: Supabase infers the joined `question` as an
        // array, same as the other submission readers in this app.
        const subs = (await fetchAll<any>((from, to) => supabase
          .from("submissions")
          .select("id, submitted_at, submitted_by, answers(value, question:questions(type, label))")
          .in("checklist_id", ids)
          .order("submitted_at", { ascending: false })
          .range(from, to))) as unknown as RawSubmission[];
        if (cancelled) return;

        const target = productName.trim().toLowerCase();
        const matched: CheckRow[] = [];
        for (const sub of subs) {
          let linkedProduct = "";
          let linkedBatch = "";
          let typedProduct = "";
          let typedBatch = "";
          let checkType = "";
          let result = "";
          for (const a of sub.answers ?? []) {
            if (!a.value) continue;
            const label = (a.question?.label ?? "").toLowerCase();
            const type = a.question?.type ?? "";
            if (type === "batch_link") {
              try {
                const p = JSON.parse(a.value) as { batch_code?: string; product?: string };
                linkedProduct = (p.product ?? "").trim();
                linkedBatch = (p.batch_code ?? "").trim();
              } catch { /* not a parsed link — ignore */ }
            } else if (type === "text" && label.includes("product") && label.includes("name")) {
              typedProduct = a.value.trim();
            } else if (type === "text" && (label.includes("batch code") || label.includes("lot number"))) {
              typedBatch = a.value.trim();
            } else if (type === "dropdown" && label.includes("check type")) {
              checkType = a.value;
            } else if (type === "dropdown" && label.includes("overall result")) {
              result = a.value;
            }
          }
          const linked = linkedProduct.toLowerCase() === target;
          if (!linked && typedProduct.toLowerCase() !== target) continue;
          matched.push({
            id: sub.id,
            submittedAt: sub.submitted_at,
            submittedBy: sub.submitted_by ?? "",
            checkType,
            batchCode: linked && linkedBatch ? linkedBatch : typedBatch,
            result,
            linked,
          });
        }
        if (!cancelled) { setRows(matched); setLoading(false); }
      } catch {
        if (!cancelled) { setError("Failed to load organoleptic checks."); setLoading(false); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [productName]);

  return (
    <div className="space-y-6">
    <StandardPanel productName={productName} />

    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Organoleptic checks</h2>
        {!loading && !error && <span className="text-xs text-gray-400">{rows.length} record{rows.length !== 1 ? "s" : ""}</span>}
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
      ) : error ? (
        <div className="p-8 text-center text-sm text-red-500">{error}</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-400">
          No organoleptic checks recorded for this product yet. Record one under Checklists → Organoleptic Checks.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50/50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Check type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Batch code</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">By</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{formatDate(row.submittedAt.slice(0, 10))}</td>
                  <td className="px-4 py-3 text-gray-700">{row.checkType || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 font-mono text-gray-700">{row.batchCode || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3"><ResultBadge result={row.result} /></td>
                  <td className="px-4 py-3 text-gray-700">{row.submittedBy || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-right">
                    <a href={`/submission/${row.id}`} className="text-xs text-brown/60 hover:text-brown hover:underline whitespace-nowrap">
                      View record →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </div>
  );
}
