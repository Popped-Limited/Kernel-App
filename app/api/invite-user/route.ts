import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const { email, role } = await req.json();

    if (!email?.trim() || !role) {
      return NextResponse.json({ error: "Email and role are required" }, { status: 400 });
    }

    const validRoles = ["admin", "manager", "staff"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Verify the inviter is an admin
    const { data: myMembership } = await supabaseAdmin
      .from("organisation_members")
      .select("organisation_id, role")
      .eq("user_id", user.id)
      .single();

    if (!myMembership || myMembership.role !== "admin") {
      return NextResponse.json({ error: "Only admins can invite users" }, { status: 403 });
    }

    const orgId = myMembership.organisation_id;
    const normalisedEmail = email.trim().toLowerCase();

    // Check if this email is already a member
    const { data: { users: existingUsers } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = existingUsers.find(u => u.email === normalisedEmail);

    if (existingUser) {
      // Check if they're already in this org
      const { data: existingMember } = await supabaseAdmin
        .from("organisation_members")
        .select("id")
        .eq("organisation_id", orgId)
        .eq("user_id", existingUser.id)
        .single();

      if (existingMember) {
        return NextResponse.json({ error: "This person is already a member of your organisation" }, { status: 400 });
      }

      // They have an account but aren't in this org — create an invite they can accept
    }

    // Create invite record
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("org_invites")
      .insert({
        organisation_id: orgId,
        email: normalisedEmail,
        role,
        invited_by: user.id,
      })
      .select("token")
      .single();

    if (inviteError) {
      if (inviteError.message?.includes("unique") || inviteError.code === "23505") {
        return NextResponse.json({ error: "An invite has already been sent to this email" }, { status: 400 });
      }
      throw inviteError;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://kernelapp.co.uk";
    const redirectTo = `${appUrl}/accept-invite?token=${invite.token}`;

    // Send invite email via Supabase
    const { error: emailError } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalisedEmail, {
      redirectTo,
    });

    if (emailError) {
      // Clean up the invite record if email failed
      await supabaseAdmin.from("org_invites").delete().eq("token", invite.token);
      throw emailError;
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error("Invite user error:", err);
    return NextResponse.json({ error: "Failed to send invite" }, { status: 500 });
  }
}
