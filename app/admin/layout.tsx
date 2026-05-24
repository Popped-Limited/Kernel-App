"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { OrganisationProvider, useOrganisation } from "@/contexts/OrganisationContext";

// Shown in place of page content when subscription has lapsed
function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { subscriptionStatus, loading } = useOrganisation();
  const pathname = usePathname();

  // Billing page is always accessible so they can fix their subscription
  if (pathname.startsWith("/admin/billing")) return <>{children}</>;
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
        <Link href="/admin/billing" className="btn-primary inline-block px-6 py-2">
          Manage billing
        </Link>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <OrganisationProvider>
      <div className="flex min-h-screen bg-brand-cream">
        <AppSidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 lg:ml-56 flex flex-col min-h-screen">
          {/* Mobile top bar */}
          <div className="lg:hidden sticky top-0 z-20 bg-white border-b border-gray-200 flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded text-gray-600 hover:bg-gray-100"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <rect y="3" width="20" height="2" rx="1"/>
                <rect y="9" width="20" height="2" rx="1"/>
                <rect y="15" width="20" height="2" rx="1"/>
              </svg>
            </button>
            <p className="font-serif text-lg text-brown">Kernel</p>
            <div className="w-8" />
          </div>

          <SubscriptionGate>{children}</SubscriptionGate>
        </div>
      </div>
    </OrganisationProvider>
  );
}
