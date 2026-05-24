import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cookies } from "next/headers";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { subject, message } = await req.json();

    if (!subject?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "Subject and message are required" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Get their org name for context
    const { data: member } = await supabaseAdmin
      .from("organisation_members")
      .select("organisation_id, organisations(name)")
      .eq("user_id", user.id)
      .single();

    const orgName = (member as any)?.organisations?.name ?? "Unknown org";
    const userName = user.user_metadata?.full_name ?? "Unknown";
    const supportEmail = process.env.SUPPORT_EMAIL ?? "hello@kernelapp.co.uk";
    const fromEmail = process.env.FROM_EMAIL ?? "support@kernelapp.co.uk";

    await resend.emails.send({
      from: `Kernel Support <${fromEmail}>`,
      to:   supportEmail,
      replyTo: user.email,
      subject: `[Support] ${subject}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; color: #333;">
          <h2 style="color: #5C4A1E;">New support request</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr><td style="padding: 6px 0; color: #888; width: 100px;">From</td><td><strong>${userName}</strong> &lt;${user.email}&gt;</td></tr>
            <tr><td style="padding: 6px 0; color: #888;">Organisation</td><td>${orgName}</td></tr>
            <tr><td style="padding: 6px 0; color: #888;">Subject</td><td>${subject}</td></tr>
          </table>
          <div style="background: #f9f6f0; border-radius: 8px; padding: 16px; white-space: pre-wrap;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
          <p style="margin-top: 20px; color: #888; font-size: 13px;">Reply to this email to respond directly to ${user.email}.</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error("Support email error:", err);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
