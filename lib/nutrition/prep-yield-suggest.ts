// Suggest a prep yield % per ingredient from wastage history.
//
// Prep yield = net into the pot ÷ gross used. We estimate the loss from the
// raw-material wastage ledger: only `reason = 'wastage'` write-offs count —
// that category is explicitly "prep, trim, yield loss" (damaged/expired are
// spoilage, not prep). Suggested yield = 1 − (prep waste ÷ amount used in
// production), keyed by EXACT ingredient name (never fuzzy). Advisory only —
// the user reviews and applies each value.

import { supabase } from "@/lib/supabase";
import { fetchAll } from "@/lib/fetchAll";
import { expandRunValues } from "@/lib/production-runs";
import { normaliseName } from "@/lib/nutrition/recipe-calc";

export interface YieldSuggestion {
  usedG: number;
  wasteG: number;
  suggestedPct: number; // 0–100, rounded
}

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Sum ingredient_table usage weights (grams) per normalised ingredient name. */
function addUsageFromAnswer(value: string | null, usedByName: Map<string, number>) {
  for (const v of expandRunValues(value)) {
    try {
      const parsed = JSON.parse(v);
      const rows = Array.isArray(parsed) ? parsed : (parsed?.rows ?? []);
      for (const row of rows) {
        const name = normaliseName(String(row?.name ?? ""));
        if (!name) continue;
        let g = 0;
        for (const rl of (row.lots ?? [])) g += Number(rl.weight_g) || 0;
        if (g > 0) usedByName.set(name, (usedByName.get(name) ?? 0) + g);
      }
    } catch { /* ignore malformed answer */ }
  }
}

/**
 * Compute a suggested prep yield for every ingredient that has BOTH logged prep
 * waste and recorded production usage. Returns a map keyed by normalised name.
 * Runs two paginated queries — call on demand, not on every render.
 */
export async function suggestPrepYields(orgId: string): Promise<Map<string, YieldSuggestion>> {
  const [waste, subs] = await Promise.all([
    fetchAll<{ ingredient_name: string; quantity_written_off_g: number }>((from, to) => supabase
      .from("wastage_log")
      .select("ingredient_name, quantity_written_off_g")
      .eq("organisation_id", orgId)
      .eq("reason", "wastage")
      .order("id")
      .range(from, to)),
    fetchAll<any>((from, to) => supabase
      .from("submissions")
      .select("id, answers(value, question:questions(type))")
      .order("id")
      .range(from, to)),
  ]);

  const wasteByName = new Map<string, number>();
  for (const w of waste) {
    const key = normaliseName(w.ingredient_name);
    const g = Number(w.quantity_written_off_g) || 0;
    if (key && g > 0) wasteByName.set(key, (wasteByName.get(key) ?? 0) + g);
  }

  const usedByName = new Map<string, number>();
  for (const sub of subs) {
    for (const ans of sub.answers ?? []) {
      if (ans.question?.type !== "ingredient_table") continue;
      addUsageFromAnswer(ans.value, usedByName);
    }
  }

  const out = new Map<string, YieldSuggestion>();
  for (const [name, wasteG] of wasteByName) {
    const usedG = usedByName.get(name) ?? 0;
    if (usedG <= 0) continue; // no production usage → can't form a ratio
    out.set(name, { usedG, wasteG, suggestedPct: clampPct(100 * (1 - wasteG / usedG)) });
  }
  return out;
}
