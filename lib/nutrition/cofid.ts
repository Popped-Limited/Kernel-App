// CoFID reference lookup for the raw-material nutrition panel.
//
// The dataset (lib/nutrition/cofid.json, built by scripts/cofid/convert_cofid.py)
// is already converted to UK FIC by-weight per-100g values — see
// scripts/cofid/README.md for the methodology. This module only searches it.
//
// Import this module dynamically (`await import("@/lib/nutrition/cofid")`) so the
// ~550KB dataset is code-split out of the page bundle and fetched on first search.

import foods from "./cofid.json";

export interface CofidFood {
  code: string;
  name: string;
  group: string;
  kcal: number;
  kj: number;
  fat: number;
  saturates: number | null;
  carbohydrate: number | null;
  sugars: number | null;
  fibre: number | null;
  protein: number;
  salt: number | null;
}

export const COFID_FOODS = foods as CofidFood[];

// Kitchen vocabulary → CoFID vocabulary. Applied per query token.
const SYNONYMS: Record<string, string[]> = {
  chili: ["chilli"], chile: ["chilli"], chilis: ["chillies"], chilies: ["chillies"],
  cilantro: ["coriander"], scallion: ["onions", "spring"], scallions: ["onions", "spring"],
  eggplant: ["aubergine"], zucchini: ["courgette"], garbanzo: ["chick", "pea"],
  cornstarch: ["cornflour"], shrimp: ["prawns"], rutabaga: ["swede"],
  cane: ["sugar"], caster: ["sugar"], groundnut: ["peanut"], rapeseed: ["rapeseed"],
  bicarb: ["bicarbonate"], allium: ["onions"],
};

const tokenise = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean);

/**
 * Token-prefix search over the CoFID food names. Every query token must
 * prefix-match a token of the food name (after synonym expansion); results are
 * ranked so short, generic entries ("Garlic, raw") beat long composite dishes,
 * and matches on the first name token rank above matches buried mid-name.
 */
export function searchCofid(query: string, limit = 12): CofidFood[] {
  const qTokens = tokenise(query);
  if (qTokens.length === 0) return [];

  const scored: Array<{ f: CofidFood; score: number }> = [];

  for (const f of COFID_FOODS) {
    const nTokens = tokenise(f.name);
    let score = 0;
    let ok = true;
    for (const q of qTokens) {
      const variants = [q, ...(SYNONYMS[q] ?? [])];
      let best = 0;
      for (const v of variants) {
        for (let i = 0; i < nTokens.length; i++) {
          if (nTokens[i] === v) best = Math.max(best, i === 0 ? 30 : 20);
          else if (nTokens[i].startsWith(v)) best = Math.max(best, i === 0 ? 15 : 10);
        }
      }
      if (best === 0) { ok = false; break; }
      score += best;
    }
    if (!ok) continue;
    // Prefer short names (generic foods) over long composite-dish entries, and
    // raw/unprocessed entries — the state most raw materials arrive in.
    score -= nTokens.length * 2;
    if (/,\s*raw\b/i.test(f.name)) score += 6;
    scored.push({ f, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.f.name.length - b.f.name.length)
    .slice(0, limit)
    .map((s) => s.f);
}
