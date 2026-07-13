import Stripe from "stripe";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Landing point after a completed Stripe Checkout. The `checkout.session.completed`
// webhook also writes these fields, but it's async and may not have fired before the
// browser redirect — which would bounce a customer who just paid back to the billing
// gate. So we reconcile the org synchronously here (idempotent with the webhook) and
// only then send them into the app.
export default async function CheckoutConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  if (session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id, {
        expand: ["subscription"],
      });

      const orgId = session.metadata?.organisation_id;
      const sub = session.subscription as Stripe.Subscription | null;

      // Only trust a genuinely completed session — never let an abandoned one
      // through (that would defeat the gate). session.customer / subscription
      // are populated once checkout completes.
      if (session.status === "complete" && orgId && session.customer) {
        const updates: Record<string, string | null> = {
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: sub?.id ?? null,
          subscription_status: sub?.status ?? "trialing",
        };
        if (session.metadata?.referral_source) {
          updates.referral_source = session.metadata.referral_source;
        }
        await supabaseAdmin.from("organisations").update(updates).eq("id", orgId);
      }
    } catch (err) {
      // The webhook will still reconcile — worst case they see the billing page briefly.
      console.error("Checkout confirm failed (webhook will reconcile):", err);
    }
  }

  redirect("/dashboard?welcome=1");
}
