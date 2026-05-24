import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Get this user's org
    const { data: myMembership } = await supabaseAdmin
      .from("organisation_members")
      .select("organisation_id, role")
      .eq("user_id", user.id)
      .single();

    if (!myMembership) return NextResponse.json({ error: "No organisation found" }, { status: 400 });

    // Get all members of the org
    const { data: members } = await supabaseAdmin
      .from("organisation_members")
      .select("user_id, role, created_at")
      .eq("organisation_id", myMembership.organisation_id)
      .order("created_at");

    if (!members) return NextResponse.json({ members: [] });

    // Fetch user details for each member
    const { data: { users: allUsers } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });

    const memberIds = new Set(members.map(m => m.user_id));
    const userMap = new Map(
      allUsers.filter(u => memberIds.has(u.id)).map(u => [u.id, u])
    );

    const enriched = members.map(m => {
      const authUser = userMap.get(m.user_id);
      return {
        user_id:    m.user_id,
        role:       m.role,
        joined_at:  m.created_at,
        email:      authUser?.email ?? "—",
        full_name:  authUser?.user_metadata?.full_name ?? null,
        is_me:      m.user_id === user.id,
      };
    });

    // Also fetch pending invites
    const { data: invites } = await supabaseAdmin
      .from("org_invites")
      .select("id, email, role, expires_at, created_at")
      .eq("organisation_id", myMembership.organisation_id)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    return NextResponse.json({
      members:  enriched,
      invites:  invites ?? [],
      myRole:   myMembership.role,
      orgId:    myMembership.organisation_id,
    });

  } catch (err) {
    console.error("Org members error:", err);
    return NextResponse.json({ error: "Failed to load members" }, { status: 500 });
  }
}
