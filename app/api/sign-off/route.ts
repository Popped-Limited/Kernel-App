import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { submission_id, signed_off_by, notes } = await req.json();

  if (!submission_id || !signed_off_by) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Verify the caller is authenticated
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Confirm this submission belongs to the caller's org
  const { data: membership } = await supabaseAdmin
    .from("organisation_members")
    .select("organisation_id")
    .eq("user_id", user.id)
    .single();

  if (!membership) return NextResponse.json({ error: "No organisation" }, { status: 403 });

  // Fetch the submission and verify it belongs to this org via its checklist
  const { data: submission } = await supabaseAdmin
    .from("submissions")
    .select("id, checklist:checklists(organisation_id)")
    .eq("id", submission_id)
    .single();

  const submissionOrgId = (submission?.checklist as unknown as { organisation_id: string } | null)?.organisation_id;
  if (!submission || submissionOrgId !== membership.organisation_id) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("submissions")
    .update({
      signed_off_by,
      signed_off_at: new Date().toISOString(),
      notes: notes ?? null,
    })
    .eq("id", submission_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
