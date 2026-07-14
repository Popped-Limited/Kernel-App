import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAll } from "@/lib/fetchAll";
import {
  computeNutrition, normaliseName,
  type RecipeRow, type IngredientData,
} from "@/lib/nutrition/recipe-calc";

// Claude reads the whole artwork; a detailed multi-panel label can take ~30s.
export const maxDuration = 60;

/**
 * POST /api/check-label  { artwork_id }
 *
 * Reads a label artwork (PDF/image) and checks the 8 FIC mandatory particulars
 * are present AND consistent with the product's own recipe data (product name,
 * ingredient declaration, allergens, QUID ingredients, net weight) — so a label
 * for the wrong product comes back as "mismatch", not a row of green ticks.
 * Still never a claim of legal compliance; the user verifies before print. The
 * result is stored on the artwork version's row, so every version keeps its
 * own check in the label's history.
 */

const PARTICULARS = [
  "name_of_food", "ingredients_list", "allergen_emphasis", "quid",
  "net_quantity", "date_marking", "storage_conditions", "business_name_address",
] as const;

const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["particulars", "overall_notes"],
  properties: {
    particulars: {
      // Structured-output schemas only allow array minItems/maxItems of 0 or 1,
      // so the count of 8 is enforced by the prompt + the fixed `key` enum, not here.
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "status", "evidence"],
        properties: {
          key: { type: "string", enum: [...PARTICULARS] },
          status: { type: "string", enum: ["included", "mismatch", "not_found", "unclear"] },
          evidence: { type: "string" },
        },
      },
    },
    overall_notes: { type: "array", items: { type: "string" } },
  },
} as const;

/** What Kernel expects the label to say, computed from the product's recipe. */
interface ExpectedData {
  recipeFound: boolean;
  /** Descending weight order; quid = named in the product title. */
  declaration: { name: string; percent: number; quid: boolean }[];
  contains: string[];
  netWeightG: number | null;
}

/**
 * Load the product's recipe-derived declaration with the caller's own
 * RLS-scoped client (not the admin client — some tables have no service_role
 * grant, and RLS keeps this org-safe for free). Any failure — including the
 * pending product_nutrition_settings migration — degrades to a presence-only
 * check rather than blocking the label check.
 */
async function loadExpectedData(
  supabase: SupabaseClient,
  orgId: string,
  productName: string,
): Promise<ExpectedData> {
  const empty: ExpectedData = { recipeFound: false, declaration: [], contains: [], netWeightG: null };
  try {
    const { data: checklists } = await supabase
      .from("checklists")
      .select("name, questions(type, options)")
      .eq("organisation_id", orgId)
      .eq("category", "Production");

    const target = normaliseName(productName);
    let recipe: RecipeRow[] = [];
    let found = false;
    for (const cl of (checklists ?? []) as { name: string; questions: { type: string; options: string[] | null }[] }[]) {
      const clProduct = normaliseName(cl.name.replace(/\s*[—–-]+\s*Production Record\s*$/i, ""));
      if (clProduct !== target) continue;
      found = true;
      const q = (cl.questions ?? []).find((x) => x.type === "ingredient_table");
      recipe = (q?.options ?? [])
        .map((o) => {
          const [name, grams] = String(o).split("|");
          return { name: (name ?? "").trim(), grams: Number(grams) || 0 };
        })
        .filter((r) => r.name);
      break;
    }
    if (!found || recipe.length === 0) return empty;

    // Allergens only — deliberately not the nutrition columns, so the check
    // works even before the nutrition migration has been run.
    const ings = await fetchAll<{ name: string; allergens: string[] | null; may_contain_allergens: string[] | null }>(
      (from, to) => supabase
        .from("ingredients")
        .select("name, allergens, may_contain_allergens")
        .eq("organisation_id", orgId)
        .order("name")
        .range(from, to),
    );
    const map = new Map<string, IngredientData>();
    for (const i of ings) {
      map.set(normaliseName(i.name), {
        nutrition: null, basis: "per_100g", densityGPerL: null,
        allergens: i.allergens ?? [], mayContain: i.may_contain_allergens ?? [],
        pricePerKg: null, unit: "g",
      });
    }

    // Prep yields + net weight refine the QUID %s; the table may not exist yet.
    const prepYields = new Map<string, number>();
    let netWeightG: number | null = null;
    const esc = productName.replace(/([%_\\])/g, "\\$1");
    const { data: ps } = await supabase
      .from("product_nutrition_settings")
      .select("prep_yields, net_weight_per_unit_g")
      .eq("organisation_id", orgId)
      .ilike("product_name", esc)
      .maybeSingle();
    if (ps) {
      for (const [k, v] of Object.entries((ps.prep_yields ?? {}) as Record<string, number>)) {
        prepYields.set(normaliseName(k), Number(v) || 1);
      }
      netWeightG = ps.net_weight_per_unit_g != null ? Number(ps.net_weight_per_unit_g) : null;
    }

    const result = computeNutrition({
      recipe, ingredients: map, prepYields,
      netWeightPerUnitG: null, unitsPerBatch: null, productName,
    });
    return {
      recipeFound: true,
      declaration: result.declaration.map((d) => ({ name: d.name, percent: d.percent, quid: d.quid })),
      contains: result.contains,
      netWeightG,
    };
  } catch {
    return empty;
  }
}

