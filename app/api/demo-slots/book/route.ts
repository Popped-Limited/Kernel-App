import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildDemoICS } from "@/lib/ics";
import { cookies } from "next/headers";

const resend = new Resend(process.env.RESEND_API_KEY!);

function formatWhen(d: Date, durationMins: number): string {
  const date = d.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
  });
  return `${date} at ${time} (${durationMins} min)`;
}

export async function POST(req: NextRequest) {
  try {
    const { slot_id, note } = await req.json();
    if (!slot_id) return NextResponse.json({ error: "No slot selected" }, { status: 400 });

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { data: member } = await supabaseAdmin
      .from("organisation_members")
      .select("organisation_id, organisations(name)")
      .eq("user_id", user.id)
      .single();

    const orgId = (member as any)?.organisation_id ?? null;
    const orgName = (member as any)?.organisations?.name ?? "Unknown org";
    const userName = user.user_metadata?.full_name ?? "Unknown";
    const cleanNote = typeof note === "string" ? note.trim().slice(0, 1000) : "";

    // Atomic claim: only succeeds if the slot is still unbooked and in the future.
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from("demo_slots")
      .update({
        booked_by_org:  orgId,
        booked_by_user: user.id,
        booked_by_name: userName,
        booked_by_email: user.email,
        booked_note:    cleanNote || null,
        booked_at:      new Date().toISOString(),
      })
      .eq("id", slot_id)
      .is("booked_at", null)
      .gt("starts_at", new Date().toISOString())
      .select("*")
      .maybeSingle();

    if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 });
    if (!claimed) {
      return NextResponse.json(
        { error: "Sorry, that time was just taken. Please pick another." },
        { status: 409 }
      );
    }

    const start = new Date(claimed.starts_at);
    const whenLabel = formatWhen(start, claimed.duration_mins);
    const notifyEmail = process.env.DEMO_NOTIFY_EMAIL ?? "support@kernelapp.co.uk";
    const fromEmail = process.env.FROM_EMAIL ?? "support@kernelapp.co.uk";

    // The video meeting link that goes into the invite (set on the admin page).
    const { data: settings } = await supabaseAdmin
      .from("demo_settings")
      .select("meeting_url")
      .eq("id", 1)
      .maybeSingle();
    const meetingUrl = (settings?.meeting_url ?? "").trim();

    const uid = `demo-${claimed.id}@kernelapp.co.uk`;
    const summary = `Kernel demo — ${orgName}`;
    const baseDesc = cleanNote
      ? `Demo with ${userName} (${orgName}). Note: ${cleanNote}`
      : `Demo with ${userName} (${orgName}).`;
    const description = meetingUrl ? `${baseDesc}\n\nJoin the demo: ${meetingUrl}` : baseDesc;

    // Support copy: PUBLISH — a plain "add to calendar" event. REQUEST fails in
    // Gmail here because support@ is the organiser receiving its own invite.
    const supportIcs = buildDemoICS({ uid, start, durationMins: claimed.duration_mins, summary, description, location: meetingUrl || undefined, method: "PUBLISH" });
    const supportAttachment = {
      filename: "kernel-demo.ics",
      content: Buffer.from(supportIcs).toString("base64"),
      content_type: "text/calendar; method=PUBLISH",
    };

    // Customer copy: REQUEST — a proper invitation (customer is the attendee).
    const customerIcs = buildDemoICS({
      uid, start, durationMins: claimed.duration_mins, summary, description,
      location: meetingUrl || undefined,
      method: "REQUEST",
      organiserEmail: notifyEmail,
      attendees: [{ email: user.email!, name: userName }],
    });
    const customerAttachment = {
      filename: "kernel-demo.ics",
      content: Buffer.from(customerIcs).toString("base64"),
      content_type: "text/calendar; method=REQUEST",
    };

    const safeUrl = meetingUrl.replace(/"/g, "%22");
    const joinBlock = meetingUrl
      ? `<p style="margin: 24px 0;"><a href="${safeUrl}" style="display:inline-block; background:#C89A18; color:#1C1A10; text-decoration:none; font-weight:bold; padding:12px 24px; border-radius:8px;">Join the demo</a></p>
         <p style="color:#888; font-size:13px; word-break:break-all;">Or use this link: <a href="${safeUrl}">${meetingUrl}</a></p>`
      : "";

    // Both emails send independently — a failure on one must not block the other,
    // and the booking is already saved regardless.
    const results = await Promise.allSettled([
      // → Kernel support (Tom)
      resend.emails.send({
        from: `Kernel <${fromEmail}>`,
        to: notifyEmail,
        reply_to: user.email,
        subject: `[Demo booked] ${orgName} — ${whenLabel}`,
        attachments: [supportAttachment],
        html: `
          <div style="font-family: sans-serif; max-width: 600px; color: #333;">
            <h2 style="color: #5C4A1E;">New demo booking</h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr><td style="padding: 6px 0; color: #888; width: 110px;">When</td><td><strong>${whenLabel}</strong></td></tr>
              <tr><td style="padding: 6px 0; color: #888;">Who</td><td><strong>${userName}</strong> &lt;${user.email}&gt;</td></tr>
              <tr><td style="padding: 6px 0; color: #888;">Organisation</td><td>${orgName}</td></tr>
            </table>
            ${cleanNote ? `<div style="background: #f9f6f0; border-radius: 8px; padding: 16px; white-space: pre-wrap;">${cleanNote.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>` : ""}
            ${joinBlock || `<p style="background:#fdf3d0; border-radius:8px; padding:12px 16px; color:#7a5c00; font-size:13px;">No meeting link is set yet — add one on the Demo availability page so future invites include it, and send ${userName} a link for this one.</p>`}
            <p style="margin-top: 20px; color: #888; font-size: 13px;">The calendar invite is attached — open it to add this demo to your Google Calendar.</p>
          </div>
        `,
      }),

      // → Customer confirmation
      resend.emails.send({
        from: `Kernel <${fromEmail}>`,
        to: user.email!,
        reply_to: notifyEmail,
        subject: `Your Kernel demo is booked — ${whenLabel}`,
        attachments: [customerAttachment],
        html: `
          <div style="font-family: sans-serif; max-width: 600px; color: #333;">
            <h2 style="color: #5C4A1E;">You're booked in 🎉</h2>
            <p>Thanks ${userName}! Your Kernel demo is confirmed for:</p>
            <p style="font-size: 18px; font-weight: bold; color: #5C4A1E;">${whenLabel}</p>
            ${joinBlock}
            <p>We'll be in touch at <a href="mailto:${notifyEmail}">${notifyEmail}</a> if anything changes. The calendar invite is attached so you can add it to your calendar.</p>
            <p style="margin-top: 20px; color: #888; font-size: 13px;">Need to rearrange? Just reply to this email.</p>
          </div>
        `,
      }),
    ]);
    results.forEach((r, i) => {
      if (r.status === "rejected") console.error(`Demo booking email ${i === 0 ? "(support)" : "(customer)"} failed:`, r.reason);
      else if ((r.value as any)?.error) console.error(`Demo booking email ${i === 0 ? "(support)" : "(customer)"} Resend error:`, (r.value as any).error);
    });

    return NextResponse.json({ success: true, when: whenLabel });
  } catch (err) {
    console.error("Demo booking error:", err);
    return NextResponse.json({ error: "Failed to book — please try again" }, { status: 500 });
  }
}
