import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { submission_id, signed_off_by, notes } = await req.json();

  if (!submission_id || !signed_off_by) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { error } = await supabase
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
