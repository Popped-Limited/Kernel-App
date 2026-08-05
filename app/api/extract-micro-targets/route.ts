import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Claude reads up to 3 lab reports; extraction can take ~30s.
export const maxDuration = 60;

/**
 * POST /api/extract-micro-targets  { product_name }
 *
 * Reads the product's uploaded lab test reports (lab_tests rows with a file)
 * and extracts the microbiological tests, their specification limits and the
 * measured results with Claude. Returns them for the spec sheet's micro table
 * to PRE-FILL — nothing is saved here, so a human always confirms the limits
 * that go onto a customer-facing specification.
 */

// Newest reports first, capped: a spec sheet needs the current limits, not the
// whole archive, and every extra PDF costs tokens and latency.
const MAX_REPORTS = 3;

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tests", "warnings"],
  properties: {
    tests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["test", "target", "result", "source"],
        properties: {
          // Organism/determination as printed, normalised to its usual spelling
          test: { type: "string" },
          // The specification limit if the report states one, else ""
          target: { type: "string" },
          // The measured result for this test, if printed, else ""
          result: { type: "string" },
          // Which report this row came from (file name), for the review list
          source: { type: "string" },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

const EXTRACTION_PROMPT = `Extract the MICROBIOLOGICAL tests from these laboratory report(s) for a finished food product.

WHAT TO EXTRACT
- One entry per microbiological determination reported (e.g. Enterobacteriaceae, E. coli, Salmonella spp., Listeria spp. / Listeria monocytogenes, Bacillus cereus, Staphylococcus aureus, Clostridium perfringens, Yeasts, Moulds, Total viable count / Aerobic colony count, Lactic acid bacteria).
- Ignore non-microbiological determinations entirely — do NOT return nutrition values, pH, water activity, allergen results, heavy metals, or shelf-life observations.

test
- The organism or determination name as printed. Normalise obvious variants to the standard spelling (e.g. "E.coli" -> "E. coli", "Yeast and Mould" -> "Yeasts & moulds"), but never invent a test that isn't in the document.

target (the specification LIMIT, not the measured result)
- Use the limit only where the document states one — a "Specification", "Limit", "Target", "Criteria", "Acceptable" or "Guideline" column, or wording such as "must be <100 cfu/g" or "Absent in 25g".
- Write limits in plain text with no superscript characters: "<100 cfu/g", "<1,000 cfu/g", "<10,000 cfu/g", "Not detected in 25g". Convert any scientific notation to a plain number (10^2 -> 100, 10^4 -> 10,000).
- If the report states no limit for a test, return "" — never infer, guess, or supply a typical industry limit.

result (the MEASURED value)
- The result as printed, e.g. "<10 cfu/g", "20 cfu/g", "Not detected", "Absent in 25g". Return "" if no result is printed.
- Never put a measured result in the target field, or a limit in the result field. If the document has only one number per test and it is ambiguous which it is, put it in result and add a warning.

WARNINGS
- Add a warning for anything a reviewer should check: a report that names a different product or batch than expected, results that exceed the stated limit, an out-of-date report, unreadable or ambiguous values, a limit and result that could not be told apart, or a report with no microbiological section at all.`;

const IMAGE_TYPES: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
};

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Lab report reading isn't configured yet (missing ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  const { product_name } = await req.json();
  if (!product_name) return NextResponse.json({ error: "product_name required" }, { status: 400 });

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

  // The admin client bypasses RLS — this read MUST assert the org itself.
  // Exact (case-insensitive) product match, wildcards escaped, same as the panel.
  const escaped = String(product_name).replace(/[\\%_]/g, (m) => "\\" + m);
  const { data: tests } = await supabaseAdmin
    .from("lab_tests")
    .select("id, file_name, file_path, test_date, test_type, organisation_id")
    .eq("organisation_id", orgId)
    .ilike("product_name", escaped)
    .not("file_path", "is", null)
    .order("test_date", { ascending: false })
    .limit(MAX_REPORTS);

  const reports = (tests ?? []).filter((t) => t.organisation_id === orgId && t.file_path);
  if (reports.length === 0) {
    return NextResponse.json(
      { error: "No lab reports with a file attached for this product — upload one on the Lab tests tab first." },
      { status: 404 },
    );
  }

  const fileBlocks: Anthropic.ContentBlockParam[] = [];
  const usedFiles: string[] = [];
  for (const report of reports) {
    const { data: file, error: dlErr } = await supabaseAdmin.storage
      .from("compliance-docs")
      .download(report.file_path!);
    if (dlErr || !file) continue;

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const ext = (report.file_name?.split(".").pop() ?? "").toLowerCase();
    if (ext === "pdf") {
      fileBlocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      });
    } else if (IMAGE_TYPES[ext]) {
      fileBlocks.push({
        type: "image",
        source: { type: "base64", media_type: IMAGE_TYPES[ext], data: base64 },
      });
    } else {
      continue;
    }
    usedFiles.push(report.file_name ?? "report");
  }

  if (fileBlocks.length === 0) {
    return NextResponse.json(
      { error: "Couldn't read any of the lab reports — they must be PDFs or images." },
      { status: 400 },
    );
  }

  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
      messages: [{
        role: "user",
        content: [
          ...fileBlocks,
          {
            type: "text",
            text: `${EXTRACTION_PROMPT}\n\nThe product these reports belong to: "${product_name}".\nThe report file names, in the same order as the documents above: ${usedFiles.join(", ")}.`,
          },
        ],
      }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "The reports couldn't be processed" }, { status: 422 });
    }
    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return NextResponse.json({ error: "No extraction returned — try again" }, { status: 502 });

    return NextResponse.json({ extraction: JSON.parse(text), files: usedFiles });
  } catch (e) {
    console.error("Micro extraction failed:", e);
    return NextResponse.json({ error: "Extraction failed — try again in a moment" }, { status: 502 });
  }
}
