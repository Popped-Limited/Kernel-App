import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { Resend } from "resend";

// Called hourly by Vercel Cron — see vercel.json. Emails every trialing
// subscriber ONCE, 48 hours before their free trial ends, saying exactly when
// the first charge happens and how to cancel before it. Deliberate policy:
// Kernel never lets a trial roll into a charge without warning.
//
// Stripe is the source of truth (not organisations.trial_ends_at, which is a
// webhook mirror): we list `trialing` subscriptions directly, and record the
// send in the subscription's metadata (`trial_reminder_sent_at`) so no DB
// migration or new table is needed and a resent webhook can't double-send.
// Subscriptions already set to cancel_at_period_end are skipped — they lapse
// without charge, so there's nothing to warn about.

const CRON_SECRET = process.env.CRON_SECRET ?? "";
const FROM_EMAIL  = process.env.FROM_EMAIL ?? "compliance@kernelapp.co.uk";
const REPLY_TO    = "support@kernelapp.co.uk";
const WINDOW_MS   = 48 * 60 * 60 * 1000;

// Vercel Cron uses GET; POST stays available for manual triggering.
export async function GET(req: NextRequest)  { return runTrialReminders(req); }
export async function POST(req: NextRequest) { return runTrialReminders(req); }

async function runTrialReminders(req: NextRequest) {
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization");
    const body = await req.json().catch(() => ({} as any));
    if (auth !== `Bearer ${CRON_SECRET}` && body.secret !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const resend  = new Resend(process.env.RESEND_API_KEY);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://kernelapp.co.uk";
  const now     = Date.now();

  let sent = 0;
  let alreadySent = 0;
  const failures: { subscription: string; error: string }[] = [];

  // Auto-paginates through every trialing subscription.
  for await (const sub of stripe.subscriptions.list({
    status: "trialing",
    limit: 100,
    expand: ["data.customer"],
  })) {
    if (!sub.trial_end) continue;
    const endMs = sub.trial_end * 1000;
    if (endMs <= now || endMs - now > WINDOW_MS) continue;
    if (sub.cancel_at_period_end) continue;
    if (sub.metadata?.trial_reminder_sent_at) { alreadySent++; continue; }

    const customer = sub.customer as Stripe.Customer | Stripe.DeletedCustomer;
    const email = customer && !customer.deleted ? customer.email : null;
    if (!email) {
      failures.push({ subscription: sub.id, error: "No customer email on subscription" });
      continue;
    }

    const price = sub.items?.data?.[0]?.price;
    const priceLabel = price?.unit_amount
      ? `£${(price.unit_amount / 100).toFixed(price.unit_amount % 100 ? 2 : 0)}/month`
      : "£149/month";
    const endDateLabel = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long",
    }).format(new Date(endMs));

    // Resend returns { data, error } — it does NOT throw on API-level errors.
    // On failure we DON'T set the metadata flag, so the next hourly run retries.
    const { error: sendError } = await resend.emails.send({
      from: `Kernel <${FROM_EMAIL}>`,
      to: email,
      reply_to: REPLY_TO,
      subject: `Your Kernel free trial ends on ${endDateLabel}`,
      html: trialReminderHtml({
        name: (!customer.deleted && customer.name) || null,
        endDateLabel,
        priceLabel,
        baseUrl,
      }),
    });

    if (sendError) {
      console.error(`Trial reminder to ${email} (${sub.id}) failed:`, sendError);
      failures.push({ subscription: sub.id, error: sendError.message ?? String(sendError) });
      continue;
    }

    // Stripe merges metadata keys, so organisation_id/referral_source are kept.
    await stripe.subscriptions.update(sub.id, {
      metadata: { trial_reminder_sent_at: new Date().toISOString() },
    });
    sent++;
  }

  return NextResponse.json({ ok: true, sent, alreadySent, failed: failures.length, failures });
}

function trialReminderHtml(opts: {
  name: string | null;
  endDateLabel: string;
  priceLabel: string;
  baseUrl: string;
}) {
  const greeting = opts.name ? `Hi ${escapeHtml(opts.name)},` : "Hi,";
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#F5C65A;padding:20px 24px;border-radius:8px 8px 0 0">
        <h1 style="color:#3A3520;margin:0;font-size:18px">Kernel — your free trial ends in 2 days</h1>
      </div>
      <div style="background:#fff;border:1px solid #EDE5D0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <p style="margin-top:0;color:#3A3520">${greeting}</p>
        <p style="color:#3A3520">
          Just a heads-up: your Kernel free trial ends on <strong>${escapeHtml(opts.endDateLabel)}</strong>.
          We don't want any surprises on your card, so here's exactly what happens next.
        </p>
        <div style="background:#F7F2E8;border-radius:8px;padding:16px 18px;margin:16px 0">
          <p style="margin:0 0 8px;font-size:15px;color:#3A3520">
            <strong>If you'd like to keep Kernel</strong> — there's nothing to do. Your subscription
            starts automatically at ${escapeHtml(opts.priceLabel)} when the trial ends.
          </p>
          <p style="margin:0;font-size:15px;color:#3A3520">
            <strong>If it's not for you</strong> — cancel before ${escapeHtml(opts.endDateLabel)} and
            you won't be charged a penny. Go to <em>Account&nbsp;&rarr;&nbsp;Billing&nbsp;&rarr;&nbsp;Manage
            billing&nbsp;&rarr;&nbsp;Cancel plan</em>. It takes under a minute.
          </p>
        </div>
        <a href="${opts.baseUrl}/account/billing" style="display:inline-block;background:#F5C65A;color:#3A3520;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
          Manage my billing &rarr;
        </a>
        <p style="color:#3A3520;margin-top:20px">
          Questions, or need more time to decide? Just reply to this email and we'll sort it out.
        </p>
        <p style="margin-bottom:0;color:#9ca3af;font-size:12px;margin-top:28px">
          You're receiving this because you started a Kernel free trial.<br/>
          Kernel App · <a href="${opts.baseUrl}" style="color:#9ca3af">kernelapp.co.uk</a>
        </p>
      </div>
    </div>
  `;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
