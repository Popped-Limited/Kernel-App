import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { fetchAll } from "@/lib/fetchAll";
import { Resend } from "resend";

// Called daily by Vercel Cron — see vercel.json. Emails each assignee ONCE
// when a GMP finding passes its due date without being closed (one nudge per
// finding, marked via overdue_notified_on). Vercel Cron issues a GET with an
// Authorization: Bearer <CRON_SECRET> header; POST stays available for manual
// runs with { secret } in the body. Service role: cross-org system job, but
// every email is built purely from that finding's own org's rows and goes to
// the team_members row the finding itself references — never across orgs.

const CRON_SECRET = process.env.CRON_SECRET ?? "";
const FROM_EMAIL  = process.env.FROM_EMAIL ?? "compliance@kernelapp.co.uk";

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }

async function run(req: NextRequest) {
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization");
    const body = await req.json().catch(() => ({} as any));
    if (auth !== `Bearer ${CRON_SECRET}` && body.secret !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Today in UK wall-clock time — due dates are stored as plain dates.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  // Grows with every customer — paginate past the 1000-row cap.
  let overdue: any[];
  try {
    overdue = await fetchAll<any>((from, to) =>
      supabase
        .from("gmp_findings")
        .select("*, gmp_audits(audit_date, gmp_areas(name)), team_members(name, email)")
        .eq("status", "open")
        .not("assigned_to", "is", null)
        .is("overdue_notified_on", null)
        .lt("due_date", today)
        .order("id")
        .range(from, to));
  } catch (error: unknown) {
    console.error("GMP overdue query failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }

  const notifiable = overdue.filter(f => f.team_members?.email);
  if (notifiable.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "No newly overdue findings" });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://kernelapp.co.uk";

  // One email per assignee listing everything of theirs that's newly overdue.
  const byEmail = new Map<string, any[]>();
  for (const f of notifiable) {
    const list = byEmail.get(f.team_members.email) ?? [];
    list.push(f);
    byEmail.set(f.team_members.email, list);
  }

  let emailsSent = 0;
  const failures: { recipient: string; error: string }[] = [];

  for (const [recipient, group] of byEmail) {
    const blocks = group.map(f => {
      const area = f.gmp_audits?.gmp_areas?.name ?? "GMP audit";
      const riskColor = f.risk === "high" ? "#b91c1c" : f.risk === "medium" ? "#b45309" : "#15803d";
      const due = new Date(f.due_date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" });
      return `
        <div style="background:#F7F2E8;border-radius:8px;padding:16px 18px;margin:16px 0">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${riskColor}">
            ${f.risk} risk · ${escapeHtml(area)} · was due ${escapeHtml(due)}
          </p>
          <p style="margin:0 0 10px;color:#3A3520;font-size:15px">${escapeHtml(f.description)}</p>
          <a href="${baseUrl}/compliance/gmp-audits/${f.audit_id}" style="display:inline-block;background:#F5C65A;color:#3A3520;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">
            Close out →
          </a>
        </div>`;
    }).join("");

    const subject = group.length === 1
      ? "Overdue GMP action needs closing out"
      : `${group.length} overdue GMP actions need closing out`;

    // Resend returns { data, error } — it does NOT throw on API-level errors.
    try {
      const { error: sendError } = await resend.emails.send({
        from: `Kernel <${FROM_EMAIL}>`,
        to: recipient,
        subject,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#F5C65A;padding:20px 24px;border-radius:8px 8px 0 0">
              <h1 style="color:#3A3520;margin:0;font-size:18px">Kernel — overdue GMP action${group.length > 1 ? "s" : ""}</h1>
            </div>
            <div style="background:#fff;border:1px solid #EDE5D0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
              <p style="margin-top:0;color:#3A3520">Hi ${escapeHtml(group[0].team_members?.name ?? "")},</p>
              <p style="color:#3A3520">The following GMP audit ${group.length === 1 ? "finding is" : "findings are"} past ${group.length === 1 ? "its" : "their"} due date and still open:</p>
              ${blocks}
              <p style="margin-bottom:0;color:#9ca3af;font-size:12px;margin-top:28px">
                Kernel App · <a href="${baseUrl}" style="color:#9ca3af">kernelapp.co.uk</a>
              </p>
            </div>
          </div>`,
      });

      if (sendError) {
        // Don't mark — tomorrow's run retries the whole group.
        console.error(`GMP overdue email to ${recipient} failed:`, sendError);
        failures.push({ recipient, error: sendError.message ?? String(sendError) });
        continue;
      }

      await supabase
        .from("gmp_findings")
        .update({ overdue_notified_on: today })
        .in("id", group.map(f => f.id));
      emailsSent++;
    } catch (err: any) {
      console.error(`GMP overdue email to ${recipient} failed:`, err);
      failures.push({ recipient, error: err?.message ?? String(err) });
    }
  }

  return NextResponse.json({ ok: true, emailsSent, findings: notifiable.length, failed: failures.length, failures });
}

function escapeHtml(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
