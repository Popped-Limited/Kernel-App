import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { checklist_id, organisation_id, submitted_by, answers, batch_notes, team_member_id, run_count, run_meta } = body;

  if (!checklist_id || !submitted_by || !Array.isArray(answers)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // A multi-run record ships each repeating answer as { __runs__: [v0, v1, …] }
  // where each element is a normal single-run value string. Expand to the flat
  // list of per-run values for stock deduction; single-run values pass through.
  const runValues = (value: string | null): string[] => {
    if (!value) return [value as string];
    try {
      const parsed = JSON.parse(value);
      if (parsed && Array.isArray(parsed.__runs__)) return parsed.__runs__ as string[];
    } catch { /* not a runs wrapper */ }
    return [value];
  };

  // Use a SECURITY DEFINER RPC function to insert submission + answers,
  // bypassing RLS without needing the service role key.
  const { data: submissionId, error: rpcErr } = await supabaseServer.rpc(
    "submit_checklist_response",
    {
      p_checklist_id: checklist_id,
      p_organisation_id: organisation_id ?? null,
      p_submitted_by: submitted_by,
      p_answers: answers,
    }
  );

  if (rpcErr || !submissionId) {
    console.error("Submission RPC error:", rpcErr);
    return NextResponse.json(
      { error: "Failed to create submission", detail: rpcErr?.message },
      { status: 500 }
    );
  }

  // Save batch notes if provided
  if (batch_notes) {
    await supabaseAdmin
      .from("submissions")
      .update({ batch_notes })
      .eq("id", submissionId);
  }

  // Record multi-run metadata so the report can show each run as its own batch
  // record. Single-run records leave these at their defaults (run_count = 1).
  if (Number(run_count) > 1) {
    await supabaseAdmin
      .from("submissions")
      .update({ run_count: Number(run_count), run_meta: run_meta ?? null })
      .eq("id", submissionId);
  }

  // Link the submission to a team member (Employee Induction Record in the
  // training portal) so the matrix can show it as Completed for that person.
  if (team_member_id) {
    await supabaseAdmin
      .from("submissions")
      .update({ team_member_id })
      .eq("id", submissionId);
  }

  // Deduct ingredient stock for any ingredient_table answers
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const questionIds = answers
      .filter((a: { value: string | null }) => a.value)
      .map((a: { question_id: string }) => a.question_id);

    if (questionIds.length > 0) {
      const { data: questions } = await supabaseAdmin
        .from("questions")
        .select("id, type")
        .in("id", questionIds);

      const ingredientQIds = new Set(
        (questions ?? [])
          .filter((q: { id: string; type: string }) => q.type === "ingredient_table")
          .map((q: { id: string; type: string }) => q.id)
      );
      const packingQIds = new Set(
        (questions ?? [])
          .filter((q: { id: string; type: string }) => q.type === "packing_runs")
          .map((q: { id: string; type: string }) => q.id)
      );

      // Deduct `amount` units from a lot's remaining quantity (shared by ingredients
      // and primary packaging — both live in ingredient_lots).
      async function deductLot(lotId: string, amount: number) {
        if (!lotId || !amount || amount <= 0) return;
        const { data: lot } = await supabaseAdmin
          .from("ingredient_lots")
          .select("quantity_remaining_g")
          .eq("id", lotId)
          .eq("organisation_id", organisation_id)
          .single();
        if (!lot) return;
        const newRemaining = Math.max(0, (lot.quantity_remaining_g as number) - amount);
        await supabaseAdmin
          .from("ingredient_lots")
          .update({ quantity_remaining_g: newRemaining })
          .eq("id", lotId)
          .eq("organisation_id", organisation_id);
      }

      for (const answer of answers) {
        if (!ingredientQIds.has(answer.question_id) || !answer.value) continue;
        for (const value of runValues(answer.value)) {
        if (!value) continue;
        try {
          const parsedVal = JSON.parse(value);
          const rows = (Array.isArray(parsedVal) ? parsedVal : (parsedVal?.rows ?? [])) as Array<{
            lots: Array<{ lot_id?: string; julian_code?: string; weight_g: string }>;
          }>;

          for (const row of rows) {
            for (const lotUse of row.lots ?? []) {
              if (!lotUse.weight_g) continue;
              const used = Number(lotUse.weight_g);
              if (!used || used <= 0) continue;

              // Resolve the lot — prefer lot_id, fall back to julian_code lookup.
              // This handles the case where the form used a manual text input
              // (no dropdown) so lot_id was never set.
              let resolvedLotId = lotUse.lot_id ?? null;

              if (!resolvedLotId && lotUse.julian_code?.trim()) {
                const { data: found } = await supabaseAdmin
                  .from("ingredient_lots")
                  .select("id")
                  .eq("julian_code", lotUse.julian_code.trim())
                  .eq("organisation_id", organisation_id)
                  .limit(1)
                  .single();
                if (found) resolvedLotId = found.id;
              }

              if (!resolvedLotId) continue;

              const { data: lot } = await supabaseAdmin
                .from("ingredient_lots")
                .select("quantity_remaining_g")
                .eq("id", resolvedLotId)
                .eq("organisation_id", organisation_id)
                .single();

              if (lot) {
                const newRemaining = Math.max(
                  0,
                  (lot.quantity_remaining_g as number) - used
                );
                await supabaseAdmin
                  .from("ingredient_lots")
                  .update({ quantity_remaining_g: newRemaining })
                  .eq("id", resolvedLotId)
                  .eq("organisation_id", organisation_id);
              }
            }
          }
        } catch (e) {
          console.error("Stock deduction error:", e);
        }
        }
      }

      // Deduct primary packaging from the packing log's lot-linked runs
      for (const answer of answers) {
        if (!packingQIds.has(answer.question_id) || !answer.value) continue;
        for (const value of runValues(answer.value)) {
        if (!value) continue;
        try {
          const runs = JSON.parse(value);
          if (!Array.isArray(runs)) continue;
          for (const run of runs) {
            const jarsUsed = Number(run.jars_used);
            if (run.jar_lot_id && jarsUsed > 0) await deductLot(run.jar_lot_id, jarsUsed);
            const lidsUsed = Number(run.lids_count);
            if (run.lids_lot_id && lidsUsed > 0) await deductLot(run.lids_lot_id, lidsUsed);
          }
        } catch (e) {
          console.error("Packaging deduction error:", e);
        }
        }
      }
    }
  }

  return NextResponse.json({ id: submissionId }, { status: 201 });
}
