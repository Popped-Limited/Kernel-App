import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const VALID_ROLES = ["admin", "manager", "staff"];

export async function POST(req: NextRequest) {
  try {
    const { userId, role } = await req.json();
    if (!userId) return NextResponse.json({ error: "User ID required" }, { status: 400 });
    if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

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
      return NextResponse.json({ error: "Only admins can change roles" }, { status: 403 });
    }

    // Prevent changing your own role
    if (userId === user.id) {
      return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 });
    }

    // Verify the target user belongs to the same org
    const { data: targetMembership } = await supabaseAdmin
      .from("organisation_members")
      .select("user_id")
      .eq("organisation_id", myMembership.organisation_id)
      .eq("user_id", userId)
      .single();

    if (!targetMembership) {
      return NextResponse.json({ error: "User not found in your organisation" }, { status: 404 });
    }

    const { error } = await supabaseAdmin
      .from("organisation_members")
      .update({ role })
      .eq("organisation_id", myMembership.organisation_id)
      .eq("user_id", userId);

    if (error) throw error;

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error("Change role error:", err);
    return NextResponse.json({ error: "Failed to change role" }, { status: 500 });
  }
}
