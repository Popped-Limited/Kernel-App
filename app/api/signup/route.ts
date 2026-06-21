import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  try {
    const { org_name, user_name, email, password, referral_source } = await req.json();

    // Validate inputs
    if (!org_name?.trim() || !user_name?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const normalisedEmail = email.trim().toLowerCase();

    // 1. Create the auth user (admin API — auto-confirmed, no email verification needed)
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: normalisedEmail,
      password,
      user_metadata: { full_name: user_name.trim() },
      email_confirm: true,
    });

    if (userError || !userData.user) {
      const msg = userError?.message?.toLowerCase().includes("already registered") ||
                  userError?.message?.toLowerCase().includes("already exists")
        ? "An account with this email already exists"
        : (userError?.message ?? "Failed to create account");
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const userId = userData.user.id;

    // 2. Create the organisation
    const baseSlug = org_name.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const slug = `${baseSlug}-${Date.now()}`;

    const { data: org, error: orgError } = await supabaseAdmin
      .from("organisations")
      .insert({
        name:            org_name.trim(),
        slug,
        plan:            "unpopped",
        referral_source: referral_source === "beacon" ? "beacon" : null,
      })
      .select("id")
      .single();

    if (orgError || !org) {
      // Roll back: delete the auth user so they can try again
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: "Failed to create organisation" }, { status: 500 });
    }

    // 3. Link user to org as admin
    const { error: memberError } = await supabaseAdmin
      .from("organisation_members")
      .insert({ organisation_id: org.id, user_id: userId, role: "admin" });

    if (memberError) {
      // Roll back both
      await supabaseAdmin.auth.admin.deleteUser(userId);
      await supabaseAdmin.from("organisations").delete().eq("id", org.id);
      return NextResponse.json({ error: "Failed to set up account" }, { status: 500 });
    }

    // 4. Notify the team of the new signup (best-effort — never block signup).
    try {
      const notifyTo = process.env.SIGNUP_NOTIFY_EMAIL ?? "support@kernelapp.co.uk";
      const fromEmail = process.env.FROM_EMAIL ?? "support@kernelapp.co.uk";
      const resend = new Resend(process.env.RESEND_API_KEY);
      const when = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "full", timeStyle: "short" });
      const { error: notifyError } = await resend.emails.send({
        from: `Kernel <${fromEmail}>`,
        to: notifyTo,
        subject: `🎉 New Kernel signup: ${org_name.trim()}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#F5C65A;padding:20px 24px;border-radius:8px 8px 0 0">
              <h1 style="color:#3A3520;margin:0;font-size:18px">New signup</h1>
            </div>
            <div style="background:#fff;border:1px solid #EDE5D0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
              <table style="width:100%;border-collapse:collapse;color:#3A3520">
                <tr><td style="padding:6px 0;color:#7A7050;width:120px">Business</td><td><strong>${escapeHtml(org_name.trim())}</strong></td></tr>
                <tr><td style="padding:6px 0;color:#7A7050">Name</td><td>${escapeHtml(user_name.trim())}</td></tr>
                <tr><td style="padding:6px 0;color:#7A7050">Email</td><td>${escapeHtml(normalisedEmail)}</td></tr>
                <tr><td style="padding:6px 0;color:#7A7050">Source</td><td>${referral_source === "beacon" ? "Beacon" : "Direct"}</td></tr>
                <tr><td style="padding:6px 0;color:#7A7050">When</td><td>${escapeHtml(when)}</td></tr>
              </table>
            </div>
          </div>
        `,
      });
      if (notifyError) console.error("Signup notification email failed (signup still succeeded):", notifyError);
    } catch (notifyErr) {
      console.error("Signup notification email failed (signup still succeeded):", notifyErr);
    }

    return NextResponse.json({ success: true }, { status: 201 });

  } catch (err) {
    console.error("Signup error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
