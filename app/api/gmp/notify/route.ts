import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Emails the team member a GMP finding was just assigned to. Called by the
// audit page right after the finding is saved — the email is a courtesy, so
// a failure here must never be treated as a failed save by the caller.
//
// Auth: signed-in users only, and the finding must belong to the caller's own
// org (checked against organisation_members, NOT trusted from the request) —
// otherwise this would be a cross-org email oracle.

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { finding_id } = await req.json();
    if (!finding_id) return NextResponse.json({ error: "finding_id required" }, { status: 400 });

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
      .select("organisation_id")
      .eq("user_id", user.id)
      .single();
    const orgId = member?.organisation_id;
    if (!orgId) return NextResponse.json({ error: "No organisation" }, { status: 403 });

    const { data: finding } = await supabaseAdmin
      .from("gmp_findings")
      .select("*, gmp_audits(audit_date, gmp_areas(name))")
      .eq("id", finding_id)
      .single();
    if (!finding || finding.organisation_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!finding.assigned_to) {
      return NextResponse.json({ error: "Finding has no assignee" }, { status: 400 });
    }

    const { data: assignee } = await supabaseAdmin
      .from("team_members")
      .select("name, email, organisation_id")
      .eq("id", finding.assigned_to)
      .single();
    if (!assignee?.email || assignee.organisation_id !== orgId) {
      return NextResponse.json({ error: "Assignee has no email" }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://kernelapp.co.uk";
    const fromEmail = process.env.FROM_EMAIL ?? "compliance@kernelapp.co.uk";
    const areaName = (finding as any).gmp_audits?.gmp_areas?.name ?? "GMP audit";
    const link = `${baseUrl}/compliance/gmp-audits/${finding.audit_id}`;
    const riskLabel = { high: "High", medium: "Medium", low: "Low" }[finding.risk as "high" | "medium" | "low"] ?? finding.risk;
    const dueLabel = finding.due_date
      ? new Date(finding.due_date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : null;
    const firstPhoto: string | null = Array.isArray(finding.photos) && finding.photos.length > 0 ? finding.photos[0] : null;

    // Resend returns { data, error } — it does NOT throw on API-level errors.
    const { error: sendError } = await resend.emails.send({
      from: `Kernel <${fromEmail}>`,
      to: assignee.email,
      subject: `GMP action for you — ${areaName} (${riskLabel} risk)`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#F5C65A;padding:20px 24px;border-radius:8px 8px 0 0">
            <h1 style="color:#3A3520;margin:0;font-size:18px">Kernel — GMP audit action</h1>
          </div>
          <div style="background:#fff;border:1px solid #EDE5D0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
            <p style="margin-top:0;color:#3A3520">Hi ${escapeHtml(assignee.name ?? "")},</p>
            <p style="color:#3A3520">A finding from the <strong>${escapeHtml(areaName)}</strong> GMP audit has been assigned to you to close out:</p>
            <div style="background:#F7F2E8;border-radius:8px;padding:16px 18px;margin:16px 0">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${finding.risk === "high" ? "#b91c1c" : finding.risk === "medium" ? "#b45309" : "#15803d"}">${riskLabel} risk${dueLabel ? ` · due ${escapeHtml(dueLabel)}` : ""}</p>
              <p style="margin:0;color:#3A3520;font-size:15px">${escapeHtml(finding.description)}</p>
              ${finding.action_plan ? `<p style="margin:8px 0 0;color:#7A7050;font-size:13px">Action plan: ${escapeHtml(finding.action_plan)}</p>` : ""}
              ${firstPhoto ? `<img src="${firstPhoto}" alt="Finding photo" style="margin-top:12px;max-width:100%;border-radius:6px"/>` : ""}
            </div>
            <a href="${link}" style="display:inline-block;background:#F5C65A;color:#3A3520;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
              View &amp; close out in Kernel →
            </a>
            <p style="margin-bottom:0;color:#9ca3af;font-size:12px;margin-top:28px">
              When it's done, close it out in Kernel with a note (and an after photo if useful).<br/>
              Kernel App · <a href="${baseUrl}" style="color:#9ca3af">kernelapp.co.uk</a>
            </p>
          </div>
        </div>`,
    });
    if (sendError) {
      console.error("GMP assignment email failed:", sendError);
      return NextResponse.json({ error: sendError.message ?? "Email failed" }, { status: 502 });
    }

    await supabaseAdmin
      .from("gmp_findings")
      .update({ assigned_notified_at: new Date().toISOString() })
      .eq("id", finding_id);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("GMP notify failed:", err);
    return NextResponse.json({ error: err?.message ?? "Something went wrong" }, { status: 500 });
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