function buildPrompt(productName: string, expected: ExpectedData): string {
  const fmtPct = (p: number) => `${p.toFixed(p < 10 ? 1 : 0)}%`;
  const quidRows = expected.declaration.filter((d) => d.quid);

  const expectedBlock = expected.recipeFound
    ? `WHAT KERNEL'S RECORDS SAY THIS LABEL SHOULD SHOW (compare the artwork against this):
- Product name: "${productName}"
- Recipe ingredients, descending weight: ${expected.declaration.map((d) => d.name).join(", ")}
- Allergens that must be emphasised in the list: ${expected.contains.length ? expected.contains.join(", ") : "none recorded in Kernel"}
- Ingredients named in the product title, which need a QUID %: ${quidRows.length ? quidRows.map((d) => `${d.name} (calculated ≈${fmtPct(d.percent)})`).join(", ") : "none identified"}${expected.netWeightG ? `\n- Net weight per unit: ${expected.netWeightG}g` : ""}`
    : `WHAT KERNEL'S RECORDS SAY: the product is "${productName}". No recipe definition was found, so for the ingredients list, allergens and QUID you can only check presence — but the product NAME must still match.`;

  const ingredientsRule = expected.recipeFound
    ? `an ingredients list headed "Ingredients", consistent with the expected recipe above. The label may add water, sub-ingredients of a compound ingredient, or more specific names (e.g. "rapeseed oil" for "oil") — that is fine. But if the list is clearly a different recipe (most expected ingredients absent, or major ingredients present that are not in the recipe at all), that is "mismatch": quote the label's list. Note in evidence if the list has no heading.`
    : `an ingredients list headed "Ingredients". The order should be descending weight, but you are only checking that a list is present; note in evidence if it has no heading.`;

  const allergenRule = expected.recipeFound && expected.contains.length
    ? `the expected allergens (${expected.contains.join(", ")}) emphasised WITHIN the ingredients list (bold, capitals or underline). "included" only if the expected allergens appear in the list with visible emphasis. If an expected allergen is missing from the list entirely, that is "mismatch". A separate allergen box alone is "unclear" (say so in evidence). If the artwork rendering does not let you distinguish emphasis, use "unclear".`
    : `allergens emphasised WITHIN the ingredients list (bold, capitals or underline). "included" only if emphasis is visible inside the list itself; a separate allergen box alone is "unclear" (say so in evidence). If the artwork rendering does not let you distinguish emphasis, use "unclear".`;

  const quidRule = expected.recipeFound && quidRows.length
    ? `QUID percentages for the ingredients named in the product title: ${quidRows.map((d) => `${d.name} (≈${fmtPct(d.percent)})`).join(", ")}. "included" only if a % appears against those ingredients. Small differences from the calculated % are fine (recipes get rounded), but a % only on unrelated ingredients, on a different product's ingredients, or wildly different from the calculation is "mismatch" — quote what the label shows. A % somewhere on the label does NOT count unless it is attached to the right ingredient.`
    : `a QUID percentage (e.g. "chilli (48%)") for ingredients highlighted in the product name or imagery. If no ingredient appears to need QUID, still report what you saw.`;

  const netQuantityRule = expected.netWeightG
    ? `net quantity with units (e.g. 227g, 250ml), including the ℮ mark if present. Kernel expects ${expected.netWeightG}g per unit — a clearly different figure is "mismatch" (quote it).`
    : `net quantity with units (e.g. 227g, 250ml), including the ℮ mark if present.`;

  return `You are checking a UK/EU food label artwork against the maker's own recipe records: is each of the 8 mandatory FIC particulars PRESENT, and does it MATCH this product's data? You must NEVER state or imply that the label is legally compliant, approved, or reviewed.

${expectedBlock}

For each of the 8 particulars return status:
- "included" — clearly present AND consistent with the expected details above. Evidence: quote the exact text you saw (keep it short).
- "mismatch" — the section is present but contradicts the expected details (a different product's name, a different recipe's ingredients, QUID on the wrong ingredient, wrong net weight). Evidence: quote what the label says AND what was expected.
- "not_found" — you looked and it is not on the artwork. Evidence: "".
- "unclear" — something might be it but you cannot be sure (cut off, illegible, ambiguous). Evidence: say what you saw and why it is unclear.
Never guess. A section that is present but belongs to a different product is "mismatch", never "included". If in doubt between "included" and "unclear", use "unclear". Report each particular exactly once, in the order listed.

The 8 particulars:
1. name_of_food — the name of THIS product: "${productName}". Minor styling differences (capitalisation, punctuation, a brand name alongside) are fine, but do NOT mark "included" just because some product name is present — if the label names a different product, that is "mismatch": quote the name you see.
2. ingredients_list — ${ingredientsRule}
3. allergen_emphasis — ${allergenRule}
4. quid — ${quidRule}
5. net_quantity — ${netQuantityRule}
6. date_marking — "best before" / "best before end" / "use by" wording, OR a clearly labelled space where the date will be printed at packing (say which in evidence).
7. storage_conditions — storage conditions and/or instructions for use (e.g. "Once opened refrigerate and use within 4 weeks").
8. business_name_address — the food business name AND a postal address. A website or social handle alone is not an address — that is "unclear" or "not_found".

overall_notes: anything a human should double-check — low resolution, multiple label panels, foreign language, artwork that appears to be a die-line with placeholder text, or a label that looks like it belongs to a different product entirely. Do not include compliance opinions or legal language anywhere in your output.`;
}

