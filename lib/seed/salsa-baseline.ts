import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import baseline from "./salsa-baseline.json";

// Seeds a brand-new organisation with the SALSA baseline: the 20 generic
// compliance checklists (+ their questions) and the training-programme items.
// The template is frozen in salsa-baseline.json (rebuild via
// scripts/build-salsa-baseline.mjs). Everything else — production records,
// suppliers, ingredients, staff — is intentionally left blank per org.
//
// Best-effort: a seeding failure must never block account creation. Returns a
// summary so the caller can log it.
export async function seedSalsaBaseline(orgId: string): Promise<{
  checklists: number;
  questions: number;
  trainingItems: number;
  errors: string[];
}> {
  const errors: string[] = [];

  const checklistRows: Record<string, unknown>[] = [];
  const questionRows: Record<string, unknown>[] = [];

  for (const cl of baseline.checklists) {
    const checklistId = randomUUID();
    checklistRows.push({
      id: checklistId,
      organisation_id: orgId,
      name: cl.name,
      frequency: cl.frequency,
      description: cl.description,
      active: cl.active,
      category: cl.category,
      color: cl.color,
    });
    for (const q of cl.questions) {
      questionRows.push({
        id: randomUUID(),
        organisation_id: orgId,
        checklist_id: checklistId,
        label: q.label,
        type: q.type,
        required: q.required,
        order_index: q.order_index,
        options: q.options,
        hint: q.hint,
        follow_up: q.follow_up,
        document_path: q.document_path,
        document_required: q.document_required,
      });
    }
  }

  const trainingRows = baseline.training_items.map((t) => ({
    id: randomUUID(),
    organisation_id: orgId,
    name: t.name,
    sort_order: t.sort_order,
    active: t.active,
    document_path: t.document_path,
  }));

  // Parent before child so the FK from questions → checklists holds.
  const { error: clErr } = await supabaseAdmin.from("checklists").insert(checklistRows);
  if (clErr) errors.push(`checklists: ${clErr.message}`);

  if (!clErr) {
    const { error: qErr } = await supabaseAdmin.from("questions").insert(questionRows);
    if (qErr) errors.push(`questions: ${qErr.message}`);
  }

  const { error: tiErr } = await supabaseAdmin.from("training_items").insert(trainingRows);
  if (tiErr) errors.push(`training_items: ${tiErr.message}`);

  return {
    checklists: clErr ? 0 : checklistRows.length,
    questions: clErr ? 0 : questionRows.length,
    trainingItems: tiErr ? 0 : trainingRows.length,
    errors,
  };
}
