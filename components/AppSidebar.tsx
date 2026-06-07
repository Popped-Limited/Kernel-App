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
  home:        "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  box:         "M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9",
  arrowDown:   "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3",
  arrowUp:     "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5",
  clipboard:   "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  archive:     "M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.75 7.5h16.5M4.5 5.25h15a.75.75 0 00.75-.75v-.75a.75.75 0 00-.75-.75H4.5a.75.75 0 00-.75.75v.75c0 .414.336.75.75.75z",
  document:    "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  building:    "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21",
  bolt:        "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
  academic:    "M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5",
  squares:     "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z",
  list:        "M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
  users:       "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
  qr:          "M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z",
  question:    "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z",
  user:        "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
  card:        "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z",
  play:        "M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z",
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
  const [prodMenuOpen, setProdMenuOpen]   = useState(false);
  const [supportOpen, setSupportOpen]     = useState(false);
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
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} />
      )}

      <aside className={`
        fixed top-0 left-0 z-40 h-screen w-56 bg-brand-light border-r border-brown/10 flex flex-col
        transition-transform duration-200
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0
      `}>
        {/* Logo */}
        <Link href="/home" onClick={onClose} className="px-4 py-4 border-b border-brown/15 flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/popcorn.png" alt="" className="h-9 w-auto shrink-0 drop-shadow-sm" />
          <p className="font-serif text-4xl text-brown leading-none tracking-tight">Kernel</p>
        </Link>

        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-5">

          {/* Dashboard — always visible */}
          <Link
            href="/home"
            onClick={onClose}
            className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors ${
              pathname === "/home"
                ? "bg-brand text-brown"
                : "text-brown hover:bg-brand/30"
            }`}
          >
            <SvgIcon d={ICONS.home} />
            Dashboard
          </Link>

          {/* Sections */}
          {NAV.filter(section => loading || canSee(role, section.minRole)).map(section => (
            <div key={section.title}>
              <p className="px-2 mb-1 flex items-center gap-1.5 text-sm font-bold text-brown">
                <SvgIcon d={ICONS[section.icon as keyof typeof ICONS]} />
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.title === "Production" && (
                  <li>
                    <button
                      onClick={() => setProdMenuOpen(o => !o)}
                      className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-brown hover:bg-brand/30 transition-colors"
                    >
                      <span className="flex-1 text-left">Begin Production</span>
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

      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  );
}
