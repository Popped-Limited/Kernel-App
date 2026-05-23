import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.organisation_id;
      if (!orgId) break;

      await supabaseAdmin
        .from("organisations")
        .update({
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          subscription_status: "trialing",
        })
        .eq("id", orgId);
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.organisation_id;
      if (!orgId) break;

      await supabaseAdmin
        .from("organisations")
        .update({
          subscription_status: sub.status,
          trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          current_period_end: sub.items?.data?.[0]?.current_period_end
            ? new Date(sub.items.data[0].current_period_end * 1000).toISOString()
            : null,
        })
        .eq("id", orgId);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.organisation_id;
      if (!orgId) break;

      await supabaseAdmin
        .from("organisations")
        .update({ subscription_status: "cancelled" })
        .eq("id", orgId);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;

      await supabaseAdmin
        .from("organisations")
        .update({ subscription_status: "past_due" })
        .eq("stripe_customer_id", customerId);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
