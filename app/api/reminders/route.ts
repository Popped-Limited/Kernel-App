import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { Resend } from "resend";

// Called hourly by Vercel Cron — see vercel.json.
// Also callable manually: POST /api/reminders with { secret: process.env.CRON_SECRET }.
//
// Reads per-checklist reminder config from `checklist_reminders` (one row per
// recipient). Each row carries its own organisation_id + recipient_email, so an
// org's reminders are NEVER sent to another org's inbox. Runs with the service
// role (bypasses RLS) because it's a system job, not a logged-in user.

const CRON_SECRET = process.env.CRON_SECRET ?? "";
const FROM_EMAIL  = process.env.FROM_EMAIL ?? "compliance@kernelapp.co.uk";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function POST(req: NextRequest) {
  // Verify cron secret (if configured). Vercel Cron sends it as a Bearer token.
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization");
    const body = await req.json().catch(() => ({}));
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

  let sent = 0;
  const failures: { id: string; error: string }[] = [];

  for (const r of due as any[]) {
    const checklist = r.checklists;
    // Prefer the direct (login-required) checklist link for team members; fall
    // back to the public guest link only if guest access is enabled.
    const link = checklist.public_token
      ? `${baseUrl}/c/${checklist.public_token}`
      : `${baseUrl}/checklist/${r.checklist_id}`;

    try {
      // Resend returns { data, error } — it does NOT throw on API-level errors,
      // so we must inspect `error` explicitly or failed sends look successful.
      const { error: sendError } = await resend.emails.send({
        from: `Kernel <${FROM_EMAIL}>`,
        to: r.recipient_email,
        subject: `Reminder: ${checklist.name}`,
        html: reminderHtml({
          name: checklist.name,
          description: checklist.description,
          link,
          baseUrl,
          recipientName: r.recipient_name,
          when: `${formatHour(r.send_hour)}, ${formatSchedule(r)}`,
        }),
      });

      if (sendError) {
        // Don't mark last_sent_on — let the next hourly run retry.
        console.error(`Reminder ${r.id} send failed:`, sendError);
        failures.push({ id: r.id, error: sendError.message ?? String(sendError) });
        continue;
      }

      await supabase
        .from("checklist_reminders")
        .update({ last_sent_on: uk.date })
        .eq("id", r.id);

      await supabase.from("alert_log").insert({
        checklist_id:    r.checklist_id,
        organisation_id: r.organisation_id,
        recipient:       r.recipient_email,
        message:         `Reminder sent: ${checklist.name}`,
      });

      sent++;
    } catch (err: any) {
      console.error(`Reminder ${r.id} failed:`, err);
      failures.push({ id: r.id, error: err?.message ?? String(err) });
    }
  }

  return NextResponse.json({ ok: true, sent, failed: failures.length, failures });
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

// First month of each calendar quarter: Jan, Apr, Jul, Oct.
const QUARTER_MONTHS = [0, 3, 6, 9];

// send_hour is already matched in the query; this checks the day rule per frequency.
function isDue(r: any, uk: UkNow): boolean {
  switch (r.frequency) {
    case "daily":     return true;
    case "weekly":    return Array.isArray(r.days) && r.days.includes(uk.weekday);
    case "monthly":   return r.day_of_month === uk.dayOfMonth;
    case "quarterly": return QUARTER_MONTHS.includes(uk.month) && r.day_of_month === uk.dayOfMonth;
    default:          return false;
  }
}

function formatHour(h: number) {
  return `${String(h).padStart(2, "0")}:00`;
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatSchedule(r: any): string {
  switch (r.frequency) {
    case "daily":
      return "every day";
    case "monthly":
      return `${ordinal(r.day_of_month)} of each month`;
    case "quarterly":
      return `${ordinal(r.day_of_month)} of Jan, Apr, Jul & Oct`;
    case "weekly":
    default: {
      const s = [...(r.days ?? [])].sort((a: number, b: number) => a - b);
      if (s.length === 7) return "every day";
      if (s.length === 5 && [1, 2, 3, 4, 5].every((d) => s.includes(d))) return "weekdays";
      if (s.length === 2 && s.includes(0) && s.includes(6)) return "weekends";
      return s.map((d: number) => DAY_LABELS[d]).join(", ");
    }
  }
}

function reminderHtml(opts: {
  name: string;
  description: string | null;
  link: string;
  baseUrl: string;
  recipientName: string | null;
  when: string;
}) {
  const greeting = opts.recipientName ? `Hi ${escapeHtml(opts.recipientName)},` : "Hi,";
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#F5C65A;padding:20px 24px;border-radius:8px 8px 0 0">
        <h1 style="color:#3A3520;margin:0;font-size:18px">Kernel — Checklist reminder</h1>
      </div>
      <div style="background:#fff;border:1px solid #EDE5D0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <p style="margin-top:0;color:#3A3520">${greeting}</p>
        <p style="color:#3A3520">This is your scheduled reminder to complete:</p>
        <div style="background:#F7F2E8;border-radius:8px;padding:16px 18px;margin:16px 0">
          <p style="margin:0;font-size:16px;font-weight:600;color:#3A3520">${escapeHtml(opts.name)}</p>
          ${opts.description ? `<p style="margin:6px 0 0;color:#7A7050;font-size:14px">${escapeHtml(opts.description)}</p>` : ""}
        </div>
        <a href="${opts.link}" style="display:inline-block;background:#F5C65A;color:#3A3520;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:4px">
          Complete now →
        </a>
        <p style="margin-bottom:0;color:#9ca3af;font-size:12px;margin-top:28px">
          You're receiving this because a reminder (${escapeHtml(opts.when)}) was set on this checklist.<br/>
          Kernel App · <a href="${opts.baseUrl}" style="color:#9ca3af">kernelapp.co.uk</a>
        </p>
      </div>
    </div>
  `;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
