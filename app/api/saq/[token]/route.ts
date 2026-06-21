import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Public, unauthenticated endpoint for the supplier SAQ form.
// All DB access uses service-role so suppliers table needs no anon RLS.
// The token is the sole authorisation for both read and submit.

type Params = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const { data: supplier, error: supErr } = await supabaseAdmin
    .from("suppliers")
    .select("id, name, type, saq_completed, saq_date, organisation_id")
    .eq("saq_token", token)
    .maybeSingle();

  if (supErr) return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  if (!supplier) return NextResponse.json({ supplier: null, questions: [] });

  const { data: questions, error: qErr } = await supabaseAdmin
    .from("saq_questions")
    .select("section_number, section_title, question_id, question_text, answer_type, placeholder, required, for_types, sort_order")
    .eq("organisation_id", supplier.organisation_id)
    .eq("active", true)
    .order("sort_order");

  if (qErr) return NextResponse.json({ error: "Questions unavailable" }, { status: 500 });

  return NextResponse.json({ supplier, questions: questions ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const { answers } = await req.json();
  if (!answers || typeof answers !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Re-resolve supplier from token — never trust the client's supplier id.
  const { data: supplier, error: supErr } = await supabaseAdmin
    .from("suppliers")
    .select("id, organisation_id, saq_completed")
    .eq("saq_token", token)
    .maybeSingle();

  if (supErr || !supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  if (supplier.saq_completed) return NextResponse.json({ error: "Already submitted" }, { status: 409 });

  const now = new Date().toISOString();
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);

  const { error: responseErr } = await supabaseAdmin.from("saq_responses").insert({
    supplier_id: supplier.id,
    organisation_id: supplier.organisation_id,
    responses: answers,
    submitted_at: now,
  });
  if (responseErr) return NextResponse.json({ error: "Failed to save responses" }, { status: 500 });

  await supabaseAdmin.from("suppliers").update({
    saq_completed: true,
    saq_date: now,
    next_review_due: nextYear.toISOString().split("T")[0],
  }).eq("id", supplier.id);

  return NextResponse.json({ success: true });
}
