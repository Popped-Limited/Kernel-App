"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import SupportModal from "@/components/SupportModal";
import type { Checklist } from "@/lib/types";

function SvgIcon({ d }: { d: string }) {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  home:      "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  // Chef's hat: puffed dome above a flat band
  box:       "M5 15h14v4H5zM5 15C5 12 4.5 9 5.5 7 6.5 5 9 3.5 12 3.5 15 3.5 17.5 5 18.5 7 19.5 9 19 12 19 15",
  clipboard: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  squares:   "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z",
  card:      "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z",
};

const NAV = [
  {
    title: "Production",
    icon: "box",
    minRole: "staff",
    items: [
      { label: "Finished Goods", href: "/admin/finished-goods" },
      { label: "Goods In",       href: "/admin/goods-in"       },
      { label: "Goods Out",      href: "/admin/goods-out"      },
    ],
  },
  {
    title: "Compliance",
    icon: "clipboard",
    minRole: "staff",
    items: [
      { label: "Checklist Submissions", href: "/dashboard"           },
      { label: "Raw Materials",         href: "/admin/stock"         },
      { label: "SOPs",                  href: "/admin/sops"          },
      { label: "Suppliers",             href: "/admin/suppliers"     },
      { label: "Traceability",          href: "/admin/traceability"  },
      { label: "Training",              href: "/admin/team/training" },
    ],
  },
  {
    title: "Admin",
    icon: "squares",
    minRole: "manager",
    items: [
      { label: "Create Production Flow", href: "/admin/production-builder" },
      { label: "Manage Checklists",      href: "/admin/checklists"         },
      { label: "Manage Training",        href: "/admin/training-setup"     },
      { label: "Print QR Codes",         href: "/print-qr"                 },
      { label: "SAQ Questions",          href: "/admin/saq-questions"      },
      { label: "Staff Members",          href: "/admin/team/staff"         },
    ],
  },
  {
    title: "Account",
    icon: "card",
    minRole: "admin",
    items: [
      { label: "Billing", href: "/admin/billing" },
      { label: "Users",   href: "/admin/users"   },
    ],
  },
] as const;

const ROLE_RANK: Record<string, number> = { staff: 1, manager: 2, admin: 3 };

