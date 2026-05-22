import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const { org_name, user_name, email, password } = await req.json();

  if (!org_name?.trim() || !user_name?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  // Create auth user — auto-confirmed so they can log in immediately
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { full_name: user_name.trim() },
  });

  if (userError) {
    const msg = userError.message.includes("already registered")
      ? "An account with this email already exists"
      : userError.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const userId = userData.user.id;

  // Generate a unique slug from the org name
  const baseSlug = org_name.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const slug = `${baseSlug}-${Date.now()}`;

  // Create organisation
  const { data: org, error: orgError } = await supabaseAdmin
    .from("organisations")
    .insert({ name: org_name.trim(), slug, plan: "trial" })
    .select("id")
    .single();

  if (orgError || !org) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: "Failed to create organisation" }, { status: 500 });
  }

  // Link user to org as admin
  const { error: memberError } = await supabaseAdmin
    .from("organisation_members")
    .insert({ organisation_id: org.id, user_id: userId, role: "admin" });

  if (memberError) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    await supabaseAdmin.from("organisations").delete().eq("id", org.id);
    return NextResponse.json({ error: "Failed to set up account" }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
