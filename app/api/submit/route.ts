import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { checklist_id, organisation_id, submitted_by, answers, batch_notes } = body;

  if (!checklist_id || !submitted_by || !Array.isArray(answers)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

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

      for (const answer of answers) {
        if (!ingredientQIds.has(answer.question_id) || !answer.value) continue;
        try {
          const rows = JSON.parse(answer.value) as Array<{
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
                  .limit(1)
                  .single();
                if (found) resolvedLotId = found.id;
              }

              if (!resolvedLotId) continue;

              const { data: lot } = await supabaseAdmin
                .from("ingredient_lots")
                .select("quantity_remaining_g")
                .eq("id", resolvedLotId)
                .single();

              if (lot) {
                const newRemaining = Math.max(
                  0,
                  (lot.quantity_remaining_g as number) - used
                );
                await supabaseAdmin
                  .from("ingredient_lots")
                  .update({ quantity_remaining_g: newRemaining })
                  .eq("id", resolvedLotId);
              }
            }
          }
        } catch (e) {
          console.error("Stock deduction error:", e);
        }
      }
    }
  }

  return NextResponse.json({ id: submissionId }, { status: 201 });
}
