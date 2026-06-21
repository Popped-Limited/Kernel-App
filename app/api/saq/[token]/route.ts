import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Public, unauthenticated endpoint for the supplier SAQ form. Resolves the
// supplier by its token, then returns that supplier's ORGANISATION's active SAQ
// questions. Using the service role here lets saq_questions stay fully
// org-scoped under RLS (no anon read) — the token is the authorisation.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const { data: supplier, error: supErr } = await supabaseAdmin
    .from("suppliers")
    .select("organisation_id")
    .eq("saq_token", token)
    .maybeSingle();

  if (supErr) return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  if (!supplier?.organisation_id) return NextResponse.json({ questions: [] });

  const { data: questions, error: qErr } = await supabaseAdmin
    .from("saq_questions")
    .select("section_number, section_title, question_id, question_text, answer_type, placeholder, required, for_types, sort_order")
    .eq("organisation_id", supplier.organisation_id)
    .eq("active", true)
    .order("sort_order");

  if (qErr) return NextResponse.json({ error: "Questions unavailable" }, { status: 500 });

  return NextResponse.json({ questions: questions ?? [] });
}
