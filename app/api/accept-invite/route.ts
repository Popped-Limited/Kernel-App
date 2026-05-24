import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ error: "Invalid invite link" }, { status: 400 });

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Find the invite
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("org_invites")
      .select("*")
      .eq("token", token)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (inviteError || !invite) {
      return NextResponse.json({ error: "Invite not found or has expired" }, { status: 400 });
    }

    // Verify the user's email matches the invite
    if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
      return NextResponse.json(
        { error: `This invite was sent to ${invite.email}. Please sign in with that email address.` },
        { status: 403 }
      );
    }

    // Check they're not already a member
    const { data: existingMember } = await supabaseAdmin
      .from("organisation_members")
      .select("id")
      .eq("organisation_id", invite.organisation_id)
      .eq("user_id", user.id)
      .single();

    if (existingMember) {
      // Already a member — mark invite as accepted and carry on
      await supabaseAdmin
        .from("org_invites")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invite.id);
      return NextResponse.json({ success: true });
    }

    // Add to organisation
    const { error: memberError } = await supabaseAdmin
      .from("organisation_members")
      .insert({ organisation_id: invite.organisation_id, user_id: user.id, role: invite.role });

    if (memberError) throw memberError;

    // Mark invite as accepted
    await supabaseAdmin
      .from("org_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error("Accept invite error:", err);
    return NextResponse.json({ error: "Failed to accept invite" }, { status: 500 });
  }
}
