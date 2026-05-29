import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * POST /api/admin/recalculate-stock
 *
 * Admin-only. Rebuilds every ingredient_lot's quantity_remaining_g from
 * scratch by:
 *   1. Resetting all lots to their original quantity_received_g
 *   2. Replaying every ingredient_table answer ever submitted for this org,
 *      resolving by lot_id where available, julian_code as fallback
 *
 * This corrects any historical discrepancies where deductions were missed
 * (e.g. when a manual julian_code entry meant lot_id was never set).
 */
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
      .select("id")
      .in("checklist_id", checklistIds)
      .eq("type", "ingredient_table");

    const ingQIds = (ingQuestions ?? []).map((q: { id: string }) => q.id);
    if (ingQIds.length === 0) {
      return NextResponse.json({ success: true, message: "No ingredient questions", deductions: 0 });
    }

    // ── Step 3: Fetch every ingredient_table answer ever submitted ─────────
    const { data: allAnswers } = await supabaseAdmin
      .from("answers")
      .select("question_id, value")
      .in("question_id", ingQIds)
      .not("value", "is", null);

    // Accumulate total grams used per lot
    const usage = new Map<string, number>(); // lotId → total grams used
    let deductionCount = 0;

    for (const answer of allAnswers ?? []) {
      if (!answer.value) continue;
      try {
        const rows = JSON.parse(answer.value) as Array<{
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

    // ── Step 4: Apply accumulated deductions ───────────────────────────────
    const results: Array<{ julian_code: string; received_g: number; used_g: number; remaining_g: number }> = [];

    for (const [lotId, totalUsed] of usage) {
      const lot = lotById.get(lotId);
      if (!lot) continue;
      const remaining = Math.max(0, lot.quantity_received_g - totalUsed);
      await supabaseAdmin
        .from("ingredient_lots")
        .update({ quantity_remaining_g: remaining })
        .eq("id", lotId);

      const code = lots.find(l => l.id === lotId)?.julian_code ?? lotId;
      results.push({
        julian_code:  code,
        received_g:   lot.quantity_received_g,
        used_g:       Math.round(totalUsed),
        remaining_g:  remaining,
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
