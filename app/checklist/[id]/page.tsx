"use client";

import { useEffect, useState, useRef, useCallback, useMemo, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fetchAll } from "@/lib/fetchAll";
import type { Checklist, Question, IngredientLot } from "@/lib/types";
import QuestionField, { findLots } from "@/components/QuestionField";
import { frequencyLabel } from "@/lib/utils";
import {
  getRunQuestionIds, splitRunZones, findTotalUnitsQuestion,
  runKey, unitsKey, RUN_COUNT_KEY,
} from "@/lib/production-runs";

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
          // ingredient_table lots (grams)
          for (const lot of (row.lots ?? [])) {
            if (lot.lot_id && Number(lot.weight_g) > 0) {
              reservations[lot.lot_id] = (reservations[lot.lot_id] || 0) + Number(lot.weight_g);
            }
          }
          // packing_runs primary packaging (units)
          if (row.jar_lot_id && Number(row.jars_used) > 0) {
            reservations[row.jar_lot_id] = (reservations[row.jar_lot_id] || 0) + Number(row.jars_used);
          }
          if (row.lids_lot_id && Number(row.lids_count) > 0) {
            reservations[row.lids_lot_id] = (reservations[row.lids_lot_id] || 0) + Number(row.lids_count);
          }
        }
      } catch { /* not a lot-linked answer — skip */ }
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
  // something the current user is actively typing, and to build the save patch.
  const dirtyFieldsRef = useRef<Set<string>>(new Set());
  // Live mirrors of answers + batch notes so the debounced save (which fires ~2s
  // later) always reads the freshest values, not a stale captured snapshot.
  const answersRef = useRef<AnswerMap>({});
  const batchNotesRef = useRef("");

  const isProduction = checklist?.category === "Production";
  // Both production records and inductions auto-save as a draft and submit a
  // record; only production has the ingredient/lot + batch-failed machinery.
  const isDraftable = isProduction || isInduction;

  // ── Multi-run production records ──────────────────────────────────────────
  // A record may capture several identical runs in one day. Questions in the
  // "runs" zone (ingredients → packing log) repeat per run; everything else is
  // master (entered once). Run count is stored in the answer map so it auto-saves
  // and live-syncs like any other field. Run 0 uses bare question ids, so a
  // single-run record is byte-identical to a pre-feature one.
  const runQuestionIds = useMemo(() => getRunQuestionIds(questions), [questions]);
  const hasRunZone = runQuestionIds.size > 0;
  const runCount = Math.max(1, parseInt(answers[RUN_COUNT_KEY] || "1", 10) || 1);
  const [activeRun, setActiveRun] = useState(0);
  const totalUnitsQ = useMemo(() => findTotalUnitsQuestion(questions), [questions]);

  // Expand every required question into one entry per run it applies to, with the
  // namespaced answer key. Master questions yield a single entry. Used by progress,
  // validation and the lot gate so all runs are checked.
  const expandedFields = useCallback((): { q: Question; key: string; run: number }[] => {
    const out: { q: Question; key: string; run: number }[] = [];
    for (const q of questions) {
      if (runQuestionIds.has(q.id)) {
        for (let r = 0; r < runCount; r++) out.push({ q, key: runKey(q.id, r), run: r });
      } else {
        out.push({ q, key: q.id, run: 0 });
      }
    }
    return out;
  }, [questions, runQuestionIds, runCount]);

  // The sum of per-run "good units produced" — pre-fills the editable Total units field.
  const perRunUnitsSum = useCallback((): number => {
    let sum = 0;
    for (let r = 0; r < runCount; r++) sum += Number(answers[unitsKey(r)] || 0) || 0;
    return sum;
  }, [answers, runCount]);

  // Live in-record stock reservation. buildIngredientMaps subtracts what OTHER
  // drafts have reserved but deliberately excludes THIS draft; and the ingredient
  // table only nets off rows within its own value. So a multi-run record's Run 2
  // wouldn't see Run 1's usage. Fix: for each lot-linked question, subtract what
  // every OTHER field of this record has already claimed (ingredients in grams,
  // jars/lids in units), so each run's dropdown shows what's genuinely left. The
  // permanent deduction still happens once, on submit.
  function lotsExcludingKey(excludeKey: string): Record<string, IngredientLot[]> {
    const used: Record<string, number> = {};
    for (const [k, val] of Object.entries(answers)) {
      if (k === excludeKey || typeof val !== "string" || !val) continue;
      try {
        const parsed = JSON.parse(val);
        const rows = Array.isArray(parsed) ? parsed : (parsed?.rows ?? []);
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          for (const lot of (row.lots ?? [])) {
            if (lot.lot_id && Number(lot.weight_g) > 0) used[lot.lot_id] = (used[lot.lot_id] || 0) + Number(lot.weight_g);
          }
          if (row.jar_lot_id && Number(row.jars_used) > 0) used[row.jar_lot_id] = (used[row.jar_lot_id] || 0) + Number(row.jars_used);
          if (row.lids_lot_id && Number(row.lids_count) > 0) used[row.lids_lot_id] = (used[row.lids_lot_id] || 0) + Number(row.lids_count);
        }
      } catch { /* not a lot-linked answer — skip */ }
    }
    if (Object.keys(used).length === 0) return ingredientLots;
    const out: Record<string, IngredientLot[]> = {};
    for (const [name, lots] of Object.entries(ingredientLots)) {
      // Keep zeroed lots visible (rather than dropping them) so a lot already
      // selected in this question still renders, showing "0g left".
      out[name] = lots.map((l) =>
        used[l.id] ? { ...l, quantity_remaining_g: Math.max(0, l.quantity_remaining_g - used[l.id]) } : l
      );
    }
    return out;
  }

  function setRunCount(next: number) {
    const n = Math.max(1, next);
    handleAnswerChange(RUN_COUNT_KEY, String(n));
    setActiveRun((cur) => Math.min(cur, n - 1));
  }

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
        // Paginated: the lot list feeds the ingredient dropdowns — a lot missing
        // past the 1000-row cap forces manual entry and weakens traceability.
        const [lots, allDrafts] = await Promise.all([
          fetchAll<LotWithIngredient>((from, to) =>
            supabase
              .from("ingredient_lots")
              .select("*, ingredient:ingredients(name, density_g_per_l)")
              .gt("quantity_remaining_g", 0)
              .order("julian_code")
              .range(from, to)),
          fetchAll<BatchDraft>((from, to) =>
            supabase
              .from("batch_drafts")
              .select("id, checklist_id, started_by, started_at, last_saved_at, answers")
              .order("last_saved_at", { ascending: false })
              .range(from, to)),
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
  // Keep the answer/batch-note mirrors in sync for the debounced save closure
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { batchNotesRef.current = batchNotes; }, [batchNotes]);

  // Poll for draft changes from other active production runs every 10 seconds so
  // lot availability stays accurate when multiple batches are running simultaneously.
  useEffect(() => {
    if (!isProduction) return;

    const refreshDraftReservations = async () => {
      if (rawLotsRef.current.length === 0) return; // lots not loaded yet
      const freshDrafts = await fetchAll<BatchDraft>((from, to) => supabase
        .from("batch_drafts")
        .select("id, checklist_id, started_by, started_at, last_saved_at, answers")
        .order("id")
        .range(from, to));
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

  // Persist ONLY the fields this device has changed since the last save, and let
  // the database merge them into the shared draft atomically (answers || patch).
  // This is what makes concurrent multi-device editing safe: two people editing
  // different fields can no longer overwrite each other (the old whole-blob upsert
  // was last-write-wins, which silently dropped the other person's entries).
  const scheduleDraftSave = useCallback((by: string) => {
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    setDraftStatus("saving");
    draftSaveTimer.current = setTimeout(async () => {
      let currentId = draftIdRef.current;
      if (!currentId) {
        currentId = crypto.randomUUID();
        setDraftId(currentId);
        draftIdRef.current = currentId;
      }

      // Snapshot the dirty fields and build the patch from the freshest values.
      const savedFields = [...dirtyFieldsRef.current];
      if (savedFields.length === 0) { setDraftStatus("saved"); return; }
      const patch: AnswerMap = {};
      for (const field of savedFields) {
        patch[field] = field === "__batch_notes__"
          ? batchNotesRef.current
          : (answersRef.current[field] ?? "");
      }

      const { error } = await supabase.rpc("merge_batch_draft", {
        p_id: currentId,
        p_checklist_id: id,
        p_organisation_id: checklist?.organisation_id ?? null,
        // Only inductions carry a team member; production drafts pass null.
        p_team_member_id: memberId ?? null,
        p_started_by: by || "Unknown",
        p_patch: patch,
      });

      if (error) {
        // Leave the fields dirty so the next edit/save retries them — never drop data.
        console.error("Draft save failed:", error);
        setDraftStatus("idle");
        return;
      }

      // Clear only the fields we actually saved AND that haven't changed since the
      // snapshot — anything the user re-typed during the await stays dirty (and
      // protected from incoming real-time updates) until its own save lands.
      for (const field of savedFields) {
        const current = field === "__batch_notes__"
          ? batchNotesRef.current
          : (answersRef.current[field] ?? "");
        if (current === patch[field]) dirtyFieldsRef.current.delete(field);
      }
      setDraftStatus("saved");
    }, 2000);
  }, [id, memberId, checklist?.organisation_id]);

  function handleAnswerChange(questionId: string, val: string) {
    dirtyFieldsRef.current.add(questionId);
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: val };
      answersRef.current = next; // keep the save mirror current within this tick
      if (isDraftable && !showResumePrompt) {
        scheduleDraftSave(getSubmittedBy(questions, next));
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
    setActiveRun(0);
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
    setActiveRun(0);
  }

  // Progress calculation for production checklists — every run counts.
  function calcProgress() {
    const fields = expandedFields().filter((f) => f.q.required);
    const filled = fields.filter((f) => isFieldFilled(f.q, answers[f.key] ?? "")).length;
    return { filled, total: fields.length };
  }

  // Traceability gate for ingredient_table questions. Every ingredient that has
  // goods-in lots MUST reference a real lot picked from the dropdown — a typed or
  // defaulted Julian code is not traceable to stock. Two modes:
  //  • "full" — every ingredient needs a lot + weight (a completed batch used them all).
  //  • "used" — only ingredients with a weight entered need a lot. Used for a FAILED
  //    batch, where some ingredients may never have been added, but whatever WAS used
  //    (and now goes to waste) must still be traceable to a goods-in lot.
  function ingredientLotErrors(mode: "full" | "used"): Record<string, string> {
    const errs: Record<string, string> = {};
    for (const q of questions) {
      if (q.type !== "ingredient_table" || !q.required) continue;
      const runs = runQuestionIds.has(q.id) ? runCount : 1;
      for (let r = 0; r < runs; r++) {
      const key = runKey(q.id, r);
      const val = answers[key] ?? "";
      try {
        const parsed = JSON.parse(val);
        const rows = (Array.isArray(parsed) ? parsed : (parsed?.rows ?? [])) as Array<{ name?: string; lots: Array<{ lot_id?: string; julian_code: string; weight_g: string }> }>;
        // Ingredient names by row position, for resolving available goods-in lots.
        const names = (q.options ?? []).map((o) => String(o).split("|")[0]);
        // Out-of-stock ingredients (no goods-in lots) can't be traced — a typed or
        // defaulted Julian code is NOT acceptable. Require a real lot picked from the
        // dropdown; no stock ⇒ never ok (forces a Goods In delivery first).
        const lotRefOk = (hasLots: boolean, l: { lot_id?: string }) =>
          !!(hasLots && l.lot_id?.trim());
        const ok = mode === "full"
          ? rows.length > 0 && rows.every((r, i) => {
              if (!(r.lots?.length > 0)) return false;
              const hasLots = findLots(ingredientLots, r.name || names[i] || "").length > 0;
              return r.lots.every((l) => lotRefOk(hasLots, l) && l.weight_g?.trim());
            })
          : rows.every((r, i) => {
              const hasLots = findLots(ingredientLots, r.name || names[i] || "").length > 0;
              // Only lots with a weight count as "used" and must be traceable.
              return (r.lots ?? []).every((l) => !l.weight_g?.trim() || lotRefOk(hasLots, l));
            });
        if (!ok) errs[key] = mode === "full"
          ? "Select a goods-in lot and weight for every ingredient (including any split rows). If an ingredient is out of stock, log a delivery in Goods In first."
          : "Every ingredient you used must have a goods-in lot selected — these go to waste and must stay traceable. Out-of-stock items must be received in Goods In before they can be traced.";
      } catch { errs[key] = "Please complete the ingredient table"; }
      }
    }
    return errs;
  }

  function validate(): boolean {
    const errs: Record<string, string> = { ...ingredientLotErrors("full") };
    for (const { q, key } of expandedFields()) {
      if (!q.required) continue;
      const val = answers[key] ?? "";
      if (q.type === "ingredient_table") {
        continue; // handled by ingredientLotErrors above
      } else if (q.type === "packing_runs") {
        try {
          const runs = JSON.parse(val) as Array<{ pack_weight: string; jars_used: string }>;
          if (!runs.some((r) => r.pack_weight?.trim() && r.jars_used?.trim())) {
            errs[key] = "Please complete at least one packing run";
          }
        } catch { errs[key] = "Please complete the packing log"; }
      } else if (q.type === "multi_number") {
        try {
          const arr = JSON.parse(val) as string[];
          if (!arr.every(v => v !== "" && !isNaN(Number(v)))) errs[key] = "Please fill in all values";
        } catch { errs[key] = "Please fill in all values"; }
      } else if (!val || val === "false" || val === "[]") {
        errs[key] = "This field is required";
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
    for (const { q, key } of expandedFields()) {
      if (q.type === "photo" && processedAnswers[key]?.startsWith("data:")) {
        const base64 = processedAnswers[key];
        const blob = await (await fetch(base64)).blob();
        const ext = blob.type.split("/")[1] ?? "jpg";
        const path = `photos/${id}/${Date.now()}-${key.replace(/[^a-z0-9]/gi, "")}.${ext}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from("compliance-photos")
          .upload(path, blob, { contentType: blob.type, upsert: false });
        if (uploadErr || !uploadData) {
          setSubmitting(false);
          alert("Couldn't upload a photo — please check your connection and try again.");
          return false;
        }
        const { data: urlData } = supabase.storage.from("compliance-photos").getPublicUrl(path);
        processedAnswers[key] = urlData.publicUrl;
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
        run_count: runCount,
        // Per-run "good units produced" — for the report's per-run yield. The
        // finished-goods total comes from the editable Total units master field.
        run_meta: runCount > 1
          ? Array.from({ length: runCount }, (_, r) => ({ units: processedAnswers[unitsKey(r)] ?? "" }))
          : null,
        // Run questions ship all runs under one answer as { __runs__: [...] };
        // single-run records stay byte-identical (bare value, no wrapper).
        answers: questions.map((q) => {
          if (runQuestionIds.has(q.id) && runCount > 1) {
            const runs = Array.from({ length: runCount }, (_, r) => processedAnswers[runKey(q.id, r)] ?? "");
            return { question_id: q.id, value: JSON.stringify({ __runs__: runs }) };
          }
          return { question_id: q.id, value: processedAnswers[q.id] ?? null };
        }),
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
      // Jump to the first run that has an incomplete required field, so the error
      // isn't hidden behind another run's tab.
      if (hasRunZone && runCount > 1) {
        const bad = expandedFields().find((f) => f.q.required && !isFieldFilled(f.q, answers[f.key] ?? ""));
        if (bad) setActiveRun(bad.run);
      }
      setTimeout(() => {
        const firstErr = document.querySelector("[data-error]");
        firstErr?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
      return;
    }
    if (await submitRecord()) setSubmitted(true);
  }

  // End a failed batch: save the record + inventory/traceability (no required-field
  // check), then open a Corrective Action Report with the affected recipe pre-linked.
  async function handleBatchFailed() {
    // A failed batch still consumes ingredients — they go to waste and must stay
    // traceable. Block if any ingredient that was used lacks a real goods-in lot.
    const lotErrs = ingredientLotErrors("used");
    if (Object.keys(lotErrs).length > 0) {
      setErrors(lotErrs);
      alert("Before ending a failed batch, select a goods-in lot for every ingredient you used. They went to waste and still need to be traceable to stock.");
      return;
    }

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
          <a href={isInduction ? "/compliance/training" : "/dashboard"} className="btn-primary mt-6 w-full">
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
          {(() => {
            const renderQ = (q: Question, key: string) => (
              <div key={key} data-error={errors[key] ? true : undefined}>
                <QuestionField
                  question={q}
                  value={answers[key] ?? ""}
                  onChange={(val) => handleAnswerChange(key, val)}
                  error={errors[key]}
                  // Lot-linked questions see stock net of what the REST of this
                  // record has already claimed (e.g. Run 1's usage when in Run 2).
                  ingredientLots={
                    q.type === "ingredient_table" || q.type === "packing_runs"
                      ? lotsExcludingKey(key)
                      : ingredientLots
                  }
                  densityByName={densityByName}
                />
              </div>
            );

            // Non-production / no run zone — render flat, exactly as before.
            if (!hasRunZone) return questions.map((q) => renderQ(q, q.id));

            const { header, runs, footer } = splitRunZones(questions);
            const runComplete = (r: number) =>
              runs.every((q) => !q.required || isFieldFilled(q, answers[runKey(q.id, r)] ?? ""));

            const onRunUnitsChange = (val: string) => {
              handleAnswerChange(unitsKey(activeRun), val);
              if (totalUnitsQ) {
                let sum = 0;
                for (let r = 0; r < runCount; r++)
                  sum += (r === activeRun ? Number(val || 0) : Number(answers[unitsKey(r)] || 0)) || 0;
                handleAnswerChange(totalUnitsQ.id, sum ? String(sum) : "");
              }
            };

            return (
              <>
                {header.map((q) => renderQ(q, q.id))}

                {/* Run switcher */}
                <div className="rounded-xl border border-brand/40 bg-brand-cream/60 px-3 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-brown">Production runs</span>
                    <span className="text-xs text-brown-light">
                      {runCount} run{runCount !== 1 ? "s" : ""}
                      {runCount > 1 && perRunUnitsSum() > 0 && <> · <span className="font-semibold text-brown">{perRunUnitsSum().toLocaleString()}</span> units total</>}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: runCount }, (_, r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setActiveRun(r)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          r === activeRun
                            ? "bg-brown text-white"
                            : "bg-white border border-gray-200 text-gray-600 hover:border-brown/40"
                        }`}
                      >
                        {runComplete(r) && <span className={r === activeRun ? "text-white" : "text-green-600"}>✓</span>}
                        Run {r + 1}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => { setRunCount(runCount + 1); setActiveRun(runCount); }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-white border border-dashed border-brown/40 text-brown hover:bg-brand/10 transition-colors"
                    >
                      + Add run
                    </button>
                  </div>
                  {runCount > 1 && (
                    <div className="flex items-center justify-between pt-0.5">
                      <span className="text-xs text-brown-light">Editing <span className="font-semibold text-brown">Run {activeRun + 1}</span> — its ingredients, CCPs, checks &amp; packing</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (!confirm(`Remove Run ${activeRun + 1}? Its entries in this record will be cleared.`)) return;
                          // Clear this run's keys, shift later runs down, drop the last slot.
                          for (const q of runs) {
                            for (let r = activeRun; r < runCount - 1; r++)
                              handleAnswerChange(runKey(q.id, r), answers[runKey(q.id, r + 1)] ?? "");
                            handleAnswerChange(runKey(q.id, runCount - 1), "");
                          }
                          for (let r = activeRun; r < runCount - 1; r++)
                            handleAnswerChange(unitsKey(r), answers[unitsKey(r + 1)] ?? "");
                          handleAnswerChange(unitsKey(runCount - 1), "");
                          setRunCount(runCount - 1);
                        }}
                        className="text-xs text-red-400 hover:text-red-600 transition shrink-0"
                      >
                        Remove run
                      </button>
                    </div>
                  )}
                </div>

                {/* Active run's repeating questions */}
                {runs.map((q) => renderQ(q, runKey(q.id, activeRun)))}

                {/* Per-run good units produced — the last thing entered for this run */}
                {runCount > 1 && (
                  <div className="card px-4 py-4 space-y-1.5 border-brand/40">
                    <label className="block text-sm font-semibold text-gray-800">
                      Units produced — Run {activeRun + 1} (sub-batch total)
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={answers[unitsKey(activeRun)] ?? ""}
                      onChange={(e) => onRunUnitsChange(e.target.value)}
                      className="input w-full"
                      placeholder="Good, sellable units from this run"
                    />
                    <p className="text-xs text-gray-400">
                      Combined: <span className="font-semibold text-brown">{perRunUnitsSum().toLocaleString()}</span> units across {runCount} runs — fills in “{totalUnitsQ?.label ?? "Total units produced"}” below (editable).
                    </p>
                  </div>
                )}

                {footer.map((q) => renderQ(q, q.id))}
              </>
            );
          })()}

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
                  batchNotesRef.current = newNotes; // keep the save mirror current within this tick
                  setBatchNotes(newNotes);
                  if (isProduction && !showResumePrompt) {
                    scheduleDraftSave(getSubmittedBy(questions, answers));
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
