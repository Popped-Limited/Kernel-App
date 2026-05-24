"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Checklist } from "@/lib/types";

const NAV = [
  {
    title: "Production",
    items: [
      { label: "Goods In",      href: "/admin/goods-in" },
      { label: "Goods Out",     href: "/admin/goods-out" },
      { label: "Raw Materials", href: "/admin/stock" },
    ],
  },
  {
    title: "Compliance",
    items: [
      { label: "Suppliers",    href: "/admin/suppliers" },
      { label: "Traceability", href: "/admin/traceability" },
    ],
  },
  {
    title: "Team",
    items: [
      { label: "Staff Members", href: "/admin/team/staff" },
      { label: "Training",      href: "/admin/team/training" },
    ],
  },
  {
    title: "Records",
    items: [
      { label: "All Submissions", href: "/dashboard" },
      { label: "Print QR Codes",  href: "/print-qr" },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Create Production Run", href: "/admin/production-builder" },
      { label: "Manage Checklists",     href: "/admin/checklists" },
      { label: "SAQ Questions",         href: "/admin/saq-questions" },
      { label: "Manage Training",       href: "/admin/training-setup" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Users",   href: "/admin/users" },
      { label: "Billing", href: "/admin/billing" },
    ],
  },
];

function SignOutButton() {
  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <button
      onClick={handleSignOut}
      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-brown/70 hover:bg-brown/10 hover:text-brown transition-colors text-left"
    >
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M13 7l3 3m0 0l-3 3m3-3H7m6-7h2a2 2 0 012 2v12a2 2 0 01-2 2h-2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Sign out
    </button>
  );
}

interface Props {
  mobileOpen: boolean;
  onClose: () => void;
}

export default function AppSidebar({ mobileOpen, onClose }: Props) {
  const pathname = usePathname();
  const [prodMenuOpen, setProdMenuOpen] = useState(false);
  const [batchChecklists, setBatchChecklists] = useState<Checklist[]>([]);

  useEffect(() => {
    supabase
      .from("checklists")
      .select("id, name, frequency")
      .eq("active", true)
      .eq("frequency", "per_batch")
      .order("name")
      .then(({ data }) => { if (data) setBatchChecklists(data as Checklist[]); });
  }, []);

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} />
      )}

      <aside className={`
        fixed top-0 left-0 z-40 h-screen w-56 bg-brand-light border-r border-brown/10 flex flex-col
        transition-transform duration-200
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0
      `}>
        {/* Wordmark — home button */}
        <Link href="/home" onClick={onClose} className="px-4 py-4 border-b border-brown/15 flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/popcorn.png" alt="" className="h-9 w-auto shrink-0 drop-shadow-sm" />
          <p className="font-serif text-4xl text-brown leading-none tracking-tight">Kernel</p>
        </Link>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          {NAV.map(section => (
            <div key={section.title}>
              <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-brown/60">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.title === "Production" && (
                  <li>
                    <button
                      onClick={() => setProdMenuOpen(o => !o)}
                      className="w-full flex items-center justify-between rounded-md px-2.5 py-2 text-sm text-brown hover:bg-brown/10 transition-colors"
                    >
                      Begin Production
                      <svg className={`h-3.5 w-3.5 transition-transform ${prodMenuOpen ? "rotate-180" : ""}`}
                        viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M4 6l4 4 4-4"/>
                      </svg>
                    </button>
                    {prodMenuOpen && (
                      <ul className="mt-1 ml-2 space-y-0.5 border-l border-brown/20 pl-3">
                        {batchChecklists.map(cl => (
                          <li key={cl.id}>
                            <Link
                              href={`/checklist/${cl.id}`}
                              onClick={onClose}
                              className="block rounded px-2 py-1.5 text-xs text-brown hover:bg-brown/10 transition-colors"
                            >
                              {cl.name.replace(" — Production Record", "").replace(" - Production Record", "")}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )}
                {section.items.map(item => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
                        pathname === item.href || pathname.startsWith(item.href + "/")
                          ? "bg-brand text-brown font-semibold"
                          : "text-brown hover:bg-brand/30"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-brown/15">
          <SignOutButton />
        </div>
      </aside>
    </>
  );
}
