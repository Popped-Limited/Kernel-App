import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "User ID required" }, { status: 400 });

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Verify the requester is an admin
    const { data: myMembership } = await supabaseAdmin
      .from("organisation_members")
      .select("organisation_id, role")
      .eq("user_id", user.id)
      .single();

    if (!myMembership || myMembership.role !== "admin") {
      return NextResponse.json({ error: "Only admins can remove members" }, { status: 403 });
    }

    // Prevent removing yourself
    if (userId === user.id) {
      return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });
    }

    // Remove from organisation
    const { error } = await supabaseAdmin
      .from("organisation_members")
      .delete()
      .eq("organisation_id", myMembership.organisation_id)
      .eq("user_id", userId);

    if (error) throw error;

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error("Remove member error:", err);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
