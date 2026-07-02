import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { expandRunValues } from "@/lib/production-runs";

/**
 * POST /api/admin/recalculate-stock
 *
 * Admin-only. Rebuilds every ingredient_lot's quantity_remaining_g from
 * scratch by:
 *   1. Resetting all lots to their original quantity_received_g
 *   2. Replaying every ingredient_table answer ever submitted for this org,
 *      resolving by lot_id where available, julian_code as fallback
 *   3. Re-applying every reconciliation write-off from wastage_log — without
 *      this, a recalculation resurrects written-off stock
 *
 * This corrects any historical discrepancies where deductions were missed
 * (e.g. when a manual julian_code entry meant lot_id was never set).
 */

/** Paginate past PostgREST's 1000-row cap (older answers must not be dropped). */
async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}
export async function POST(req: NextRequest) {
  // ── Auth: must be admin ────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: membership } = await supabaseAdmin
    .from("organisation_members")
    .select("role, organisation_id")
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const orgId = membership.organisation_id;

  try {
    // ── Step 1: Load all lots for this org ─────────────────────────────────
    const { data: lots, error: lotsErr } = await supabaseAdmin
      .from("ingredient_lots")
      .select("id, julian_code, quantity_received_g")
      .eq("organisation_id", orgId);

    if (lotsErr) throw lotsErr;
    if (!lots || lots.length === 0) {
      return NextResponse.json({ success: true, message: "No lots to reset", deductions: 0 });
    }

    const lotById   = new Map<string, { quantity_received_g: number }>(lots.map(l => [l.id, l]));
    const lotByCode = new Map<string, string>(lots.map(l => [l.julian_code, l.id]));

    // Reset every lot to what was received
    for (const lot of lots) {
      await supabaseAdmin
        .from("ingredient_lots")
        .update({ quantity_remaining_g: lot.quantity_received_g })
        .eq("id", lot.id);
    }

    // ── Step 2: Find all ingredient_table questions for this org ───────────
    const { data: checklists } = await supabaseAdmin
      .from("checklists")
      .select("id")
      .eq("organisation_id", orgId);

    const checklistIds = (checklists ?? []).map((c: { id: string }) => c.id);
    if (checklistIds.length === 0) {
      return NextResponse.json({ success: true, message: "No checklists", deductions: 0 });
    }

    const { data: ingQuestions } = await supabaseAdmin
      .from("questions")
      .select("id, type")
      .in("checklist_id", checklistIds)
      .in("type", ["ingredient_table", "packing_runs"]);

    const ingQIds  = (ingQuestions ?? []).filter((q: { type: string }) => q.type === "ingredient_table").map((q: { id: string }) => q.id);
    const packQIds = (ingQuestions ?? []).filter((q: { type: string }) => q.type === "packing_runs").map((q: { id: string }) => q.id);
    if (ingQIds.length === 0 && packQIds.length === 0) {
      return NextResponse.json({ success: true, message: "No ingredient or packaging questions", deductions: 0 });
    }

    // Accumulate total amount used per lot (grams for ingredients, units for packaging)
    const usage = new Map<string, number>(); // lotId → total used
    let deductionCount = 0;

    // ── Step 3: Replay every ingredient_table answer ──────────────────────
    // expandRunValues unwraps multi-run records ({ __runs__: [...] }) so every
    // run's usage replays, not just the first.
    const allAnswers = ingQIds.length > 0
      ? await fetchAllRows<{ question_id: string; value: string | null }>((from, to) =>
          supabaseAdmin.from("answers").select("question_id, value").in("question_id", ingQIds).not("value", "is", null).order("id").range(from, to))
      : [];

    for (const answer of allAnswers) {
      if (!answer.value) continue;
      for (const value of expandRunValues(answer.value)) {
        if (!value) continue;
        try {
          const parsedVal = JSON.parse(value);
          const rows = (Array.isArray(parsedVal) ? parsedVal : (parsedVal?.rows ?? [])) as Array<{
            lots: Array<{ lot_id?: string; julian_code?: string; weight_g: string }>;
          }>;

          for (const row of rows) {
            for (const lotUse of row.lots ?? []) {
              const used = Number(lotUse.weight_g);
              if (!used || used <= 0) continue;

              let resolvedId: string | undefined;
              if (lotUse.lot_id && lotById.has(lotUse.lot_id)) {
                resolvedId = lotUse.lot_id;
              } else if (lotUse.julian_code?.trim() && lotByCode.has(lotUse.julian_code.trim())) {
                resolvedId = lotByCode.get(lotUse.julian_code.trim());
              }

              if (resolvedId) {
                usage.set(resolvedId, (usage.get(resolvedId) ?? 0) + used);
                deductionCount++;
              }
            }
          }
        } catch { /* malformed answer — skip */ }
      }
    }

    // ── Step 3b: Replay every packing_runs answer (primary packaging) ──────
    if (packQIds.length > 0) {
      const packAnswers = await fetchAllRows<{ question_id: string; value: string | null }>((from, to) =>
        supabaseAdmin.from("answers").select("question_id, value").in("question_id", packQIds).not("value", "is", null).order("id").range(from, to));

      for (const answer of packAnswers) {
        if (!answer.value) continue;
        for (const value of expandRunValues(answer.value)) {
          if (!value) continue;
          try {
            const runs = JSON.parse(value);
            if (!Array.isArray(runs)) continue;
            for (const run of runs) {
              for (const [lotKey, countKey] of [["jar_lot_id", "jars_used"], ["lids_lot_id", "lids_count"]] as const) {
                const lotId = run[lotKey];
                const used = Number(run[countKey]);
                if (lotId && lotById.has(lotId) && used > 0) {
                  usage.set(lotId, (usage.get(lotId) ?? 0) + used);
                  deductionCount++;
                }
              }
            }
          } catch { /* malformed answer — skip */ }
        }
      }
    }

    // ── Step 3c: Re-apply reconciliation write-offs from wastage_log ───────
    // A write-off physically removed stock; replaying production alone would
    // resurrect it and overstate every reconciled lot.
    const wastageRows = await fetchAllRows<{ lot_id: string | null; quantity_written_off_g: number | null }>((from, to) =>
      supabaseAdmin.from("wastage_log").select("lot_id, quantity_written_off_g").eq("organisation_id", orgId).order("id").range(from, to));

    const writtenOffByLot = new Map<string, number>();
    for (const w of wastageRows) {
      if (!w.lot_id || !lotById.has(w.lot_id)) continue;
      writtenOffByLot.set(w.lot_id, (writtenOffByLot.get(w.lot_id) ?? 0) + (Number(w.quantity_written_off_g) || 0));
    }

    // ── Step 4: Apply accumulated deductions + write-offs ──────────────────
    const results: Array<{ julian_code: string; received_g: number; used_g: number; written_off_g: number; remaining_g: number }> = [];
    const touched = new Set([...usage.keys(), ...writtenOffByLot.keys()]);

    for (const lotId of touched) {
      const lot = lotById.get(lotId);
      if (!lot) continue;
      const totalUsed = usage.get(lotId) ?? 0;
      const writtenOff = writtenOffByLot.get(lotId) ?? 0;
      const remaining = Math.max(0, lot.quantity_received_g - totalUsed - writtenOff);
      await supabaseAdmin
        .from("ingredient_lots")
        .update({ quantity_remaining_g: remaining })
        .eq("id", lotId);

      const code = lots.find(l => l.id === lotId)?.julian_code ?? lotId;
      results.push({
        julian_code:   code,
        received_g:    lot.quantity_received_g,
        used_g:        Math.round(totalUsed),
        written_off_g: Math.round(writtenOff),
        remaining_g:   remaining,
      });
    }

    return NextResponse.json({
      success: true,
      lots_reset: lots.length,
      lots_with_usage: results.length,
      deduction_entries_replayed: deductionCount,
      breakdown: results.sort((a, b) => a.julian_code.localeCompare(b.julian_code)),
    });

  } catch (err: unknown) {
    console.error("Recalculate stock error:", err);
    return NextResponse.json(
      { error: "Recalculation failed: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}
