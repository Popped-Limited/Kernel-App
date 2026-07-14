"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useOrganisation } from "@/contexts/OrganisationContext";

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    trial:     { label: "Setting up",     cls: "bg-gray-100 text-gray-600" },
    trialing:  { label: "Free trial",     cls: "bg-blue-100 text-blue-700" },
    active:    { label: "Active",         cls: "bg-green-100 text-green-700" },
    comp:      { label: "Complimentary",  cls: "bg-brand/30 text-brown" },
    past_due:  { label: "Payment overdue", cls: "bg-amber-100 text-amber-700" },
    cancelled: { label: "Cancelled",      cls: "bg-red-100 text-red-700" },
    unpaid:    { label: "Payment failed", cls: "bg-red-100 text-red-700" },
  };
  const s = map[status ?? ""] ?? { label: "Unknown", cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function BillingContent() {
  const { subscriptionStatus, trialEndsAt, stripeCustomerId, loading } = useOrganisation();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Set when the billing gate (middleware) bounced them here — explain why.
  const gated = searchParams.get("setup") === "1";
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  async function openPortal() {
    setOpening(true);
    setError("");
    const res = await fetch("/api/create-portal-session", { method: "POST" });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      setError(data.error ?? "Failed to open billing portal");
      setOpening(false);
    }
  }

  async function openCheckout() {
    setOpening(true);
    setError("");
    const res = await fetch("/api/create-checkout-session", { method: "POST" });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      setError(data.error ?? "Failed to start checkout");
      setOpening(false);
    }
  }

  if (loading) {
    return (
      <main className="flex-1 p-6 lg:p-8">
        <div className="animate-pulse h-6 w-32 bg-brown/10 rounded mb-4" />
      </main>
    );
  }

  const isTrialing  = subscriptionStatus === "trialing";
  const isActive    = subscriptionStatus === "active";
  const isComp      = subscriptionStatus === "comp";
  const isPastDue   = subscriptionStatus === "past_due";
  const isCancelled = subscriptionStatus === "cancelled" || subscriptionStatus === "unpaid";
  const hasStripe   = !!stripeCustomerId;

  return (
    <main className="flex-1 p-6 lg:p-8 max-w-2xl">
      {gated && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">
            {isCancelled ? "Your subscription has ended" : "Finish setting up your account"}
          </p>
          <p className="text-sm text-amber-800 mt-1">
            {isCancelled
              ? "Access to Kernel is paused until you resubscribe. Your records and data are safe — resubscribe below to pick up where you left off."
              : "Kernel is locked until billing setup is complete. Add your payment details below to start your free trial — you won't be charged until it ends, and you can cancel any time."}
          </p>
        </div>
      )}

      <h1 className="text-2xl font-serif text-brown mb-1">Billing</h1>
      <p className="text-sm text-brown/60 mb-8">Manage your Kernel subscription</p>

      {/* Plan card */}
      <div className="card p-6 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brown/50 mb-1">Current plan</p>
            <p className="text-xl font-serif text-brown">Kernel — £149/month</p>
          </div>
          <StatusBadge status={subscriptionStatus} />
        </div>

        {isTrialing && trialEndsAt && (
          <p className="text-sm text-brown/70 mb-4">
            Your free trial ends on <strong>{formatDate(trialEndsAt)}</strong>. No charge until then.
          </p>
        )}

        {isActive && (
          <p className="text-sm text-brown/70 mb-4">
            Your subscription is active. You can manage payment details and cancel below.
          </p>
        )}

        {isPastDue && (
          <p className="text-sm text-amber-700 mb-4">
            Your last payment failed. Please update your payment method to avoid losing access.
          </p>
        )}

        {isCancelled && (
          <p className="text-sm text-red-700 mb-4">
            Your subscription has ended. Resubscribe to regain access.
          </p>
        )}

        {isComp && (
          <p className="text-sm text-brown/70 mb-4">
            This is a complimentary account — full access with no payment required. There&apos;s nothing to set up.
          </p>
        )}

        {!isComp && !hasStripe && (subscriptionStatus === "trial" || !subscriptionStatus) && (
          <p className="text-sm text-brown/70 mb-4">
            {/* Trial length varies (Beacon referrals get 30 days, direct signups 7) — don't hardcode it. */}
            Complete your billing setup to activate your free trial. No charge until the trial ends.
          </p>
        )}

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {!isComp && (hasStripe ? (
          <button
            onClick={openPortal}
            disabled={opening}
            className="btn-primary px-5 py-2"
          >
            {opening ? "Opening…" : "Manage billing"}
          </button>
        ) : (
          <button
            onClick={openCheckout}
            disabled={opening}
            className="btn-primary px-5 py-2"
          >
            {opening ? "Loading…" : "Complete billing setup"}
          </button>
        ))}
      </div>

      {/* What's included */}
      <div className="card p-6">
        <p className="text-sm font-semibold text-brown mb-3">What&apos;s included</p>
        <ul className="space-y-2">
          {[
            "Unlimited QR code checklists & production records",
            "Full SALSA audit trail & digital sign-offs",
            "Goods in / goods out & supplier management",
            "Full forward & backward traceability",
            "Auto-deducting inventory & live stock value",
            "SOP builder & storage",
            "Training portal — policies, guided sessions & records",
            "Missed check email alerts",
            "Unlimited users",
          ].map(item => (
            <li key={item} className="flex items-center gap-2 text-sm text-brown/70">
              <svg className="h-4 w-4 text-green-500 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8l4 4 6-6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Stripe Climate contribution */}
      <div className="card p-6 mt-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-brand/25 text-brown">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
              <path d="M2 22c1.5-7 6-10 9-12" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-brown">1% goes to carbon removal</p>
            <p className="text-sm text-brown-light mt-1">
              We direct 1% of your subscription to frontier carbon removal projects through Stripe Climate.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function BillingPage() {
  // useSearchParams needs a Suspense boundary (same pattern as the signup page)
  return (
    <Suspense>
      <BillingContent />
    </Suspense>
  );
}
