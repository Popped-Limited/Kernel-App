import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { Resend } from "resend";

// Called hourly by Vercel Cron — see vercel.json. Vercel Cron issues a GET
// request (with an Authorization: Bearer <CRON_SECRET> header), so the cron
// entry point is GET. POST is also supported for manual invocation with
// { secret: process.env.CRON_SECRET } in the body.
//
// Reads per-checklist reminder config from `checklist_reminders` (one row per
// recipient). Each row carries its own organisation_id + recipient_email, so an
// org's reminders are NEVER sent to another org's inbox. Runs with the service
// role (bypasses RLS) because it's a system job, not a logged-in user.

const CRON_SECRET = process.env.CRON_SECRET ?? "";
const FROM_EMAIL  = process.env.FROM_EMAIL ?? "compliance@kernelapp.co.uk";

// Vercel Cron uses GET; POST stays available for manual triggering.
export async function GET(req: NextRequest)  { return runReminders(req); }
export async function POST(req: NextRequest) { return runReminders(req); }

async function runReminders(req: NextRequest) {
  // Verify cron secret (if configured). Vercel Cron sends it as a Bearer token;
  // a manual POST may instead pass it in the JSON body.
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization");
    const body = await req.json().catch(() => ({} as any));
    if (auth !== `Bearer ${CRON_SECRET}` && body.secret !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const uk = getUkNow(now); // { hour, weekday, date }

  // Find every active reminder due this hour, on this weekday, not yet sent today.
  // `days` is a smallint[] — `cs` (contains) matches when it includes today's weekday.
  const { data: reminders, error } = await supabase
    .from("checklist_reminders")
    .select("*, checklists(name, description, public_token, active)")
    .eq("active", true)
    .eq("send_hour", uk.hour);

  if (error) {
    console.error("Reminders query failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (reminders ?? []).filter((r: any) => {
    if (r.last_sent_on === uk.date) return false;       // already sent today
    if (!r.checklists || r.checklists.active === false) return false; // checklist gone/inactive
    return isDue(r, uk);
  });

  if (due.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "No reminders due this hour" });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://kernelapp.co.uk";

  // Group the due reminders by recipient so each person gets a single email
  // listing every checklist due for them this hour.
  const byRecipient = new Map<string, any[]>();
  for (const r of due as any[]) {
    const list = byRecipient.get(r.recipient_email) ?? [];
    list.push(r);
    byRecipient.set(r.recipient_email, list);
  }

  let emailsSent = 0;
  let remindersSent = 0;
  const failures: { recipient: string; error: string }[] = [];

  for (const [recipient, group] of byRecipient) {
    const items = group.map((r) => {
      const checklist = r.checklists;
      // Prefer the direct (login-required) link; fall back to the public guest
      // link only if guest access is enabled on the checklist.
      const link = checklist.public_token
        ? `${baseUrl}/c/${checklist.public_token}`
        : `${baseUrl}/checklist/${r.checklist_id}`;
      return { name: checklist.name, description: checklist.description, link };
    });

    const subject = items.length === 1
      ? `Reminder: ${items[0].name}`
      : `Reminder: ${items.length} checklists to complete`;

    try {
      // Resend returns { data, error } — it does NOT throw on API-level errors,
      // so we must inspect `error` explicitly or failed sends look successful.
      const { error: sendError } = await resend.emails.send({
        from: `Kernel <${FROM_EMAIL}>`,
        to: recipient,
        subject,
        html: reminderHtml({
          recipientName: group[0].recipient_name,
          items,
          baseUrl,
        }),
      });

      if (sendError) {
        // Don't mark last_sent_on — let the next hourly run retry the whole group.
        console.error(`Reminder email to ${recipient} failed:`, sendError);
        failures.push({ recipient, error: sendError.message ?? String(sendError) });
        continue;
      }

      // Mark every reminder in this group as sent today and log each one.
      const ids = group.map((r) => r.id);
      await supabase.from("checklist_reminders").update({ last_sent_on: uk.date }).in("id", ids);
      await supabase.from("alert_log").insert(
        group.map((r) => ({
          checklist_id:    r.checklist_id,
          organisation_id: r.organisation_id,
          recipient,
          message:         `Reminder sent: ${r.checklists.name}`,
        }))
      );

      emailsSent++;
      remindersSent += group.length;
    } catch (err: any) {
      console.error(`Reminder email to ${recipient} failed:`, err);
      failures.push({ recipient, error: err?.message ?? String(err) });
    }
  }

  return NextResponse.json({ ok: true, emailsSent, remindersSent, failed: failures.length, failures });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type UkNow = { hour: number; weekday: number; month: number; dayOfMonth: number; date: string };

// Current wall-clock time in UK (Europe/London) — handles BST/GMT automatically,
// independent of the server's timezone.
function getUkNow(now: Date): UkNow {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // some runtimes emit "24" for midnight
  return {
    hour,
    weekday: weekdayMap[get("weekday")] ?? 0,
    month: parseInt(get("month"), 10) - 1, // 0-11
    dayOfMonth: parseInt(get("day"), 10),  // 1-31
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

// send_hour is already matched in the query; this checks the day rule per frequency.
function isDue(r: any, uk: UkNow): boolean {
  switch (r.frequency) {
    // Daily fires on the chosen weekdays; no selection means literally every day.
    case "daily":   return !r.days?.length || r.days.includes(uk.weekday);
    // Weekly fires on its single chosen weekday.
    case "weekly":  return Array.isArray(r.days) && r.days.includes(uk.weekday);
    case "monthly": return r.day_of_month === uk.dayOfMonth;
    // Quarterly fires on day_of_month in start_month and every 3rd month after.
    case "quarterly": {
      if (r.day_of_month !== uk.dayOfMonth) return false;
      const start = r.start_month ?? 0;
      return (((uk.month - start) % 3) + 3) % 3 === 0;
    }
    default: return false;
  }
}

function reminderHtml(opts: {
  recipientName: string | null;
  items: { name: string; description: string | null; link: string }[];
  baseUrl: string;
}) {
  const greeting = opts.recipientName ? `Hi ${escapeHtml(opts.recipientName)},` : "Hi,";
  const intro = opts.items.length === 1
    ? "This is your scheduled reminder to complete:"
    : "This is your scheduled reminder to complete the following checklists:";

  const blocks = opts.items.map((it) => `
    <div style="background:#F7F2E8;border-radius:8px;padding:16px 18px;margin:16px 0">
      <p style="margin:0;font-size:16px;font-weight:600;color:#3A3520">${escapeHtml(it.name)}</p>
      ${it.description ? `<p style="margin:6px 0 10px;color:#7A7050;font-size:14px">${escapeHtml(it.description)}</p>` : `<div style="height:10px"></div>`}
      <a href="${it.link}" style="display:inline-block;background:#F5C65A;color:#3A3520;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
        Complete now →
      </a>
    </div>
  `).join("");

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#F5C65A;padding:20px 24px;border-radius:8px 8px 0 0">
        <h1 style="color:#3A3520;margin:0;font-size:18px">Kernel — Checklist reminder</h1>
      </div>
      <div style="background:#fff;border:1px solid #EDE5D0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <p style="margin-top:0;color:#3A3520">${greeting}</p>
        <p style="color:#3A3520">${intro}</p>
        ${blocks}
        <p style="margin-bottom:0;color:#9ca3af;font-size:12px;margin-top:28px">
          You're receiving this because email reminders were set up for ${opts.items.length === 1 ? "this checklist" : "these checklists"} in Kernel.<br/>
          Kernel App · <a href="${opts.baseUrl}" style="color:#9ca3af">kernelapp.co.uk</a>
        </p>
      </div>
    </div>
  `;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