const IMAGE_TYPES: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
};

const MODEL = "claude-opus-4-8";

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Label checking isn't configured yet (missing ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  const { artwork_id } = await req.json();
  if (!artwork_id) return NextResponse.json({ error: "artwork_id required" }, { status: 400 });

  // ── Auth: any signed-in member; everything below is scoped to their org ────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: membership } = await supabaseAdmin
    .from("organisation_members")
    .select("organisation_id")
    .eq("user_id", user.id)
    .single();
  if (!membership) return NextResponse.json({ error: "No organisation" }, { status: 403 });
  const orgId = membership.organisation_id;

  // The admin client bypasses RLS — every read below must assert the org.
  const { data: artwork } = await supabaseAdmin
    .from("label_artworks")
    .select("id, product_name, file_name, file_path, organisation_id")
    .eq("id", artwork_id)
    .single();
  if (!artwork || artwork.organisation_id !== orgId) {
    return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
  }

  const { data: file, error: dlErr } = await supabaseAdmin.storage
    .from("compliance-docs")
    .download(artwork.file_path);
  if (dlErr || !file) {
    return NextResponse.json({ error: "Couldn't read the artwork file" }, { status: 500 });
  }
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  // The recipe-derived expectations the artwork is checked against (falls back
  // to a presence-only check when the product has no recipe defined).
  const expected = await loadExpectedData(supabase, orgId, artwork.product_name);

  const ext = (artwork.file_name.split(".").pop() ?? "").toLowerCase();
  const fileBlock =
    ext === "pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } }
      : IMAGE_TYPES[ext]
      ? { type: "image" as const, source: { type: "base64" as const, media_type: IMAGE_TYPES[ext], data: base64 } }
      : null;
  if (!fileBlock) {
    return NextResponse.json({ error: `Can't check .${ext} files — upload the label as a PDF, PNG or JPEG` }, { status: 400 });
  }

  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: CHECK_SCHEMA } },
      messages: [{
        role: "user",
        content: [
          fileBlock,
          { type: "text", text: buildPrompt(artwork.product_name, expected) },
        ],
      }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "The artwork couldn't be processed" }, { status: 422 });
    }
    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return NextResponse.json({ error: "No check result returned — try again" }, { status: 502 });

    const check_result = JSON.parse(text);
    const check_run_at = new Date().toISOString();

    // Persist on the artwork version's row (org already asserted above)
    const { error: saveErr } = await supabaseAdmin
      .from("label_artworks")
      .update({ check_result, check_run_at, check_model: MODEL })
      .eq("id", artwork.id);
    if (saveErr) console.error("Label check ran but failed to save:", saveErr);

    return NextResponse.json({ check_result, check_run_at, file_name: artwork.file_name });
  } catch (e) {
    console.error("Label check failed:", e);
    return NextResponse.json({ error: "Check failed — try again in a moment" }, { status: 502 });
  }
}
