import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { checklist_id, organisation_id, submitted_by, answers } = body;

  if (!checklist_id || !submitted_by || !Array.isArray(answers)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Create submission (uses anon client + permissive INSERT policy)
  const { data: submission, error: subErr } = await supabaseServer
    .from("submissions")
    .insert({ checklist_id, submitted_by, signed_off_by: null, signed_off_at: null, notes: null, organisation_id: organisation_id ?? null })
    .select("id")
    .single();

  if (subErr || !submission) {
    console.error("Submission insert error:", subErr);
    return NextResponse.json({ error: "Failed to create submission", detail: subErr?.message }, { status: 500 });
  }

  // Insert answers (uses anon client + permissive INSERT policy)
  const answerRows = (answers as { question_id: string; value: string | null }[]).map((a) => ({
    submission_id: submission.id,
    question_id: a.question_id,
    value: a.value,
    organisation_id: organisation_id ?? null,
  }));

  const { error: ansErr } = await supabaseServer.from("answers").insert(answerRows);

  if (ansErr) {
    console.error("Answer insert error:", ansErr);
    await supabaseServer.from("submissions").delete().eq("id", submission.id);
    return NextResponse.json({ error: "Failed to save answers", detail: ansErr?.message }, { status: 500 });
  }

  // Deduct ingredient stock for any ingredient_table answers
  // Uses admin client — if unavailable, stock deduction is skipped but submission is saved
  const ingredientAnswers = answers.filter((a) => a.value);
  if (ingredientAnswers.length > 0 && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const questionIds = ingredientAnswers.map((a) => a.question_id);
    const { data: questions } = await supabaseAdmin
      .from("questions")
      .select("id, type")
      .in("id", questionIds);

    const ingredientQIds = new Set(
      (questions ?? []).filter((q: { id: string; type: string }) => q.type === "ingredient_table").map((q: { id: string; type: string }) => q.id)
    );

    for (const answer of answers) {
      if (!ingredientQIds.has(answer.question_id) || !answer.value) continue;
      try {
        const rows = JSON.parse(answer.value) as Array<{
          lots: Array<{ lot_id?: string; weight_g: string }>;
        }>;
        for (const row of rows) {
          for (const lotUse of row.lots ?? []) {
            if (!lotUse.lot_id || !lotUse.weight_g) continue;
            const used = Number(lotUse.weight_g);
            if (!used || used <= 0) continue;
            const { data: lot } = await supabaseAdmin
              .from("ingredient_lots")
              .select("quantity_remaining_g")
              .eq("id", lotUse.lot_id)
              .single();
            if (lot) {
              const newRemaining = Math.max(0, (lot.quantity_remaining_g as number) - used);
              await supabaseAdmin.from("ingredient_lots")
                .update({ quantity_remaining_g: newRemaining })
                .eq("id", lotUse.lot_id);
            }
          }
        }
      } catch (e) {
        console.error("Stock deduction error:", e);
      }
    }
  }

  return NextResponse.json({ id: submission.id }, { status: 201 });
}
