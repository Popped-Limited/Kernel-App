"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Checklist, Question, IngredientLot } from "@/lib/types";
import QuestionField from "@/components/QuestionField";
import { frequencyLabel } from "@/lib/utils";

type AnswerMap = Record<string, string>;

type LotWithIngredient = IngredientLot & { ingredient: { name: string; density_g_per_l: number | null } };

/**
 * Build ingredientLots + densityByName maps from raw lots, subtracting any quantities
 * already reserved by active batch drafts (excluding excludeDraftId — the current user's draft).
 * This prevents two simultaneous batches from claiming the same stock.
 */
function buildIngredientMaps(
  lots: LotWithIngredient[],
  allDrafts: BatchDraft[],
  excludeDraftId: string | null,
): { byName: Record<string, IngredientLot[]>; density: Record<string, number> } {
  // Sum up reservations per lot_id across all other active drafts
  const reservations: Record<string, number> = {};
  for (const draft of allDrafts) {
    if (draft.id === excludeDraftId) continue;
    for (const val of Object.values(draft.answers ?? {})) {
      if (typeof val !== "string") continue;
      try {
        const parsed = JSON.parse(val);
        const rows = Array.isArray(parsed) ? parsed : (parsed?.rows ?? []);
        if (!Array.isArray(rows) || rows.length === 0) continue;
        for (const row of rows) {
          for (const lot of (row.lots ?? [])) {
            if (lot.lot_id && Number(lot.weight_g) > 0) {
              reservations[lot.lot_id] = (reservations[lot.lot_id] || 0) + Number(lot.weight_g);
            }
          }
        }
      } catch { /* not ingredient_table format — skip */ }
    }
  }

  const byName: Record<string, IngredientLot[]> = {};
  const density: Record<string, number> = {};
  for (const lot of lots) {
    const name = lot.ingredient?.name ?? "";
    const reserved = reservations[lot.id] || 0;
    const adjustedQty = Math.max(0, lot.quantity_remaining_g - reserved);
    // Skip lots fully consumed by other drafts — no point offering them
    if (adjustedQty === 0 && reserved > 0) continue;
    const adjustedLot: IngredientLot = { ...lot, quantity_remaining_g: adjustedQty };
    if (!byName[name]) byName[name] = [];
    byName[name].push(adjustedLot);
    if (lot.ingredient?.density_g_per_l != null) density[name] = lot.ingredient.density_g_per_l;
  }
  return { byName, density };
}

interface BatchDraft {
  id: string;
  checklist_id: string;
  started_by: string;
  started_at?: string | null;
  last_saved_at: string;
  answers: AnswerMap;
  team_member_id?: string | null;
}

function isFieldFilled(q: Question, val: string): boolean {
  if (!val) return false;
  if (q.type === "checkbox") return val === "true";
  if (q.type === "multi_number") {
    try {
      const arr = JSON.parse(val) as string[];
      return arr.every(v => v !== "" && !isNaN(Number(v)));
    } catch { return false; }
  }
  if (q.type === "ingredient_table") {
    try {
      const parsed = JSON.parse(val);
      const rows = (Array.isArray(parsed) ? parsed : (parsed?.rows ?? [])) as Array<{ lots: Array<{ lot_id?: string; julian_code: string; weight_g: string }> }>;
      return rows.length > 0 && rows.every((r) =>
        r.lots?.length > 0 && r.lots.every((l) => (l.lot_id || l.julian_code)?.trim() && l.weight_g?.trim())
      );
    } catch { return false; }
  }
  if (q.type === "packing_runs") {
    try {
      const runs = JSON.parse(val) as Array<{ pack_weight: string; jars_used: string }>;
      return runs.some((r) => r.pack_weight?.trim() && r.jars_used?.trim());
    } catch { return false; }
  }
  return val !== "false" && val !== "[]" && val.trim() !== "";
}

function ChecklistPageInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Employee Induction Record, opened from the training portal for a specific
  // person. Drafts + submission are scoped to this team member.
  const memberId = searchParams.get("member");
  const isInduction = !!memberId;

  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  // The logged-in user's display name — used when the checklist has no
  // name question (or it was left blank), instead of a generic "Staff"
  const [userName, setUserName] = useState("");
  // Ref mirrors state so getSubmittedBy always reads the latest value even
  // before a re-render (avoids stale-closure "Staff" on fast submissions)
  const userNameRef = useRef("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const metaName = (user.user_metadata?.full_name as string | undefined)?.trim();
      const name = metaName || (user.email?.split("@")[0] ?? "");
      userNameRef.current = name;
      setUserName(name);
    });
  }, []);

  // Derive submitted_by from a name-like answer in the checklist.
  // Matches common "who filled this in" labels: "Reported by", "Checked by",
  // "Your name", "Operator", etc. Falls back to the logged-in user's name.
  function getSubmittedBy(qs: Question[], ans: AnswerMap): string {
    const nameQ = qs.find(q =>
      q.type === "text" && (
        /\b(your name|full name|visitor name|staff name|employee name|operator|packer name|team member)\b/i.test(q.label) ||
        /\b(reported|inspected|checked|logged|completed|submitted|packed|carried out|filled in|prepared|signed)\s+by\b/i.test(q.label)
      )
    );
    if (nameQ && ans[nameQ.id]?.trim()) return ans[nameQ.id].trim();
    return userNameRef.current || userName || "Staff";
  }

  // Ingredient lots for production checklists (ingredient name → lots)
  const [ingredientLots, setIngredientLots] = useState<Record<string, IngredientLot[]>>({});
  const [densityByName, setDensityByName] = useState<Record<string, number>>({});

  // Batch notes (Production checklists only)
  const [batchNotes, setBatchNotes] = useState("");

  // Draft save state (Production checklists only)
  // All in-progress batches for THIS product, newest first — the user picks which to resume
  const [existingDrafts, setExistingDrafts] = useState<BatchDraft[]>([]);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved">("idle");
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftIdRef = useRef<string | null>(null);
  // Raw lot data + all active drafts — kept in refs so reservation maps can be recomputed
  // without re-fetching from Supabase (e.g. when the user resumes/discards a draft)
  const rawLotsRef = useRef<LotWithIngredient[]>([]);
  const allDraftsRef = useRef<BatchDraft[]>([]);
  // Tracks which fields have been edited locally since the last successful save.
  // Used during real-time merges to prevent another device's update from overwriting
  // something the current user is actively typing.
  const dirtyFieldsRef = useRef<Set<string>>(new Set());

  const isProduction = checklist?.category === "Production";
  // Both production records and inductions auto-save as a draft and submit a
  // record; only production has the ingredient/lot + batch-failed machinery.
  const isDraftable = isProduction || isInduction;

  useEffect(() => {
    async function load() {
      const [clRes, qRes] = await Promise.all([
        supabase.from("checklists").select("*").eq("id", id).single(),
        supabase.from("questions").select("*").eq("checklist_id", id).order("order_index"),
      ]);
      if (clRes.data) setChecklist(clRes.data);
      if (qRes.data) setQuestions(qRes.data);

      // Pre-fill the "products / batches affected" field when arriving from a
      // failed batch (Batch Failed → Corrective Action Report).
      const affected = searchParams.get("affected");
      if (affected && qRes.data) {
        const target = qRes.data.find(
          q => q.type === "text" && /(products?|batch(es)?)\b.*affect/i.test(q.label)
        );
        if (target) setAnswers(prev => ({ ...prev, [target.id]: affected }));
      }

      // For production checklists: fetch ingredient lots + ALL active drafts in parallel.
      // Drafts serve two purposes: (1) resume-prompt detection, (2) lot-reservation display.
      if (clRes.data?.category === "Production") {
        const [{ data: lots }, { data: allDrafts }] = await Promise.all([
          supabase
            .from("ingredient_lots")
            .select("*, ingredient:ingredients(name, density_g_per_l)")
            .gt("quantity_remaining_g", 0)
            .order("julian_code"),
          supabase
            .from("batch_drafts")
            .select("id, checklist_id, started_by, started_at, last_saved_at, answers")
            .order("last_saved_at", { ascending: false }),
        ]);

        if (lots) {
          rawLotsRef.current  = lots as LotWithIngredient[];
          allDraftsRef.current = (allDrafts ?? []) as BatchDraft[];
          // No current draft yet at load time — subtract ALL draft reservations
          const { byName, density } = buildIngredientMaps(rawLotsRef.current, allDraftsRef.current, null);
          setIngredientLots(byName);
          setDensityByName(density);
        }

        // Gather ALL in-progress batches for THIS product (newest first) so the user
        // can pick which one to resume rather than only seeing the most recent.
        const thisChecklistDrafts = (allDrafts ?? [])
          .filter(d => d.checklist_id === id)
          .sort((a, b) => new Date(b.last_saved_at).getTime() - new Date(a.last_saved_at).getTime());
        if (thisChecklistDrafts.length > 0) {
          setExistingDrafts(thisChecklistDrafts as BatchDraft[]);
          setShowResumePrompt(true);
        }
      }

      // Employee Induction Record: exactly one draft per (checklist, member).
      // Resume it silently if present (no resume prompt) — otherwise pre-fill the
      // employee's name + role from their staff record. The matrix already
      // decided begin vs continue, so we never block with a chooser here.
      if (memberId) {
        const { data: memberDraft } = await supabase
          .from("batch_drafts")
          .select("id, checklist_id, started_by, started_at, last_saved_at, answers, team_member_id")
          .eq("checklist_id", id)
          .eq("team_member_id", memberId)
          .order("last_saved_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (memberDraft) {
          setDraftId(memberDraft.id);
          draftIdRef.current = memberDraft.id;
          const questionAnswers = { ...(memberDraft.answers ?? {}) } as AnswerMap;
          delete questionAnswers.__batch_notes__;
          setAnswers(questionAnswers);
        } else if (qRes.data) {
          const { data: member } = await supabase
            .from("team_members")
            .select("name, position")
            .eq("id", memberId)
            .maybeSingle();
          if (member) {
            const prefill: AnswerMap = {};
            const nameQ = qRes.data.find(q => q.type === "text" && /\b(employee name|full name|staff name|your name)\b/i.test(q.label));
            const roleQ = qRes.data.find(q => q.type === "text" && /\b(job title|role|position)\b/i.test(q.label));
            if (nameQ && member.name) prefill[nameQ.id] = member.name;
            if (roleQ && member.position) prefill[roleQ.id] = member.position;
            if (Object.keys(prefill).length > 0) setAnswers(prev => ({ ...prefill, ...prev }));
          }
        }
      }

      setLoading(false);
    }
    load();
  }, [id]);

  // Keep draftIdRef in sync so the save closure always has the current id
  useEffect(() => { draftIdRef.current = draftId; }, [draftId]);

  // Poll for draft changes from other active production runs every 10 seconds so
  // lot availability stays accurate when multiple batches are running simultaneously.
  useEffect(() => {
    if (!isProduction) return;

    const refreshDraftReservations = async () => {
      if (rawLotsRef.current.length === 0) return; // lots not loaded yet
      const { data: freshDrafts } = await supabase
        .from("batch_drafts")
        .select("id, checklist_id, started_by, started_at, last_saved_at, answers");
      if (freshDrafts) {
        allDraftsRef.current = freshDrafts as BatchDraft[];
        const { byName, density } = buildIngredientMaps(
          rawLotsRef.current,
          allDraftsRef.current,
          draftIdRef.current, // always exclude the current user's own draft
        );
        setIngredientLots(byName);
        setDensityByName(density);
      }
    };

    const interval = setInterval(refreshDraftReservations, 10_000);
    return () => clearInterval(interval);
  }, [isProduction]);

  // Real-time collaboration: subscribe to changes on the shared draft so that edits
  // made on another device appear immediately. Dirty fields (typed but not yet saved)
  // are always preserved — the remote update only fills in fields the local user hasn't touched.
  useEffect(() => {
    if (!isProduction || !draftId) return;

    const channel = supabase
      .channel(`draft-collab-${draftId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "batch_drafts", filter: `id=eq.${draftId}` },
        (payload) => {
          const incoming = (payload.new as { answers: AnswerMap }).answers ?? {};
          const { __batch_notes__: incomingNotes, ...incomingQAnswers } = incoming;

          setAnswers((prev) => {
            const merged = { ...incomingQAnswers };
            // Keep any field the current user has edited since their last save
            for (const field of dirtyFieldsRef.current) {
              if (field !== "__batch_notes__" && prev[field] !== undefined) {
                merged[field] = prev[field];
              }
            }
            return merged;
          });

          if (!dirtyFieldsRef.current.has("__batch_notes__")) {
            setBatchNotes(incomingNotes ?? "");
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [draftId, isProduction]);

  const scheduleDraftSave = useCallback((newAnswers: AnswerMap, by: string) => {
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    setDraftStatus("saving");
    draftSaveTimer.current = setTimeout(async () => {
      let currentId = draftIdRef.current;
      if (!currentId) {
        currentId = crypto.randomUUID();
        setDraftId(currentId);
        draftIdRef.current = currentId;
      }
      await supabase.from("batch_drafts").upsert({
        id: currentId,
        checklist_id: id,
        organisation_id: checklist?.organisation_id ?? null,
        // Only inductions carry a team member — omit the column entirely for
        // production so those drafts never depend on the column existing.
        ...(memberId ? { team_member_id: memberId } : {}),
        started_by: by || "Unknown",
        last_saved_at: new Date().toISOString(),
        answers: newAnswers,
      });
      dirtyFieldsRef.current.clear(); // local edits are now persisted — safe to accept remote updates
      setDraftStatus("saved");
    }, 2000);
  }, [id, memberId, checklist?.organisation_id]);

  function handleAnswerChange(questionId: string, val: string) {
    dirtyFieldsRef.current.add(questionId);
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: val };
      if (isDraftable && !showResumePrompt) {
        // Persist batch notes alongside question answers so the whole form survives draft save/resume
        const draftAnswers = batchNotes.trim() ? { ...next, __batch_notes__: batchNotes } : next;
        scheduleDraftSave(draftAnswers, getSubmittedBy(questions, next));
      }
      return next;
    });
    if (errors[questionId]) setErrors((prev) => { const e = { ...prev }; delete e[questionId]; return e; });
  }

  function resumeDraft(draft: BatchDraft) {
    setDraftId(draft.id);
    draftIdRef.current = draft.id;
    // Extract batch notes from the saved answers map, then keep only real question answers
    const { __batch_notes__: savedNotes, ...questionAnswers } = draft.answers ?? {};
    setAnswers(questionAnswers as AnswerMap);
    if (savedNotes) setBatchNotes(savedNotes);
    setShowResumePrompt(false);
    // Recompute lot availability excluding THIS draft's own reservations so the
    // user doesn't see their already-reserved quantities subtracted twice
    if (rawLotsRef.current.length > 0) {
      const { byName, density } = buildIngredientMaps(rawLotsRef.current, allDraftsRef.current, draft.id);
      setIngredientLots(byName);
      setDensityByName(density);
    }
  }

  // Start a brand-new batch. This NEVER touches existing in-progress batches —
  // they stay saved and reservable. A new draft id is created on first edit.
  function startNewBatch() {
    setShowResumePrompt(false);
    setBatchNotes("");
    setAnswers({});
  }

  // Progress calculation for production checklists
  function calcProgress() {
    const required = questions.filter((q) => q.required);
    const filledCount = required.filter((q) => isFieldFilled(q, answers[q.id] ?? "")).length;
    return { filled: filledCount, total: required.length };
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    for (const q of questions) {
      if (!q.required) continue;
      const val = answers[q.id] ?? "";
      if (q.type === "ingredient_table") {
        try {
          const parsed = JSON.parse(val);
          const rows = (Array.isArray(parsed) ? parsed : (parsed?.rows ?? [])) as Array<{ lots: Array<{ lot_id?: string; julian_code: string; weight_g: string }> }>;
          const allFilled = rows.every((r) =>
            r.lots?.length > 0 && r.lots.every((l) => (l.lot_id || l.julian_code)?.trim() && l.weight_g?.trim())
          );
          if (!allFilled) errs[q.id] = "Please fill in a Julian code and weight for all ingredients";
        } catch { errs[q.id] = "Please complete the ingredient table"; }
      } else if (q.type === "packing_runs") {
        try {
          const runs = JSON.parse(val) as Array<{ pack_weight: string; jars_used: string }>;
          if (!runs.some((r) => r.pack_weight?.trim() && r.jars_used?.trim())) {
            errs[q.id] = "Please complete at least one packing run";
          }
        } catch { errs[q.id] = "Please complete the packing log"; }
      } else if (q.type === "multi_number") {
        try {
          const arr = JSON.parse(val) as string[];
          if (!arr.every(v => v !== "" && !isNaN(Number(v)))) errs[q.id] = "Please fill in all values";
        } catch { errs[q.id] = "Please fill in all values"; }
      } else if (!val || val === "false" || val === "[]") {
        errs[q.id] = "This field is required";
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // The batch code entered on this record (for linking a failed batch to a report)
  function getBatchCode(): string {
    const q = questions.find(q => q.type === "text" && /(batch code|julian|batch ref|lot number)/i.test(q.label));
    return q ? (answers[q.id] ?? "").trim() : "";
  }

  // Shared submit path. `failed` flags a failed batch — it still saves the record
  // and deducts the ingredients used (traceability + live inventory), but prefixes
  // the batch notes so the record is clearly marked as a failed batch.
  async function submitRecord(opts: { failed?: boolean } = {}): Promise<boolean> {
    setSubmitting(true);

    // Upload any base64 photos to Supabase Storage. If an upload fails we must
    // NOT fall back to sending the raw base64 in the request — a multi-MB image
    // exceeds the server's request-body limit and the whole submit fails with a
    // cryptic error. Instead, surface a clear message and stop.
    const processedAnswers: AnswerMap = { ...answers };
    for (const q of questions) {
      if (q.type === "photo" && processedAnswers[q.id]?.startsWith("data:")) {
        const base64 = processedAnswers[q.id];
        const blob = await (await fetch(base64)).blob();
        const ext = blob.type.split("/")[1] ?? "jpg";
        const path = `photos/${id}/${Date.now()}-${q.id}.${ext}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from("compliance-photos")
          .upload(path, blob, { contentType: blob.type, upsert: false });
        if (uploadErr || !uploadData) {
          setSubmitting(false);
          alert("Couldn't upload a photo — please check your connection and try again.");
          return false;
        }
        const { data: urlData } = supabase.storage.from("compliance-photos").getPublicUrl(path);
        processedAnswers[q.id] = urlData.publicUrl;
      }
    }

    const trimmedNotes = batchNotes.trim();
    const notes = isProduction
      ? (opts.failed
          ? `⚠️ BATCH FAILED${trimmedNotes ? ` — ${trimmedNotes}` : ""}`
          : (trimmedNotes || null))
      : null;

    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checklist_id: id,
        organisation_id: checklist?.organisation_id ?? null,
        submitted_by: getSubmittedBy(questions, processedAnswers),
        batch_notes: notes,
        team_member_id: memberId,
        answers: questions.map((q) => ({
          question_id: q.id,
          value: processedAnswers[q.id] ?? null,
        })),
      }),
    });

    if (res.ok && isDraftable && draftIdRef.current) {
      await supabase.from("batch_drafts").delete().eq("id", draftIdRef.current);
    }

    setSubmitting(false);

    if (!res.ok) {
      let msg = "Something went wrong — please try again.";
      try {
        const data = await res.json();
        if (data?.error) msg = `Error: ${data.error}${data.detail ? ` (${data.detail})` : ""}`;
      } catch {}
      alert(msg);
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) {
      const firstErr = document.querySelector("[data-error]");
      firstErr?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (await submitRecord()) setSubmitted(true);
  }

  // End a failed batch: save the record + inventory/traceability (no required-field
  // check), then open a Corrective Action Report with the affected recipe pre-linked.
  async function handleBatchFailed() {
    const ok = window.confirm(
      "Mark this batch as FAILED?\n\nThis ends and saves the batch now — recording the ingredients used and traceability entered so far — then opens a Corrective Action Report for it. This can't be undone."
    );
    if (!ok) return;

    if (!(await submitRecord({ failed: true }))) return;

    // Find this org's Corrective Action checklist (RLS scopes to the org)
    const { data: ca } = await supabase
      .from("checklists")
      .select("id")
      .eq("active", true)
      .ilike("name", "%corrective action%")
      .order("name")
      .limit(1)
      .maybeSingle();

    const product = (checklist?.name ?? "").replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim();
    const code = getBatchCode();
    const affected = `${product}${code ? ` — Batch ${code}` : ""}`;

    if (ca?.id) {
      router.push(`/checklist/${ca.id}?affected=${encodeURIComponent(affected)}`);
    } else {
      // No corrective action checklist set up — fall back to the normal success screen
      setSubmitted(true);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    );
  }

  if (!checklist) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900">Checklist not found</p>
          <p className="mt-1 text-sm text-gray-500">Check the QR code and try again.</p>
        </div>
      </div>
    );
  }

  // ── Resume prompt (Production only) ─────────────────────────────────────────

  if (isProduction && showResumePrompt && existingDrafts.length > 0) {
    const fmtStarted = (d: BatchDraft) => {
      const iso = d.started_at ?? d.last_saved_at;
      return new Date(iso).toLocaleString("en-GB", {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    };
    const lastEdited = (d: BatchDraft) => {
      const mins = Math.round((Date.now() - new Date(d.last_saved_at).getTime()) / 60000);
      return mins < 60 ? `${mins} min${mins !== 1 ? "s" : ""} ago`
        : `${Math.round(mins / 60)} hr${Math.round(mins / 60) !== 1 ? "s" : ""} ago`;
    };
    const plural = existingDrafts.length !== 1;

    return (
      <div className="min-h-screen bg-brand-cream flex flex-col">
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
          <div className="px-4 py-3 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kernel.png" alt="Kernel" className="h-8 w-auto" />
            <div>
              <h1 className="text-sm font-semibold text-gray-900 leading-tight">{checklist.name}</h1>
              <p className="text-xs text-gray-500">Production Record</p>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="card max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{existingDrafts.length} batch{plural ? "es" : ""} in progress</p>
                <p className="text-xs text-gray-500">Pick one to continue, or start a new batch.</p>
              </div>
            </div>

            {/* List of in-progress batches for this product */}
            <div className="space-y-2">
              {existingDrafts.map(draft => (
                <button
                  key={draft.id}
                  onClick={() => resumeDraft(draft)}
                  className="w-full flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:border-brand hover:bg-brand-light transition"
                >
                  <span className="h-2 w-2 rounded-full bg-brand-dark shrink-0 animate-pulse" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">Started {fmtStarted(draft)}</p>
                    <p className="text-xs text-gray-500">by {draft.started_by} · last edited {lastEdited(draft)}</p>
                  </div>
                  <span className="text-xs font-medium text-brand-dark shrink-0">Resume →</span>
                </button>
              ))}
            </div>

            <button onClick={startNewBatch} className="btn-secondary w-full">
              Start a new batch
            </button>
            <p className="text-[11px] text-gray-400 text-center -mt-1">
              Starting a new batch won&apos;t affect the {plural ? "ones" : "one"} above — {plural ? "they stay" : "it stays"} saved.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Submitted ────────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="card max-w-sm w-full p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand/20 overflow-hidden">
            <svg className="h-8 w-8 text-brown" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            {isProduction ? "Batch record submitted!" : isInduction ? "Induction completed!" : "Submitted!"}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {checklist.name} has been recorded.
          </p>
          <a href={isInduction ? "/admin/team/training" : "/home"} className="btn-primary mt-6 w-full">
            {isInduction ? "Return to training portal" : "Return to dashboard"}
          </a>
        </div>
      </div>
    );
  }

  // ── Main form ────────────────────────────────────────────────────────────────

  const progress = isProduction ? calcProgress() : null;
  const allComplete = progress ? progress.filled === progress.total : true;

  return (
    <div className="min-h-screen bg-brand-cream">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Yep Kitchen" className="h-8 w-auto shrink-0" />
              <div className="min-w-0">
                <h1 className="text-sm font-semibold text-gray-900 leading-tight truncate">{checklist.name}</h1>
                <p className="text-xs text-gray-500">{frequencyLabel(checklist.frequency as never)}</p>
              </div>
            </div>
            {/* Draft save indicator */}
            {isDraftable && draftId && (
              <div className="shrink-0">
                {draftStatus === "saving" && (
                  <span className="text-xs text-gray-400">Saving…</span>
                )}
                {draftStatus === "saved" && (
                  <span className="text-xs text-brown/60">Saved ✓</span>
                )}
              </div>
            )}
          </div>

          {/* Progress bar (Production only) */}
          {isProduction && progress && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">{progress.filled} / {progress.total} fields complete</span>
                {!allComplete && (
                  <span className="text-xs text-amber-600">{progress.total - progress.filled} remaining</span>
                )}
              </div>
              <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-300"
                  style={{ width: `${Math.round((progress.filled / progress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="pb-safe">
        <div className="mx-auto max-w-xl px-4 py-4 space-y-4">
          {checklist.description && (
            <p className="text-sm text-gray-600 bg-brand-cream border border-brand/30 rounded-xl px-4 py-3">
              {checklist.description}
            </p>
          )}

          {/* Questions */}
          {questions.map((q) => (
            <div key={q.id} data-error={errors[q.id] ? true : undefined}>
              <QuestionField
                question={q}
                value={answers[q.id] ?? ""}
                onChange={(val) => handleAnswerChange(q.id, val)}
                error={errors[q.id]}
                ingredientLots={ingredientLots}
                densityByName={densityByName}
              />
            </div>
          ))}

          {/* Additional comments — Production records only */}
          {isProduction && (
            <div className="card px-4 py-4 space-y-2">
              <label className="block text-sm font-semibold text-gray-800">
                Additional comments
                <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={batchNotes}
                onChange={e => {
                  const newNotes = e.target.value;
                  dirtyFieldsRef.current.add("__batch_notes__");
                  setBatchNotes(newNotes);
                  if (isProduction && !showResumePrompt) {
                    const draftAnswers = newNotes.trim() ? { ...answers, __batch_notes__: newNotes } : answers;
                    scheduleDraftSave(draftAnswers, getSubmittedBy(questions, answers));
                  }
                }}
                rows={3}
                className="input resize-none w-full"
                placeholder="Any notes specific to this batch — e.g. ingredient substitutions, equipment issues, yield variations…"
              />
            </div>
          )}

          {Object.keys(errors).length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Please fill in all required fields before submitting.
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || (isProduction && !allComplete)}
            className={`w-full py-3 text-base rounded-xl font-semibold transition ${
              isProduction && !allComplete
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "btn-primary"
            }`}
          >
            {submitting
              ? "Submitting…"
              : isProduction && !allComplete
              ? `${progress!.total - progress!.filled} field${progress!.total - progress!.filled !== 1 ? "s" : ""} still needed`
              : isProduction
              ? "Submit batch record"
              : "Submit checklist"}
          </button>

          {isProduction && (
            <>
              <button
                type="button"
                onClick={handleBatchFailed}
                disabled={submitting}
                className="w-full py-2.5 text-sm rounded-xl font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-50"
              >
                ⚠ Batch failed
              </button>
              <p className="text-center text-xs text-gray-400 -mt-1">
                Ends &amp; saves the batch (keeping ingredients used and traceability), then opens a Corrective Action Report.
              </p>
              <p className="text-center text-xs text-gray-400">
                Progress is saved automatically — you can close and reopen this page at any time.
              </p>
            </>
          )}

          <p className="text-center text-xs text-gray-400 pb-8">
            Kernel
          </p>
        </div>
      </form>
    </div>
  );
}

export default function ChecklistPage() {
  return (
    <Suspense>
      <ChecklistPageInner />
    </Suspense>
  );
}
