import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import type { Checklist } from "@/lib/types";
import { Resend } from "resend";

// Called by Vercel Cron — see vercel.json
// Also callable manually: POST /api/alerts with { secret: process.env.CRON_SECRET }

const CRON_SECRET = process.env.CRON_SECRET ?? "";
const ALERT_EMAIL = process.env.ALERT_EMAIL ?? "tom@yepkitchen.com";

// Which checklists are expected at what times (UTC — adjust for BST as needed)
// Format: { frequency, expectedHour (UTC), label }
const SCHEDULED = [
  { frequency: "per_shift_am", label: "Opening Checks", expectedHour: 8 },
  { frequency: "per_shift_pm", label: "Closing Checks", expectedHour: 16 },
  { frequency: "per_shift_eod", label: "Daily Cleaning", expectedHour: 17 },
];

export async function POST(req: NextRequest) {
  // Verify cron secret (if set)
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization");
    const body = await req.json().catch(() => ({}));
    if (auth !== `Bearer ${CRON_SECRET}` && body.secret !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setUTCHours(23, 59, 59, 999);

  const missed: { name: string; frequency: string; id: string }[] = [];

  for (const sched of SCHEDULED) {
    // Only check if we're past the expected hour
    if (now.getUTCHours() < sched.expectedHour + 1) continue;

    // Find the checklist
    const { data: checklists } = await supabase
      .from("checklists")
      .select("*")
      .eq("frequency", sched.frequency)
      .eq("active", true);

    if (!checklists?.length) continue;

    for (const cl of checklists as Checklist[]) {
      // Check if there's been a submission today
      const { data: submissions } = await supabase
        .from("submissions")
        .select("id")
        .eq("checklist_id", cl.id)
        .gte("submitted_at", todayStart.toISOString())
        .lte("submitted_at", todayEnd.toISOString())
        .limit(1);

      if (!submissions?.length) {
        missed.push({ name: cl.name, frequency: sched.frequency, id: cl.id });
      }
    }
  }

  // Weekly checklists — check on Mondays (UTC day 1)
  if (now.getUTCDay() === 1) {
    const weekStart = new Date(now);
    weekStart.setUTCDate(weekStart.getUTCDate() - 7);
    weekStart.setUTCHours(0, 0, 0, 0);

    const { data: weeklyChecklists } = await supabase
      .from("checklists")
      .select("*")
      .eq("frequency", "weekly")
      .eq("active", true);

    for (const cl of (weeklyChecklists ?? []) as Checklist[]) {
      const { data: submissions } = await supabase
        .from("submissions")
        .select("id")
        .eq("checklist_id", cl.id)
        .gte("submitted_at", weekStart.toISOString())
        .limit(1);

      if (!submissions?.length) {
        missed.push({ name: cl.name, frequency: "weekly", id: cl.id });
      }
    }
  }

  if (missed.length === 0) {
    return NextResponse.json({ ok: true, message: "No missed checks" });
  }

  // Log alerts
  for (const m of missed) {
    await supabase.from("alert_log").insert({
      checklist_id: m.id,
      recipient: ALERT_EMAIL,
      message: `Missed check: ${m.name}`,
    });
  }

  // Send email
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://kernelapp.co.uk";
  const listHtml = missed
    .map((m) => `<li style="margin-bottom:8px"><strong>${m.name}</strong> — <a href="${baseUrl}/checklist/${m.id}" style="color:#FF2C00">Submit now</a></li>`)
    .join("");

  await resend.emails.send({
    from: "Kernel App <compliance@kernelapp.co.uk>",
    to: ALERT_EMAIL,
    subject: `⚠️ ${missed.length} missed check${missed.length > 1 ? "s" : ""} — ${formatDate(now)}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#FF2C00;padding:20px 24px;border-radius:8px 8px 0 0">
          <h1 style="color:white;margin:0;font-size:18px">Kernel — Compliance Alert</h1>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p style="margin-top:0;color:#374151">The following check${missed.length > 1 ? "s have" : " has"} not been completed today:</p>
          <ul style="color:#374151;padding-left:20px">${listHtml}</ul>
          <p style="color:#374151">Please ensure these are completed and logged as soon as possible.</p>
          <a href="${baseUrl}" style="display:inline-block;background:#FF2C00;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px">
            Open Kernel
          </a>
          <p style="margin-bottom:0;color:#9ca3af;font-size:12px;margin-top:24px">
            Kernel App · <a href="${baseUrl}" style="color:#9ca3af">kernelapp.co.uk</a>
          </p>
        </div>
      </div>
    `,
  });

  return NextResponse.json({ ok: true, sent: missed.length, to: ALERT_EMAIL });
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}
