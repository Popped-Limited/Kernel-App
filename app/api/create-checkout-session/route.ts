import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  // Get the authenticated user from their session
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Get their organisation
  const { data: member } = await supabaseAdmin
    .from("organisation_members")
    .select("organisation_id")
    .eq("user_id", user.id)
    .single();

  if (!member) {
    return NextResponse.json({ error: "No organisation found" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://kernelapp.co.uk";

  // Create Stripe checkout session with 7-day trial
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      metadata: { organisation_id: member.organisation_id },
    },
    customer_email: user.email,
    metadata: { organisation_id: member.organisation_id },
    success_url: `${appUrl}/home?welcome=1`,
    cancel_url: `${appUrl}/signup?cancelled=1`,
  });

  return NextResponse.json({ url: session.url });
}
