import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Claude reads the whole PDF; extraction on a multi-page spec can take ~30s.
export const maxDuration = 60;

/**
 * POST /api/extract-spec-nutrition  { ingredient_id }
 *
 * Reads the ingredient's most recent spec sheet (PDF/image) and extracts the
 * FIC per-100g nutrition declaration with Claude. Returns the values for the
 * nutrition form to PRE-FILL — nothing is saved here; the user reviews and
 * saves through the normal panel, so a human always confirms what goes on
 * the record.
 */

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "energy_kcal", "energy_kj", "fat_g", "saturates_g", "carbohydrate_g",
    "sugars_g", "fibre_g", "protein_g", "salt_g",
    "basis", "salt_converted_from_sodium", "warnings",
  ],
  properties: {
    energy_kcal:    { type: ["number", "null"] },
    energy_kj:      { type: ["number", "null"] },
    fat_g:          { type: ["number", "null"] },
    saturates_g:    { type: ["number", "null"] },
    carbohydrate_g: { type: ["number", "null"] },
    sugars_g:       { type: ["number", "null"] },
    fibre_g:        { type: ["number", "null"] },
    protein_g:      { type: ["number", "null"] },
    salt_g:         { type: ["number", "null"] },
    // What the numbers were read from — anything but per_100g needs a human look
    basis: { type: "string", enum: ["per_100g", "per_100ml", "per_serving_only", "not_found"] },
    salt_converted_from_sodium: { type: "boolean" },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

const EXTRACTION_PROMPT = `Extract the nutrition declaration from this supplier specification sheet.

Rules:
- Use the "per 100g" (or "per 100ml") column of the nutrition table — NEVER a per-serving/per-portion column. If only per-serving values exist, return all values as null and set basis to "per_serving_only".
- Values must be for the product as sold, exactly as printed. Do not calculate, estimate or guess a value that is not stated — return null for anything the document doesn't state.
- Energy: capture both kJ and kcal if printed; if only one is printed, return the other as null.
- Salt: if the document states salt, use it. If it states only sodium, convert: salt_g = sodium_g × 2.5 (watch the units — sodium is often in mg), and set salt_converted_from_sodium to true.
- "of which saturates" → saturates_g; "of which sugars" → sugars_g; fibre/dietary fibre → fibre_g.
- Add a warning string for anything a reviewer should check: per-100ml basis, values that don't look like this ingredient, unreadable/ambiguous numbers, sodium conversion performed, multiple nutrition tables found, etc.
- If the document has no nutrition information at all, return all values as null and basis "not_found".`;

const IMAGE_TYPES: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
};

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Spec sheet extraction isn't configured yet (missing ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  const { ingredient_id } = await req.json();
  if (!ingredient_id) return NextResponse.json({ error: "ingredient_id required" }, { status: 400 });

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
  const { data: ingredient } = await supabaseAdmin
    .from("ingredients")
    .select("id, name, organisation_id")
    .eq("id", ingredient_id)
    .single();
  if (!ingredient || ingredient.organisation_id !== orgId) {
    return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
  }

  const { data: doc } = await supabaseAdmin
    .from("documents")
    .select("file_path, file_name, organisation_id")
    .eq("entity_type", "ingredient")
    .eq("entity_id", ingredient_id)
    .eq("doc_type", "spec_sheet")
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!doc || doc.organisation_id !== orgId) {
    return NextResponse.json({ error: "No spec sheet uploaded for this ingredient" }, { status: 404 });
  }

  const { data: file, error: dlErr } = await supabaseAdmin.storage
    .from("compliance-docs")
    .download(doc.file_path);
  if (dlErr || !file) {
    return NextResponse.json({ error: "Couldn't read the spec sheet file" }, { status: 500 });
  }
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  const ext = (doc.file_name.split(".").pop() ?? "").toLowerCase();
  const fileBlock =
    ext === "pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } }
      : IMAGE_TYPES[ext]
      ? { type: "image" as const, source: { type: "base64" as const, media_type: IMAGE_TYPES[ext], data: base64 } }
      : null;
  if (!fileBlock) {
    return NextResponse.json({ error: `Can't extract from .${ext} files — upload the spec as a PDF or image` }, { status: 400 });
  }

  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
      messages: [{
        role: "user",
        content: [
          fileBlock,
          { type: "text", text: `${EXTRACTION_PROMPT}\n\nThe ingredient this spec sheet belongs to: "${ingredient.name}".` },
        ],
      }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "The document couldn't be processed" }, { status: 422 });
    }
    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return NextResponse.json({ error: "No extraction returned — try again" }, { status: 502 });

    return NextResponse.json({ extraction: JSON.parse(text), file_name: doc.file_name });
  } catch (e) {
    console.error("Spec extraction failed:", e);
    return NextResponse.json({ error: "Extraction failed — try again in a moment" }, { status: 502 });
  }
}
