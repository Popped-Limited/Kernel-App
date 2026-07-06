"use client";
import BackButton from "@/components/BackButton";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import type { Dispatch, Submission, Checklist, Question, GoodsReturn } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import PhotoCapture from "@/components/PhotoCapture";
import SaveButton from "@/components/SaveButton";
import { uploadPhotoAnswers } from "@/lib/photoUpload";
import { expandRunValues } from "@/lib/production-runs";
import { fetchAll } from "@/lib/fetchAll";

/** Returns current local datetime as YYYY-MM-DDThh:mm for datetime-local inputs */
function nowLocalDateTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function renderComplianceField(
  q: Question,
  value: string,
  onChange: (v: string) => void,
) {
  const base = "input text-sm py-1.5 w-full";
  if (q.type === "dropdown" && q.options?.length) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} className={base}>
        <option value="">Select…</option>
        {q.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (q.type === "multiple_choice" && q.options?.length) {
    return (
      <div className="flex flex-wrap gap-2 mt-0.5">
        {q.options.map(o => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${value === o ? "bg-brand border-brand/50 text-brown font-medium" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "checkbox") {
    return (
      <div className="flex gap-2 mt-0.5">
        {[{ label: "Yes", val: "true" }, { label: "No", val: "false" }].map(o => (
          <button
            key={o.val}
            type="button"
            onClick={() => onChange(o.val)}
            className={`px-4 py-1.5 rounded-full text-xs border transition-colors ${value === o.val ? "bg-brand border-brand/50 text-brown font-medium" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "number") {
    return (
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={base}
        inputMode="decimal"
        step="any"
        placeholder={q.hint ?? ""}
      />
    );
  }
  if (q.type === "photo") {
    return <PhotoCapture value={value} onChange={onChange} />;
  }
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      className={base}
      placeholder={q.hint ?? ""}
    />
  );
}

interface ProductRow {
  product: string;
  casesOf6: string;
  casesOf3: string;
  singles: string;
  batchSubmissionId: string;
}

function emptyRow(): ProductRow {
  return { product: "", casesOf6: "0", casesOf3: "0", singles: "0", batchSubmissionId: "" };
}

/** Pull batch code, BBE date, and total jars out of a submission's answers */
function batchSummary(answers: Array<{ value: string | null; question: { type: string; label: string } | null }>) {
  let batchCode = "";
  let bbeDate = "";
  let totalUnits = 0;      // from explicit "total units produced" field
  let jarsUsedFallback = 0; // from jars_used in packing_runs
  for (const ans of answers ?? []) {
    const type  = ans.question?.type ?? "";
    const label = (ans.question?.label ?? "").toLowerCase();
    // Prefer explicit "total units produced" answer (matches Finished Goods logic)
    if (label.includes("total units produced") && ans.value) {
      totalUnits += Number(ans.value) || 0;
    }
    if (type === "packing_runs" && ans.value) {
      for (const v of expandRunValues(ans.value)) {
        try {
          const rows = JSON.parse(v) as Array<{ jars_used?: string }>;
          for (const r of rows) jarsUsedFallback += Number(r.jars_used) || 0;
        } catch { /* ignore */ }
      }
    }
    if (!batchCode && type === "text" && (label.includes("batch") || label.includes("lot")) && ans.value) {
      batchCode = ans.value;
    }
    // Only accept an actual date as the BBE — skip checkbox "true"/"false"
    // and other non-date answers that happen to mention "best before".
    if (!bbeDate && (label.includes("best before") || label.includes("bbe")) && ans.value) {
      const v = ans.value.trim();
      if ((type === "date" || /^\d{4}-\d{2}-\d{2}/.test(v))) {
        bbeDate = v;
      }
    }
  }
  return { batchCode, bbeDate, totalJars: totalUnits > 0 ? totalUnits : jarsUsedFallback };
}

export default function GoodsOutPage() {
  const { orgId } = useOrganisation();
  const [recentDispatches, setRecentDispatches] = useState<Dispatch[]>([]);
  const [batchSubmissions, setBatchSubmissions] = useState<(Submission & { checklist: Checklist })[]>([]);
  const [productChecklists, setProductChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [complianceWarning, setComplianceWarning] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [panelSearch, setPanelSearch] = useState("");
  const [panelPeriod, setPanelPeriod] = useState<"week" | "month" | "all">("week");
  const [goodsOutChecklistId, setGoodsOutChecklistId] = useState<string | null>(null);
  // Net units out per batch_submission_id (dispatched − returned). Drives the
  // "remaining" figure when allocating a batch, so returned units free up again.
  const [dispatchedPerBatch, setDispatchedPerBatch] = useState<Record<string, number>>({});
  // Signed sum of batch-tagged finished-goods adjustments (samples, wastage,
  // count corrections) per batch_submission_id — a −1 sample lowers what's
  // available to dispatch, mirroring the Finished Goods per-batch figure.
  const [adjustedPerBatch, setAdjustedPerBatch] = useState<Record<string, number>>({});

  // Returns
  const [recentReturns, setRecentReturns] = useState<GoodsReturn[]>([]);
  const [returnedByDispatch, setReturnedByDispatch] = useState<Record<string, number>>({});
  const [returnDispatch, setReturnDispatch] = useState<Dispatch | null>(null);
  const [returnQty, setReturnQty]           = useState("");
  const [returnDate, setReturnDate]         = useState("");
  const [returnBy, setReturnBy]             = useState("");
  const [returnNotes, setReturnNotes]       = useState("");
  const [returnSaving, setReturnSaving]     = useState(false);
  const [returnError, setReturnError]       = useState("");

  // Edit existing dispatch
  const [editingDispatch, setEditingDispatch] = useState<Dispatch | null>(null);
  const [editDate, setEditDate]               = useState("");
  const [editProduct, setEditProduct]         = useState("");
  const [editCustomer, setEditCustomer]       = useState("");
  const [editCasesOf6, setEditCasesOf6]       = useState("");
  const [editCasesOf3, setEditCasesOf3]       = useState("");
  const [editSingles, setEditSingles]         = useState("");
  const [editRef, setEditRef]                 = useState("");
  const [editDispatchedBy, setEditDispatchedBy] = useState("");
  const [editNotes, setEditNotes]             = useState("");
  // The linked batch is editable too (a mis-linked batch silently corrupts the
  // per-batch stock figures). Stock is computed live from dispatch links, so
  // re-pointing this automatically restocks the old batch and draws down the new.
  const [editBatchId, setEditBatchId]         = useState("");
  const [editSaving, setEditSaving]           = useState(false);
  const [editError, setEditError]             = useState("");

  const [rows, setRows] = useState<ProductRow[]>([emptyRow()]);
  const [customer, setCustomer] = useState("");
  const [dispatchDateTime, setDispatchDateTime] = useState(nowLocalDateTime());
  const [reference, setReference] = useState("");
  const [dispatchedBy, setDispatchedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [goodsOutQuestions, setGoodsOutQuestions] = useState<Question[]>([]);
  const [complianceAnswers, setComplianceAnswers] = useState<Record<string, string>>({});

  useEffect(() => { if (orgId) load(); }, [orgId]);

  async function load() {
    // Fetch checklists first so we can filter submissions to production-only at the DB level
    const [{ data: clData }, { data: goChecklist }] = await Promise.all([
      supabase
        .from("checklists")
        .select("id, name, category")
        .eq("category", "Production")
        .eq("active", true)
        .order("name"),
      supabase
        .from("checklists")
        .select("id")
        .ilike("name", "%goods out%")
        .eq("active", true)
        .limit(1)
        .maybeSingle(),
    ]);
    if (clData) setProductChecklists(clData as Checklist[]);
    if (goChecklist?.id) {
      setGoodsOutChecklistId(goChecklist.id);
      const { data: qData } = await supabase
        .from("questions")
        .select("*")
        .eq("checklist_id", goChecklist.id)
        .order("order_index");
      if (qData) setGoodsOutQuestions(qData as Question[]);
    }

    // Use production checklist IDs to fetch only production submissions (no wasted limit)
    const productionChecklistIds = (clData ?? []).map(cl => cl.id);

    // Every one of these feeds the per-batch availability guard — an un-ranged
    // select stops at 1000 rows, and a missing dispatch/return/adjustment makes
    // the guard allow over-dispatching (or block valid stock). Paginate them all.
    const [dispData, subData, batchDispData, returnsData, adjData] = await Promise.all([
      fetchAll<Dispatch>((from, to) => supabase
        .from("dispatches")
        .select("*")
        .order("dispatch_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to)),
      productionChecklistIds.length > 0
        ? fetchAll<any>((from, to) => supabase
            .from("submissions")
            .select("id, submitted_by, submitted_at, checklist:checklists(name, category), answers(value, question:questions(type, label))")
            .in("checklist_id", productionChecklistIds)
            .order("submitted_at", { ascending: false })
            .range(from, to))
        : Promise.resolve([]),
      fetchAll<{ batch_submission_id: string | null; total_units: number | null }>((from, to) => supabase
        .from("dispatches")
        .select("batch_submission_id, total_units")
        .not("batch_submission_id", "is", null)
        .order("id")
        .range(from, to)),
      fetchAll<GoodsReturn>((from, to) => supabase
        .from("goods_returns")
        .select("*")
        .order("return_date", { ascending: false })
        .range(from, to)),
      fetchAll<{ batch_code: string | null; quantity: number | null; product: string }>((from, to) => supabase
        .from("finished_goods_adjustments")
        .select("batch_code, quantity, product")
        .not("batch_code", "is", null)
        .order("id")
        .range(from, to)),
    ]);

    setRecentDispatches(dispData);
    setBatchSubmissions(subData as unknown as (Submission & { checklist: Checklist })[]);

    const returns = returnsData as GoodsReturn[];
    setRecentReturns(returns);
    // Returned units per batch and per original dispatch
    const returnedByBatch: Record<string, number> = {};
    const returnedByDisp: Record<string, number> = {};
    for (const r of returns) {
      if (r.batch_submission_id) returnedByBatch[r.batch_submission_id] = (returnedByBatch[r.batch_submission_id] ?? 0) + (r.quantity ?? 0);
      if (r.dispatch_id) returnedByDisp[r.dispatch_id] = (returnedByDisp[r.dispatch_id] ?? 0) + (r.quantity ?? 0);
    }
    setReturnedByDispatch(returnedByDisp);

    // Net out per batch = dispatched − returned, so returned units become available again
    const dispatchedTotals: Record<string, number> = {};
    for (const d of batchDispData) {
      if (d.batch_submission_id) {
        dispatchedTotals[d.batch_submission_id] = (dispatchedTotals[d.batch_submission_id] ?? 0) + (d.total_units ?? 0);
      }
    }
    for (const [batchId, qty] of Object.entries(returnedByBatch)) {
      dispatchedTotals[batchId] = (dispatchedTotals[batchId] ?? 0) - qty;
    }
    setDispatchedPerBatch(dispatchedTotals);

    // Batch-tagged adjustments (samples, wastage, count corrections) are keyed by
    // batch CODE, but a code can span several production submissions (multi-run)
    // while dispatches link to a specific one. Distribute each code's total
    // adjustment across its submissions — taking sampled/wasted units off the runs
    // that still show stock first — so the code's available total matches Finished
    // Goods and no run keeps phantom stock that's really been removed.
    //
    // A batch code is only unique WITHIN a product (two products can reuse the same
    // code on the same day), so key everything by product + code — otherwise a
    // reconciliation lands on another product's run that happens to share the code.
    const key = (product: string, code: string) => `${product}\u0000${code}`;
    const subsByCode: Record<string, string[]> = {};
    const producedBySub: Record<string, number> = {};
    for (const s of (subData as any[])) {
      const { batchCode, totalJars } = batchSummary(s.answers ?? []);
      producedBySub[s.id] = totalJars;
      const product = (s.checklist?.name ?? "").replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim();
      if (batchCode && product) (subsByCode[key(product, batchCode)] ??= []).push(s.id);
    }
    const codeAdj: Record<string, number> = {};
    for (const a of adjData) {
      if (!a.batch_code || !a.product) continue;
      const k = key(a.product, a.batch_code);
      codeAdj[k] = (codeAdj[k] ?? 0) + (a.quantity ?? 0);
    }
    const adjBySub: Record<string, number> = {};
    for (const [code, adj] of Object.entries(codeAdj)) {
      const subIds = subsByCode[code];
      if (!subIds || subIds.length === 0) continue; // no matching run → stays product-level
      if (adj >= 0) { adjBySub[subIds[0]] = (adjBySub[subIds[0]] ?? 0) + adj; continue; }
      // Reduction: consume from the runs with the most stock left first.
      const ranked = subIds
        .map(id => ({ id, rem: (producedBySub[id] ?? 0) - (dispatchedTotals[id] ?? 0) }))
        .sort((x, y) => y.rem - x.rem);
      let need = -adj;
      for (const { id, rem } of ranked) {
        if (need <= 0) break;
        const take = Math.min(Math.max(0, rem), need);
        if (take > 0) { adjBySub[id] = (adjBySub[id] ?? 0) - take; need -= take; }
      }
      if (need > 0) adjBySub[ranked[0].id] = (adjBySub[ranked[0].id] ?? 0) - need; // over-sampled: pin remainder
    }
    setAdjustedPerBatch(adjBySub);

    setLoading(false);
  }

  function updateRow(idx: number, field: keyof ProductRow, value: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  function addRow() { setRows(prev => [...prev, emptyRow()]); }

  function removeRow(idx: number) {
    if (rows.length > 1) setRows(prev => prev.filter((_, i) => i !== idx));
  }

  function rowTotal(row: ProductRow) {
    return Number(row.casesOf6) * 6 + Number(row.casesOf3) * 3 + Number(row.singles);
  }

  const grandTotal = rows.reduce((s, r) => s + rowTotal(r), 0);

  // Units allocated to each batch in the current (unsaved) form rows
  const formAllocatedPerBatch = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const r of rows) {
      if (r.batchSubmissionId) {
        const units = Number(r.casesOf6) * 6 + Number(r.casesOf3) * 3 + Number(r.singles);
        totals[r.batchSubmissionId] = (totals[r.batchSubmissionId] ?? 0) + units;
      }
    }
    return totals;
  }, [rows]);

  // Units still available to dispatch from a batch for a given form row:
  // produced − already-dispatched(net of returns) − what OTHER rows allocate to it.
  // Returns null when we can't determine the batch's produced quantity (then no guard).
  function batchAvailableForRow(row: ProductRow): number | null {
    if (!row.batchSubmissionId) return null;
    const s = batchSubmissions.find(b => b.id === row.batchSubmissionId);
    if (!s) return null;
    const { totalJars } = batchSummary((s as any).answers ?? []);
    if (!(totalJars > 0)) return null;
    const alreadyDispatched = dispatchedPerBatch[row.batchSubmissionId] ?? 0;
    const otherRowsAlloc = (formAllocatedPerBatch[row.batchSubmissionId] ?? 0) - rowTotal(row);
    const adjusted = adjustedPerBatch[row.batchSubmissionId] ?? 0; // signed (samples are negative)
    return totalJars - alreadyDispatched - otherRowsAlloc + adjusted;
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!customer.trim()) errs.customer = "Required";
    if (!dispatchedBy.trim()) errs.dispatchedBy = "Required";
    rows.forEach((row, i) => {
      if (!row.product) errs[`product_${i}`] = "Required";
      if (rowTotal(row) <= 0) errs[`units_${i}`] = "Enter at least one unit";
      if (!row.batchSubmissionId) errs[`batch_${i}`] = "A batch record must be linked for traceability";
      // Hard block: never dispatch more than a batch produced. Over-dispatching
      // silently corrupts per-batch traceability and can't be reconstructed later.
      const available = batchAvailableForRow(row);
      if (available !== null && rowTotal(row) > available) {
        errs[`units_${i}`] = `Only ${Math.max(0, available).toLocaleString()} unit${available === 1 ? "" : "s"} left in this batch. If it really made more, correct the production record's units produced.`;
      }
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaved(false);
    setSaving(true);

    const dispatchDate = dispatchDateTime.slice(0, 10);
    const inserts = rows.map(row => ({
      dispatch_date: dispatchDate,
      product: row.product,
      customer,
      cases_of_6: Number(row.casesOf6) || 0,
      cases_of_3: Number(row.casesOf3) || 0,
      singles: Number(row.singles) || 0,
      total_units: rowTotal(row),
      reference: reference.trim() || null,
      dispatched_by: dispatchedBy.trim(),
      notes: notes.trim() || null,
      batch_submission_id: row.batchSubmissionId || null,
      organisation_id: orgId,
    }));

    const { error } = await supabase.from("dispatches").insert(inserts);
    setSaving(false);
    if (error) { alert("Failed to save — please try again."); return; }

    // Also create a Goods Out Record checklist submission for compliance sign-off
    if (goodsOutChecklistId) {
      try {
        const grandTotal = inserts.reduce((s, r) => s + r.total_units, 0);
        const itemLines = inserts.map((r, idx) => {
          const parts: string[] = [];
          if (r.cases_of_6) parts.push(`${r.cases_of_6}×6`);
          if (r.cases_of_3) parts.push(`${r.cases_of_3}×3`);
          if (r.singles) parts.push(`${r.singles} singles`);
          // Pull batch code + BBE from the linked production record
          const linkedSub = batchSubmissions.find(b => b.id === rows[idx]?.batchSubmissionId);
          const { batchCode, bbeDate } = linkedSub ? batchSummary((linkedSub as any).answers ?? []) : { batchCode: "", bbeDate: "" };
          const traceability = [batchCode && `Batch: ${batchCode}`, bbeDate && `BBE: ${bbeDate}`].filter(Boolean).join(" · ");
          return `  • ${r.product}: ${parts.join(", ")} (${r.total_units} units)${traceability ? ` — ${traceability}` : ""}`;
        });
        const batchNotes = [
          `Customer: ${customer.trim()}`,
          `Date & time dispatched: ${dispatchDateTime.replace("T", " ")}`,
          ...(reference.trim() ? [`Reference: ${reference.trim()}`] : []),
          `Products:`,
          ...itemLines,
          `Total: ${grandTotal} units`,
          ...(notes.trim() ? [`Notes: ${notes.trim()}`] : []),
        ].join("\n");

        // Upload any captured photos to storage first; if this throws, the
        // surrounding catch flags the compliance record as failed (the dispatch
        // itself is already saved).
        const uploaded = await uploadPhotoAnswers(goodsOutQuestions, complianceAnswers, goodsOutChecklistId);
        const answers = goodsOutQuestions.map(q => ({
          question_id: q.id,
          value: uploaded[q.id] ?? null,
        }));

        const compRes = await fetch("/api/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checklist_id: goodsOutChecklistId,
            organisation_id: orgId ?? null,
            submitted_by: dispatchedBy.trim(),
            answers,
            batch_notes: batchNotes,
          }),
        });
        if (!compRes.ok) {
          console.error("Failed to create goods-out submission:", await compRes.text());
          setComplianceWarning(true);
        }
      } catch (e) {
        console.error("Failed to create goods-out submission:", e);
        setComplianceWarning(true);
      }
    }

    setSaved(true);
    setRows([emptyRow()]);
    setCustomer("");
    setReference("");
    setNotes("");
    setComplianceAnswers({});
    setDispatchDateTime(nowLocalDateTime());
    setErrors({});
    await load();
  }

  // Units still out for a dispatch = dispatched − already returned (the cap on a new return)
  function returnableUnits(d: Dispatch) {
    return Math.max(0, (d.total_units ?? 0) - (returnedByDispatch[d.id] ?? 0));
  }

  function openRecordReturn(d: Dispatch) {
    setReturnDispatch(d);
    setReturnQty("");
    setReturnDate(new Date().toISOString().slice(0, 10));
    setReturnBy("");
    setReturnNotes("");
    setReturnError("");
  }

  async function saveReturn() {
    if (!returnDispatch) return;
    const cap = returnableUnits(returnDispatch);
    const qty = parseInt(returnQty, 10);
    if (isNaN(qty) || qty <= 0) { setReturnError("Enter how many units came back"); return; }
    if (qty > cap) { setReturnError(`Only ${cap} unit${cap !== 1 ? "s" : ""} from this dispatch can be returned`); return; }
    if (!returnBy.trim()) { setReturnError("Enter who logged this return"); return; }
    setReturnSaving(true);
    setReturnError("");
    const { error } = await supabase.from("goods_returns").insert({
      organisation_id: orgId,
      return_date: returnDate,
      product: returnDispatch.product,
      customer: returnDispatch.customer,
      quantity: qty,
      dispatch_id: returnDispatch.id,
      batch_submission_id: returnDispatch.batch_submission_id,
      returned_by: returnBy.trim(),
      notes: returnNotes.trim() || null,
    });
    setReturnSaving(false);
    if (error) { setReturnError(error.message); return; }
    setReturnDispatch(null);
    await load();
  }

  function openEditDispatch(d: Dispatch) {
    setEditingDispatch(d);
    setEditDate(d.dispatch_date);
    setEditProduct(d.product);
    setEditCustomer(d.customer);
    setEditCasesOf6(String(d.cases_of_6));
    setEditCasesOf3(String(d.cases_of_3));
    setEditSingles(String(d.singles));
    setEditRef(d.reference ?? "");
    setEditDispatchedBy(d.dispatched_by);
    setEditNotes(d.notes ?? "");
    setEditBatchId(d.batch_submission_id ?? "");
    setEditError("");
  }

  /** Production batches whose checklist matches a product name (same rule as the create form). */
  function batchesForProduct(product: string) {
    if (!product) return [];
    return batchSubmissions.filter(s => {
      const name = (s.checklist?.name ?? "").replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim();
      return name.toLowerCase() === product.toLowerCase();
    });
  }

  /**
   * Units a batch can still supply to the dispatch being edited: produced −
   * net dispatched (excluding this dispatch's own units when it's already
   * linked to that batch) + signed adjustments. null = no produced figure.
   */
  function editBatchRemaining(batchSubmissionId: string): number | null {
    const s = batchSubmissions.find(b => b.id === batchSubmissionId);
    if (!s) return null;
    const { totalJars } = batchSummary((s as any).answers ?? []);
    if (totalJars <= 0) return null;
    const ownUnits = editingDispatch?.batch_submission_id === batchSubmissionId
      ? (editingDispatch.total_units ?? 0)
      : 0;
    const netOthers = (dispatchedPerBatch[batchSubmissionId] ?? 0) - ownUnits;
    return totalJars - netOthers + (adjustedPerBatch[batchSubmissionId] ?? 0);
  }

  async function saveEditDispatch() {
    if (!editingDispatch) return;
    if (!editProduct.trim()) { setEditError("Product is required"); return; }
    if (!editCustomer.trim()) { setEditError("Customer is required"); return; }
    if (!editDispatchedBy.trim()) { setEditError("Dispatched by is required"); return; }
    const total = Number(editCasesOf6) * 6 + Number(editCasesOf3) * 3 + Number(editSingles);
    if (total <= 0) { setEditError("Enter at least one unit"); return; }
    // Hard block: editing must not push the (possibly newly selected) batch over
    // what it produced. Cap = produced − net dispatched excluding this dispatch's
    // own contribution + adjustments — see editBatchRemaining.
    if (editBatchId) {
      const cap = editBatchRemaining(editBatchId);
      if (cap !== null && total > cap) {
        setEditError(`Only ${Math.max(0, cap).toLocaleString()} unit${cap === 1 ? "" : "s"} left in this batch — can't set ${total.toLocaleString()}. If the batch made more, correct the production record's units produced.`);
        return;
      }
    }
    setEditSaving(true);
    const { error } = await supabase.from("dispatches").update({
      dispatch_date: editDate,
      product: editProduct.trim(),
      customer: editCustomer.trim(),
      cases_of_6: Number(editCasesOf6) || 0,
      cases_of_3: Number(editCasesOf3) || 0,
      singles: Number(editSingles) || 0,
      total_units: total,
      reference: editRef.trim() || null,
      dispatched_by: editDispatchedBy.trim(),
      notes: editNotes.trim() || null,
      batch_submission_id: editBatchId || null,
    }).eq("id", editingDispatch.id);
    if (error) { setEditSaving(false); setEditError(error.message); return; }

    // Returns carry a copy of the dispatch's batch link (they credit units back
    // to that batch). If the batch changed, move this dispatch's returns with it
    // — otherwise the old batch keeps phantom returned stock.
    if ((editBatchId || null) !== (editingDispatch.batch_submission_id ?? null)) {
      const { error: retErr } = await supabase
        .from("goods_returns")
        .update({ batch_submission_id: editBatchId || null })
        .eq("dispatch_id", editingDispatch.id);
      if (retErr) {
        setEditSaving(false);
        setEditError("Dispatch updated, but its returns couldn't be re-linked to the new batch: " + retErr.message);
        await load();
        return;
      }
    }

    setEditSaving(false);
    setEditingDispatch(null);
    await load();
  }

  return (
    <>
      <div className="flex flex-1 min-h-0">
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:mr-80">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold text-gray-900">Goods Out</h1>
          </div>
          <Link href="/compliance/traceability" className="btn-secondary text-sm">Traceability</Link>
        </div>
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Log dispatch</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Shared fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Customer *</label>
                <input
                  type="text"
                  value={customer}
                  onChange={e => setCustomer(e.target.value)}
                  className={`input ${errors.customer ? "border-red-300" : ""}`}
                  placeholder="e.g. Amazon, Ocado, Farm shop…"
                />
                {errors.customer && <p className="mt-1 text-xs text-red-600">{errors.customer}</p>}
              </div>
              <div>
                <label className="label">Date &amp; time dispatched *</label>
                <input type="datetime-local" value={dispatchDateTime} onChange={e => setDispatchDateTime(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">Order reference</label>
                <input type="text" value={reference} onChange={e => setReference(e.target.value)} className="input" placeholder="Optional" />
              </div>
              <div>
                <label className="label">Dispatched by *</label>
                <input
                  type="text"
                  value={dispatchedBy}
                  onChange={e => setDispatchedBy(e.target.value)}
                  className={`input ${errors.dispatchedBy ? "border-red-300" : ""}`}
                  placeholder="e.g. Kernel Mustard"
                  autoComplete="name"
                />
                {errors.dispatchedBy && <p className="mt-1 text-xs text-red-600">{errors.dispatchedBy}</p>}
              </div>
            </div>

            {/* Product cards */}
            <div className="space-y-3">
              {rows.map((row, idx) => {
                const total = rowTotal(row);

                // All batches for this product.
                // Strip "— Production Record" suffix before comparing (same logic as dropdown)
                const productBatches = batchSubmissions.filter(s => {
                  if (!row.product) return false;
                  const name = (s.checklist?.name ?? "").replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim();
                  return name.toLowerCase() === row.product.toLowerCase();
                });

                return (
                  <div key={idx} className="rounded-xl border border-gray-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Product {idx + 1}
                      </p>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="text-xs text-gray-400 hover:text-red-500 transition"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Product */}
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 block mb-0.5">Product *</label>
                        <select
                          value={row.product}
                          onChange={e => updateRow(idx, "product", e.target.value)}
                          className={`input text-sm py-1.5 ${errors[`product_${idx}`] ? "border-red-300" : ""}`}
                        >
                          <option value="">Select product…</option>
                          {productChecklists.map(cl => {
                            const name = cl.name.replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim();
                            return <option key={cl.id} value={name}>{name}</option>;
                          })}
                        </select>
                        {errors[`product_${idx}`] && <p className="mt-0.5 text-xs text-red-500">{errors[`product_${idx}`]}</p>}
                      </div>

                      {/* Cases of 6 */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Cases of 6</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={row.casesOf6}
                          onChange={e => updateRow(idx, "casesOf6", e.target.value.replace(/[^0-9]/g, ""))}
                          className="input text-sm py-1.5"
                        />
                      </div>

                      {/* Cases of 3 */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Cases of 3</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={row.casesOf3}
                          onChange={e => updateRow(idx, "casesOf3", e.target.value.replace(/[^0-9]/g, ""))}
                          className="input text-sm py-1.5"
                        />
                      </div>

                      {/* Singles */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Singles</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={row.singles}
                          onChange={e => updateRow(idx, "singles", e.target.value.replace(/[^0-9]/g, ""))}
                          className="input text-sm py-1.5"
                        />
                      </div>

                      {/* Total */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Total units</label>
                        <div className={`input text-sm py-1.5 bg-gray-50 font-bold tabular-nums ${total > 0 ? "text-gray-900" : "text-gray-300"}`}>
                          {total}
                        </div>
                        {errors[`units_${idx}`] && <p className="mt-0.5 text-xs text-red-500">{errors[`units_${idx}`]}</p>}
                      </div>

                      {/* Batch record */}
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 block mb-0.5">Batch record (traceability) *</label>
                        <select
                          value={row.batchSubmissionId}
                          onChange={e => updateRow(idx, "batchSubmissionId", e.target.value)}
                          className={`input text-sm py-1.5 ${errors[`batch_${idx}`] ? "border-red-300" : ""}`}
                          disabled={!row.product}
                        >
                          <option value="">Select batch…</option>
                          {productBatches.map(s => {
                            const { batchCode, totalJars } = batchSummary((s as any).answers ?? []);
                            const alreadyDispatched = dispatchedPerBatch[s.id] ?? 0;
                            const thisRowAlloc = row.batchSubmissionId === s.id ? total : 0;
                            const otherRowsAlloc = (formAllocatedPerBatch[s.id] ?? 0) - thisRowAlloc;
                            const adjusted = adjustedPerBatch[s.id] ?? 0; // signed; samples/wastage reduce
                            const remaining = totalJars > 0 ? totalJars - alreadyDispatched - otherRowsAlloc + adjusted : null;
                            // Hide fully-dispatched batches (0 or negative remaining), unless
                            // this row already has it selected — so the selection never vanishes.
                            const isSelected = row.batchSubmissionId === s.id;
                            if (remaining !== null && remaining <= 0 && !isSelected) return null;
                            const label = [
                              batchCode ? `Batch ${batchCode}` : formatDate(s.submitted_at.slice(0, 10)),
                              remaining !== null ? `${remaining.toLocaleString()} remaining` : null,
                            ].filter(Boolean).join(" · ");
                            return (
                              <option key={s.id} value={s.id}>
                                {label}
                              </option>
                            );
                          })}
                        </select>
                        {errors[`batch_${idx}`] && (
                          <p className="mt-1 text-xs text-red-600">{errors[`batch_${idx}`]}</p>
                        )}
                        {row.batchSubmissionId && (() => {
                          const s = batchSubmissions.find(b => b.id === row.batchSubmissionId);
                          if (!s) return null;
                          const { batchCode, bbeDate } = batchSummary((s as any).answers ?? []);
                          // Available for THIS row (excludes this row's own allocation).
                          // over = how much this row exceeds what the batch has left.
                          const available = batchAvailableForRow(row);
                          const over = available !== null ? total - available : 0;
                          return (
                            <>
                              {(batchCode || bbeDate) && (
                                <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                                  {batchCode && <span><span className="font-medium text-gray-500">Batch:</span> {batchCode}</span>}
                                  {bbeDate && <span><span className="font-medium text-gray-500">BBE:</span> {bbeDate}</span>}
                                </div>
                              )}
                              {over > 0 && (
                                <p className="mt-1 text-xs text-red-600 font-medium">
                                  Over-allocated by {over.toLocaleString()} unit{over === 1 ? "" : "s"} — only {Math.max(0, available!).toLocaleString()} left in this batch. Pick the correct batch, or split across batches.
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={addRow}
                className="w-full rounded-xl border-2 border-dashed border-gray-200 py-2.5 text-sm text-gray-500 hover:border-brand hover:text-brown transition"
              >
                + Add another product
              </button>
            </div>

            {/* Dispatch checks */}
            {goodsOutQuestions.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 border-t border-gray-100 pt-4">Dispatch checks</h3>
                {goodsOutQuestions.map(q => (
                  <div key={q.id}>
                    <label className="text-xs text-gray-600 block mb-1 font-medium">
                      {q.label}
                      {q.required && <span className="text-red-400 ml-0.5">*</span>}
                    </label>
                    {q.hint && <p className="text-xs text-gray-400 mb-1">{q.hint}</p>}
                    {renderComplianceField(
                      q,
                      complianceAnswers[q.id] ?? "",
                      v => setComplianceAnswers(prev => ({ ...prev, [q.id]: v })),
                    )}
                  </div>
                ))}
              </div>
            )}

            {grandTotal > 0 && (
              <p className="text-sm text-gray-600">
                Total dispatch: <span className="font-bold text-gray-900">{grandTotal} units</span>
              </p>
            )}

            <div>
              <label className="label">Notes</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className="input" placeholder="Optional" />
            </div>

            {complianceWarning && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                <p className="font-semibold mb-0.5">Dispatch saved — compliance record failed</p>
                <p className="text-xs text-amber-700">
                  Your dispatch was logged successfully, but the compliance checklist entry could not be created automatically.
                  Please go to <strong>Checklist Submissions</strong> and create a Goods Out record manually, or contact support.
                </p>
                <button
                  type="button"
                  onClick={() => setComplianceWarning(false)}
                  className="mt-2 text-xs underline text-amber-700 hover:text-amber-900"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <SaveButton type="submit" saving={saving} saved={saved} savedLabel="Dispatch saved">
                {`Log dispatch (${rows.length} product${rows.length !== 1 ? "s" : ""})`}
              </SaveButton>
            </div>
          </form>
        </div>

      </div>
      </main>

      {/* Right panel — recent dispatches */}
      <aside className="hidden lg:flex flex-col w-80 fixed top-0 right-0 z-30 h-screen border-l border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 shrink-0 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Recent dispatches</h2>
          <input
            type="text"
            placeholder="Search product or customer…"
            value={panelSearch}
            onChange={e => setPanelSearch(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <div className="flex gap-1">
            {([["week", "This Week"], ["month", "This Month"], ["all", "All time"]] as const).map(([p, label]) => (
              <button key={p} onClick={() => setPanelPeriod(p)}
                className={`flex-1 px-2 py-1.5 rounded text-xs font-medium border transition-colors ${panelPeriod === p ? "bg-brand border-brand/50 text-brown" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {loading ? (
            <div className="p-4 text-sm text-gray-400 text-center">Loading…</div>
          ) : recentDispatches.length === 0 ? (
            <div className="p-4 text-sm text-gray-400 text-center">No dispatches yet.</div>
          ) : recentDispatches.filter(d => {
              // A search spans all time so dispatches from months ago are findable
              // (e.g. to log a late return); otherwise honour the period window.
              if (!panelSearch && panelPeriod !== "all") {
                const now = new Date();
                const dDate = new Date(d.dispatch_date);
                if (panelPeriod === "week") {
                  const daysFromMon = now.getDay() === 0 ? 6 : now.getDay() - 1;
                  const weekStart = new Date(now); weekStart.setDate(now.getDate() - daysFromMon); weekStart.setHours(0,0,0,0);
                  if (dDate < weekStart) return false;
                } else {
                  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                  if (dDate < monthStart) return false;
                }
              }
              return !panelSearch ||
                d.product?.toLowerCase().includes(panelSearch.toLowerCase()) ||
                d.customer?.toLowerCase().includes(panelSearch.toLowerCase());
            }).map(d => (
            <div key={d.id} className="px-4 py-3 hover:bg-gray-50 transition">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{d.product}</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{d.customer}</p>
                  <p className="text-xs text-gray-400">
                    {[d.cases_of_6 && `${d.cases_of_6}×6`, d.cases_of_3 && `${d.cases_of_3}×3`, d.singles && `${d.singles} singles`].filter(Boolean).join(" · ")}
                  </p>
                  {d.reference && <p className="text-xs text-gray-400 font-mono">{d.reference}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-bold tabular-nums text-gray-900">{d.total_units}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(d.dispatch_date)}</p>
                  {(returnedByDispatch[d.id] ?? 0) > 0 && (
                    <p className="text-xs text-amber-600 font-medium mt-0.5">{returnedByDispatch[d.id]} returned</p>
                  )}
                  <div className="flex items-center justify-end gap-2 mt-1">
                    <button onClick={() => openEditDispatch(d)} className="text-xs text-brown/60 hover:text-brown hover:underline">Edit</button>
                    {returnableUnits(d) > 0 && (
                      <button onClick={() => openRecordReturn(d)} className="text-xs text-brown/60 hover:text-brown hover:underline">Return</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>
      </div>

      {/* Edit dispatch panel */}
      {editingDispatch && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/30" onClick={() => setEditingDispatch(null)} />
          <div className="w-full max-w-sm bg-white shadow-xl flex flex-col">
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Edit dispatch</h2>
              <button onClick={() => setEditingDispatch(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Product</label>
                  <select
                    className="input w-full"
                    value={editProduct}
                    onChange={e => {
                      setEditProduct(e.target.value);
                      // A batch belongs to one product — changing product invalidates the link
                      setEditBatchId("");
                    }}
                  >
                    <option value="">Select product…</option>
                    {productChecklists.map(cl => {
                      const name = cl.name.replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim();
                      return <option key={cl.id} value={name}>{name}</option>;
                    })}
                    {/* Keep a legacy/off-list name selectable so older records aren't silently lost */}
                    {editProduct && !productChecklists.some(cl => cl.name.replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim() === editProduct) && (
                      <option value={editProduct}>{editProduct} (not in product list)</option>
                    )}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Batch record (traceability)</label>
                  <select
                    className="input w-full"
                    value={editBatchId}
                    onChange={e => setEditBatchId(e.target.value)}
                    disabled={!editProduct}
                  >
                    <option value="">No batch linked</option>
                    {batchesForProduct(editProduct).map(s => {
                      const { batchCode } = batchSummary((s as any).answers ?? []);
                      const remaining = editBatchRemaining(s.id);
                      const isSelected = editBatchId === s.id;
                      // Hide fully-dispatched batches unless already selected
                      if (remaining !== null && remaining <= 0 && !isSelected) return null;
                      const label = [
                        batchCode ? `Batch ${batchCode}` : formatDate(s.submitted_at.slice(0, 10)),
                        remaining !== null ? `${remaining.toLocaleString()} remaining` : null,
                      ].filter(Boolean).join(" · ");
                      return <option key={s.id} value={s.id}>{label}</option>;
                    })}
                    {/* Keep a link to a batch of another product visible (mis-link being corrected) */}
                    {editBatchId && !batchesForProduct(editProduct).some(s => s.id === editBatchId) && (() => {
                      const s = batchSubmissions.find(b => b.id === editBatchId);
                      const { batchCode } = s ? batchSummary((s as any).answers ?? []) : { batchCode: "" };
                      return <option value={editBatchId}>{batchCode ? `Batch ${batchCode}` : "Current batch"} (different product)</option>;
                    })()}
                  </select>
                  {editingDispatch.batch_submission_id && editBatchId !== editingDispatch.batch_submission_id && (
                    <p className="mt-1 text-xs text-amber-700">
                      The {editingDispatch.total_units} unit{editingDispatch.total_units === 1 ? "" : "s"} will be restocked to the previous batch and drawn from the one selected here.
                    </p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Customer</label>
                  <input type="text" className="input w-full" value={editCustomer} onChange={e => setEditCustomer(e.target.value)} />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Dispatch date</label>
                  <input type="date" className="input w-full max-w-full" value={editDate} onChange={e => setEditDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Dispatched by</label>
                  <input type="text" className="input w-full" value={editDispatchedBy} onChange={e => setEditDispatchedBy(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Quantities</label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Cases ×6</label>
                    <input type="number" min="0" className="input w-full" value={editCasesOf6} onChange={e => setEditCasesOf6(e.target.value)} inputMode="numeric" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Cases ×3</label>
                    <input type="number" min="0" className="input w-full" value={editCasesOf3} onChange={e => setEditCasesOf3(e.target.value)} inputMode="numeric" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Singles</label>
                    <input type="number" min="0" className="input w-full" value={editSingles} onChange={e => setEditSingles(e.target.value)} inputMode="numeric" />
                  </div>
                </div>
                {(() => {
                  const t = Number(editCasesOf6) * 6 + Number(editCasesOf3) * 3 + Number(editSingles);
                  return t > 0 ? <p className="mt-1.5 text-xs text-gray-500">Total: <span className="font-semibold text-gray-900">{t} units</span></p> : null;
                })()}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Order reference</label>
                <input type="text" className="input w-full" value={editRef} onChange={e => setEditRef(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <input type="text" className="input w-full" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            {editError && (
              <div className="mx-6 mb-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {editError}
              </div>
            )}

            <div className="border-t border-gray-200 px-6 pt-3 pb-3 flex gap-3">
              <button onClick={() => setEditingDispatch(null)} className="btn-ghost flex-1">Cancel</button>
              <SaveButton onClick={saveEditDispatch} saving={editSaving} className="btn-primary flex-1">
                Save changes
              </SaveButton>
            </div>
          </div>
        </div>
      )}

      {/* Record return panel */}
      {returnDispatch && (() => {
        const cap = returnableUnits(returnDispatch);
        return (
          <div className="fixed inset-0 z-40 flex">
            <div className="flex-1 bg-black/30" onClick={() => setReturnDispatch(null)} />
            <div className="w-full max-w-sm bg-white shadow-xl flex flex-col">
              <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Record return</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{returnDispatch.product} · {returnDispatch.customer}</p>
                </div>
                <button onClick={() => setReturnDispatch(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                  <p className="text-xs text-amber-700 font-medium">Dispatched on {formatDate(returnDispatch.dispatch_date)}</p>
                  <p className="text-lg font-bold text-amber-900 mt-0.5">{cap} unit{cap !== 1 ? "s" : ""} available to return</p>
                  <p className="text-xs text-amber-600 mt-0.5">Resale-fit returns go back into stock against this batch and can be dispatched again.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Units returned</label>
                    <input type="number" min="1" max={cap} step="1" className="input w-full" placeholder="0" value={returnQty} onChange={e => setReturnQty(e.target.value)} inputMode="numeric" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Return date</label>
                    <input type="date" className="input w-full max-w-full" value={returnDate} onChange={e => setReturnDate(e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Logged by</label>
                  <input type="text" className="input w-full" placeholder="e.g. Head of Popping" value={returnBy} onChange={e => setReturnBy(e.target.value)} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
                  <textarea className="input w-full" rows={2} placeholder="e.g. Wholesaler over-ordered, seals intact" value={returnNotes} onChange={e => setReturnNotes(e.target.value)} />
                </div>
              </div>

              {returnError && (
                <div className="mx-6 mb-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{returnError}</div>
              )}

              <div className="border-t border-gray-200 px-6 pt-3 pb-3 flex gap-3">
                <button onClick={() => setReturnDispatch(null)} className="btn-ghost flex-1">Cancel</button>
                <SaveButton onClick={saveReturn} saving={returnSaving} disabled={returnQty === ""} className="btn-primary flex-1">
                  Record return
                </SaveButton>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
