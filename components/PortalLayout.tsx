"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { OrganisationProvider, useOrganisation } from "@/contexts/OrganisationContext";

// Shared portal shell used by every signed-in section (admin, compliance,
// production, account). Provides the org context, sidebar and the lapsed-
// subscription gate. Each section's layout.tsx is a thin wrapper around this.

// Shown in place of page content when subscription has lapsed
function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { subscriptionStatus, loading } = useOrganisation();
  const pathname = usePathname();

  // Billing page is always accessible so they can fix their subscription
  if (pathname.startsWith("/account/billing")) return <>{children}</>;
  if (loading) return <>{children}</>;

  const blocked = subscriptionStatus === "cancelled" || subscriptionStatus === "unpaid";
  if (!blocked) return <>{children}</>;

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <svg className="h-7 w-7 text-red-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="10" cy="10" r="8"/>
            <path d="M10 6v4M10 14h.01" strokeLinecap="round"/>
          </svg>
        </div>
        <h2 className="text-xl font-serif text-brown mb-2">Subscription ended</h2>
        <p className="text-sm text-brown/60 mb-6">
          Your subscription has ended. Update your billing details to continue using Kernel.
        </p>
        <Link href="/account/billing" className="btn-primary inline-block px-6 py-2">
          Manage billing
        </Link>
      </div>
    </div>
  );
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <OrganisationProvider>
      <div className="flex min-h-screen bg-brand-cream">
        <AppSidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 lg:ml-56 flex flex-col min-h-screen overflow-x-hidden">
          {/* Mobile top bar */}
          <div className="lg:hidden sticky top-0 z-20 bg-white border-b border-gray-200 flex items-center justify-between px-5 py-4">
            <p className="font-serif text-3xl text-brown leading-none">Kernel</p>
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg bg-brand/20 hover:bg-brand/40 transition-colors"
              aria-label="Open menu"
            >
              <svg className="h-6 w-6 text-brown" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M3 12h18M3 18h18"/>
              </svg>
            </button>
          </div>

          <SubscriptionGate>{children}</SubscriptionGate>
        </div>
      </div>
    </OrganisationProvider>
  );
}
