import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let referralSource: string | null = body.referral_source === "beacon" ? "beacon" : null;

    // Get the authenticated user from their session cookie
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get their organisation
    const { data: member, error: memberError } = await supabaseAdmin
      .from("organisation_members")
      .select("organisation_id")
      .eq("user_id", user.id)
      .single();

    if (memberError || !member) {
      return NextResponse.json({ error: "No organisation found for this account" }, { status: 400 });
    }

    // Load the org's billing state. The referral only rides in the request body
    // when checkout starts from the signup flow; if the user abandons checkout
    // and resumes later from the billing page (which posts no body), the org row
    // still remembers the referral — honour it so Beacon attribution survives.
    const { data: org } = await supabaseAdmin
      .from("organisations")
      .select("stripe_customer_id, referral_source")
      .eq("id", member.organisation_id)
      .single();

    if (!referralSource && org?.referral_source === "beacon") referralSource = "beacon";

    const existingCustomerId = org?.stripe_customer_id ?? null;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://kernelapp.co.uk";

    // The 30-day trial (raised from 7 on 28 Jul 2026 — SALSA setup takes longer
    // than a week) is a ONE-TIME offer. A stripe_customer_id is only ever set by
    // the webhook after a completed checkout, so if the org already has one it
    // has been through checkout and used its trial: a returning/lapsed org
    // subscribes with NO trial and is charged immediately. referralSource is
    // kept purely for attribution.
    const trialDays = existingCustomerId ? 0 : 30;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      subscription_data: {
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
        metadata: {
          organisation_id: member.organisation_id,
          ...(referralSource ? { referral_source: referralSource } : {}),
        },
      },
      // Reuse the existing Stripe customer when we have one — prevents duplicate
      // customers per org and keeps trial history attached to it; otherwise let
      // Stripe create one from the email.
      ...(existingCustomerId ? { customer: existingCustomerId } : { customer_email: user.email }),
      metadata: {
        organisation_id: member.organisation_id,
        ...(referralSource ? { referral_source: referralSource } : {}),
      },
      success_url: `${appUrl}/account/billing/confirm?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/signup?cancelled=1`,
    });

    return NextResponse.json({ url: session.url });

  } catch (err) {
    console.error("Create checkout session error:", err);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
