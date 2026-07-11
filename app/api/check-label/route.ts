import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Claude reads the whole artwork; a detailed multi-panel label can take ~30s.
export const maxDuration = 60;

/**
 * POST /api/check-label  { artwork_id }
 *
 * Reads a label artwork (PDF/image) and checks it for the PRESENCE of the 8
 * FIC mandatory particulars. This is a presence check only — the prompt and
 * the UI both refuse any claim of legal compliance; the user verifies before
 * print. The result is stored on the artwork version's row, so every version
 * keeps its own check in the label's history.
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
      type: "array",
      minItems: 8,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "status", "evidence"],
        properties: {
          key: { type: "string", enum: [...PARTICULARS] },
          status: { type: "string", enum: ["included", "not_found", "unclear"] },
          evidence: { type: "string" },
        },
      },
    },
    overall_notes: { type: "array", items: { type: "string" } },
  },
} as const;

const CHECK_PROMPT = `You are checking a UK/EU food label artwork for the PRESENCE of the 8 mandatory FIC particulars. This is a presence check only — you must NEVER state or imply that the label is legally compliant, approved, or reviewed. Report only whether each section is visibly present on the artwork.

For each of the 8 particulars return status:
- "included" — you can clearly see it. Evidence: quote the exact text you saw (keep it short).
- "not_found" — you looked and it is not on the artwork. Evidence: "".
- "unclear" — something might be it but you cannot be sure (cut off, illegible, ambiguous). Evidence: say what you saw and why it is unclear.
Never guess. If in doubt, use "unclear", not "included". Report each particular exactly once, in the order listed.

The 8 particulars:
1. name_of_food — the name of the food (legal/customary/descriptive name, not just the brand name).
2. ingredients_list — an ingredients list headed "Ingredients". The order should be descending weight, but you are only checking that a list is present; note in evidence if it has no heading.
3. allergen_emphasis — allergens emphasised WITHIN the ingredients list (bold, capitals or underline). "included" only if emphasis is visible inside the list itself; a separate allergen box alone is "unclear" (say so in evidence). If the artwork rendering does not let you distinguish emphasis, use "unclear".
4. quid — a QUID percentage (e.g. "chilli (48%)") for ingredients highlighted in the product name or imagery. If no ingredient appears to need QUID, still report what you saw.
5. net_quantity — net quantity with units (e.g. 227g, 250ml), including the ℮ mark if present.
6. date_marking — "best before" / "best before end" / "use by" wording, OR a clearly labelled space where the date will be printed at packing (say which in evidence).
7. storage_conditions — storage conditions and/or instructions for use (e.g. "Once opened refrigerate and use within 4 weeks").
8. business_name_address — the food business name AND a postal address. A website or social handle alone is not an address — that is "unclear" or "not_found".

overall_notes: anything a human should double-check — low resolution, multiple label panels, foreign language, artwork that appears to be a die-line with placeholder text, etc. Do not include compliance opinions or legal language anywhere in your output.`;

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
          { type: "text", text: `${CHECK_PROMPT}\n\nThe product this label belongs to: "${artwork.product_name}".` },
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