function canSee(userRole: string | null, minRole: string) {
  if (!userRole) return false;
  return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[minRole] ?? 99);
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

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
      <SvgIcon d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
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
  const { role, loading } = useOrganisation();
  const [supportOpen, setSupportOpen] = useState(false);
  const [batchChecklists, setBatchChecklists] = useState<Checklist[]>([]);
  const [beginProdOpen, setBeginProdOpen] = useState(false);

  // Which sections are open — default to whichever section contains the current page
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const section of NAV) {
      const active = section.items.some(
        item => pathname === item.href || pathname.startsWith(item.href + "/")
      );
      if (active) initial[section.title] = true;
    }
    return initial;
  });

  function toggleSection(title: string) {
    setOpenSections(prev => ({ ...prev, [title]: !prev[title] }));
  }

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
      {/* Desktop sidebar — always visible on lg+, hidden on mobile */}
      <aside className="hidden lg:flex fixed top-0 left-0 z-40 h-screen w-56 bg-brand-light border-r border-brown/10 flex-col">
        {/* Logo */}
        <Link href="/home" className="px-4 py-4 border-b border-brown/15 flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/popcorn.png" alt="" className="h-9 w-auto shrink-0 drop-shadow-sm" />
          <p className="font-serif text-4xl text-brown leading-none tracking-tight">Kernel</p>
        </Link>

        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
          <Link
            href="/home"
            className={`flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm font-bold transition-colors ${
              pathname === "/home" ? "bg-brand text-brown" : "text-brown hover:bg-brand/30"
            }`}
          >
            <SvgIcon d={ICONS.home} />
            Dashboard
          </Link>

          {NAV.filter(section => loading || canSee(role, section.minRole)).map(section => {
            const isOpen = !!openSections[section.title];
            return (
              <div key={section.title}>
                <button
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm font-bold text-brown hover:bg-brand/30 transition-colors"
                >
                  <SvgIcon d={ICONS[section.icon as keyof typeof ICONS]} />
                  <span className="flex-1 text-left">{section.title}</span>
                  <Chevron open={isOpen} />
                </button>

                {isOpen && (
                  <ul className="mt-0.5 ml-2 space-y-0.5 border-l border-brown/20 pl-3">
                    {section.title === "Production" && (
                      <li>
                        <button
                          onClick={() => setBeginProdOpen(o => !o)}
                          className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm text-brown hover:bg-brown/10 transition-colors"
                        >
                          <span className="flex-1 text-left">Begin Production</span>
                          <Chevron open={beginProdOpen} />
                        </button>
                        {beginProdOpen && (
                          <ul className="mt-0.5 ml-2 space-y-0.5 border-l border-brown/20 pl-3">
                            {batchChecklists.map(cl => (
                              <li key={cl.id}>
                                <Link
                                  href={`/checklist/${cl.id}`}
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
                          className={`block rounded px-2 py-1.5 text-sm transition-colors ${
                            pathname === item.href || pathname.startsWith(item.href + "/")
                              ? "bg-brand text-brown font-semibold"
                              : "text-brown hover:bg-brown/10"
                          }`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-brown/15 space-y-1">
          <button
            onClick={() => setSupportOpen(true)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-brown/70 hover:bg-brown/10 hover:text-brown transition-colors text-left"
          >
            <SvgIcon d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            Contact support
          </button>
          <SignOutButton />
        </div>
      </aside>

      {/* Mobile full-screen menu overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-brand-light">
          {/* Mobile menu header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-brown/15">
            <p className="font-serif text-3xl text-brown leading-none tracking-tight">Kernel</p>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-brown/10 hover:bg-brown/20 transition-colors"
              aria-label="Close menu"
            >
              <svg className="h-6 w-6 text-brown" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Mobile nav — scrollable */}
          <nav className="flex-1 overflow-y-auto py-4 px-5 space-y-1">
            {/* Dashboard */}
            <Link
              href="/home"
              onClick={onClose}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-colors ${
                pathname === "/home" ? "bg-brand text-brown" : "text-brown hover:bg-brand/30"
              }`}
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d={ICONS.home} />
              </svg>
              Dashboard
            </Link>

            {NAV.filter(section => loading || canSee(role, section.minRole)).map(section => {
              const isOpen = !!openSections[section.title];
              return (
                <div key={section.title}>
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-brown hover:bg-brand/30 transition-colors"
                  >
                    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d={ICONS[section.icon as keyof typeof ICONS]} />
                    </svg>
                    <span className="flex-1 text-left">{section.title}</span>
                    <svg
                      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                      viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                    >
                      <path d="M4 6l4 4 4-4" />
                    </svg>
                  </button>

                  {isOpen && (
                    <ul className="mt-0.5 ml-3 space-y-0.5 border-l-2 border-brown/20 pl-3">
                      {section.title === "Production" && (
                        <li>
                          <button
                            onClick={() => setBeginProdOpen(o => !o)}
                            className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-brown hover:bg-brown/10 transition-colors"
                          >
                            <span className="flex-1 text-left font-medium">Begin Production</span>
                            <svg
                              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${beginProdOpen ? "rotate-180" : ""}`}
                              viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                            >
                              <path d="M4 6l4 4 4-4" />
                            </svg>
                          </button>
                          {beginProdOpen && (
                            <ul className="mt-0.5 ml-2 space-y-0.5 border-l border-brown/20 pl-3">
                              {batchChecklists.map(cl => (
                                <li key={cl.id}>
                                  <Link
                                    href={`/checklist/${cl.id}`}
                                    onClick={onClose}
                                    className="block rounded-lg px-3 py-2.5 text-sm text-brown hover:bg-brown/10 transition-colors"
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
                            className={`block rounded-lg px-3 py-2.5 text-sm transition-colors ${
                              pathname === item.href || pathname.startsWith(item.href + "/")
                                ? "bg-brand text-brown font-semibold"
                                : "text-brown hover:bg-brown/10"
                            }`}
                          >
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Mobile footer */}
          <div className="px-3 py-4 border-t border-brown/15 space-y-1">
            <button
              onClick={() => { setSupportOpen(true); onClose(); }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-brown/70 hover:bg-brown/10 hover:text-brown transition-colors text-left"
            >
              <SvgIcon d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              Contact support
            </button>
            <SignOutButton />
          </div>
        </div>
      )}

      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  );
}
