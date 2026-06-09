"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Checklist, Submission, IngredientLot, Ingredient, Dispatch } from "@/lib/types";
import { frequencyLabel, frequencyBadgeColor } from "@/lib/utils";
import AppSidebar from "@/components/AppSidebar";
import ProductionCalendar from "@/components/ProductionCalendar";

// ── Constants ─────────────────────────────────────────────────────────────────

const NAV = [
  {
    title: "Production",
    items: [
      { label: "Goods In", href: "/admin/goods-in" },
      { label: "Goods Out", href: "/admin/goods-out" },
      { label: "Raw Materials", href: "/admin/stock" },
    ],
  },
  {
    title: "Compliance",
    items: [
      { label: "Suppliers", href: "/admin/suppliers" },
      { label: "Traceability", href: "/admin/traceability" },
    ],
  },
  {
    title: "Records",
    items: [
      { label: "All Submissions", href: "/dashboard" },
      { label: "Print QR Codes", href: "/print-qr" },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Manage Checklists", href: "/admin/checklists" },
    ],
  },
];

const FREQ_GROUPS = [
  { key: "daily",      label: "Daily",                      freqs: ["per_shift_am", "per_shift_pm", "per_shift_eod"] },
  { key: "weekly",     label: "Weekly",                     freqs: ["weekly"]                                        },
  { key: "adhoc",      label: "Adhoc",                      freqs: ["adhoc", "monthly"]                              },
  { key: "production", label: "Production & Traceability",  freqs: ["per_batch", "per_delivery", "per_dispatch"]     },
  { key: "people",     label: "People",                     freqs: ["per_new_start"]                                 },
  { key: "incidents",  label: "Incidents",                  freqs: ["per_complaint", "per_corrective_action"]        },
] as const;

const GROUP_STYLE = { header: "border-brand/50 bg-brand-light text-brown", dot: "bg-brand", badge: "bg-brand-light text-brown" };

// ── Types ─────────────────────────────────────────────────────────────────────

interface SkuStock { name: string; produced: number; dispatched: number; inStock: number }

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [checklists, setChecklists]         = useState<Checklist[]>([]);
  const [recentSubs, setRecentSubs]         = useState<(Submission & { checklist: Checklist })[]>([]);
  const [pendingSignOff, setPendingSignOff] = useState<(Submission & { checklist: Checklist })[]>([]);
  const [openDrafts, setOpenDrafts]         = useState<Array<{ id: string; checklist_id: string; started_by: string; last_saved_at: string; checklist?: Checklist }>>([]);
  const [skuStock, setSkuStock]             = useState<SkuStock[]>([]);
  const [loading, setLoading]               = useState(true);
  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [activitySearch, setActivitySearch] = useState("");
  const [activityPeriod, setActivityPeriod] = useState<"week" | "month">("week");

  useEffect(() => { load(); }, []);

  async function load() {
    // Calculate current week start (Monday at midnight)
    const now = new Date();
    const daysFromMon = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysFromMon);
    weekStart.setHours(0, 0, 0, 0);

    // Recent activity: last 60 days (display only — date filter is appropriate here)
    const sixtyDaysAgo = new Date(now); sixtyDaysAgo.setDate(now.getDate() - 60);
    const [clRes, recentSubRes, pendingSubRes, draftRes, dispRes, batchSubRes] = await Promise.all([
      supabase.from("checklists").select("*").eq("active", true).order("name"),
      supabase.from("submissions").select("*, checklist:checklists(*)").gte("submitted_at", sixtyDaysAgo.toISOString()).order("submitted_at", { ascending: false }),
      // Pending sign-offs: no date limit — must never miss one
      supabase.from("submissions").select("*, checklist:checklists(*)").is("signed_off_at", null).order("submitted_at", { ascending: false }),
      supabase.from("batch_drafts").select("*, checklist:checklists(name, category)").order("last_saved_at", { ascending: false }),
      supabase.from("dispatches").select("product, total_units").gte("dispatch_date", weekStart.toISOString().slice(0, 10)),
      supabase.from("submissions").select("id, checklist:checklists(name, category), answers(value, question:questions(type, label))").eq("checklists.category", "Production").gte("submitted_at", weekStart.toISOString()),
    ]);

    if (clRes.data) setChecklists(clRes.data as Checklist[]);

    if (recentSubRes.data) {
      const all = recentSubRes.data as (Submission & { checklist: Checklist })[];
      setRecentSubs(all.filter(s => s.checklist));
    }

    if (pendingSubRes.data) {
      const all = pendingSubRes.data as (Submission & { checklist: Checklist })[];
      setPendingSignOff(all.filter(s => s.checklist));
    }

    if (draftRes.data) setOpenDrafts(draftRes.data as never);

    if (batchSubRes.data && dispRes.data) {
      const dispatched: Record<string, number> = {};
      for (const d of (dispRes.data as { product: string; total_units: number }[]))
        dispatched[d.product] = (dispatched[d.product] ?? 0) + d.total_units;

      const produced: Record<string, number> = {};
      for (const sub of (batchSubRes.data as never as Array<{ checklist: { name: string; category: string } | null; answers: Array<{ value: string | null; question: { type: string; label: string } | null }> }>)) {
        if (sub.checklist?.category !== "Production") continue;
        const sku = sub.checklist.name.replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim();
        for (const ans of (sub.answers ?? [])) {
          if (!ans.value) continue;
          // Prefer the explicit "Total units produced" field over jars_used
          if (ans.question?.label?.toLowerCase().includes("total units produced")) {
            produced[sku] = (produced[sku] ?? 0) + (Number(ans.value) || 0);
          }
        }
      }

      // Derive product list dynamically from production data — no hardcoded fallback
      const productList = Array.from(new Set([
        ...Object.keys(produced),
        ...Object.keys(dispatched),
      ])).sort();

      setSkuStock(productList.map(name => {
        const p = produced[name] ?? 0;
        const d = dispatched[name] ?? 0;
        return { name, produced: p, dispatched: d, inStock: Math.max(0, p - d) };
      }));
    }

    setLoading(false);
  }

  const todayCount = recentSubs.filter(s => new Date(s.submitted_at).toDateString() === new Date().toDateString()).length;
  const freqSet = new Set(FREQ_GROUPS.flatMap(g => g.freqs));
  const uncategorised = checklists.filter(cl => !freqSet.has(cl.frequency));

  return (
    <div className="flex min-h-screen bg-brand-cream">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <AppSidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 lg:ml-56 flex flex-col min-h-screen min-w-0">

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

        <div className="flex flex-1 min-h-0 min-w-0">
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8 space-y-6">

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
            <Link href="/admin/goods-in" className="btn-primary text-sm hidden sm:inline-flex">+ Goods In</Link>
          </div>

          {/* ── Production Calendar ────────────────────────────────────── */}
          <ProductionCalendar checklists={checklists} />

          {/* ── Alert strip ────────────────────────────────────────────── */}
          {pendingSignOff.length > 0 && (
            <Link href="/dashboard?filter=pending" className="flex items-center gap-3 rounded-xl border border-brand/50 bg-brand-light px-4 py-3 hover:bg-brand transition">
              <span className="h-2 w-2 rounded-full bg-brand-dark shrink-0" />
              <p className="text-sm font-medium text-brown">
                {pendingSignOff.length} submission{pendingSignOff.length !== 1 ? "s" : ""} awaiting sign-off
              </p>
              <span className="ml-auto text-xs text-brown/70">Review →</span>
            </Link>
          )}

          {/* ── Stats ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Today's submissions" value={todayCount} loading={loading} href="/dashboard" />
            <StatCard label="Awaiting sign-off" value={pendingSignOff.length} loading={loading} href="/dashboard?filter=pending" warn={pendingSignOff.length > 0} />
            <StatCard label="Active checklists" value={checklists.length} loading={loading} />
            <StatCard label="In-progress batches" value={openDrafts.length} loading={loading} warn={openDrafts.length > 0} />
          </div>

          {/* ── In-progress batches ────────────────────────────────────── */}
          {openDrafts.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">In Progress</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {openDrafts.map(d => {
                  const mins = Math.round((Date.now() - new Date(d.last_saved_at).getTime()) / 60000);
                  const ago = mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
                  return (
                    <div key={d.id} className="flex items-center gap-3 rounded-xl border border-brand/50 bg-brand-light px-4 py-3 transition">
                      <span className="h-2 w-2 rounded-full bg-brand-dark shrink-0 animate-pulse" />
                      <Link href={`/checklist/${d.checklist_id}`} className="flex-1 min-w-0 hover:opacity-80 transition">
                        <p className="text-sm font-medium text-brown truncate">{(d.checklist as Checklist | undefined)?.name ?? "Batch record"}</p>
                        <p className="text-xs text-brown/60">{d.started_by} · {ago}</p>
                      </Link>
                      <Link href={`/checklist/${d.checklist_id}`} className="text-xs text-brown/70 shrink-0 hover:text-brown transition">Continue →</Link>
                      <button
                        onClick={async () => {
                          if (!confirm("Delete this in-progress draft? This can't be undone.")) return;
                          await supabase.from("batch_drafts").delete().eq("id", d.id);
                          load();
                        }}
                        className="shrink-0 ml-1 rounded p-1 text-brown/40 hover:text-red-600 hover:bg-red-50 transition"
                        title="Delete draft"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"/>
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Checklists ─────────────────────────────────────────────── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Checklists</h2>
            <div className="space-y-3">
              {FREQ_GROUPS.map(group => {
                const items = checklists.filter(cl => (group.freqs as readonly string[]).includes(cl.frequency));
                if (items.length === 0) return null;
                const styles = GROUP_STYLE;
                return (
                  <ChecklistGroup
                    key={group.key}
                    label={group.label}
                    items={items}
                    styles={styles}
                    loading={loading}
                  />
                );
              })}
              {uncategorised.length > 0 && (
                <ChecklistGroup
                  label="Other"
                  items={uncategorised}
                  styles={GROUP_STYLE}
                  loading={loading}
                />
              )}
            </div>
          </section>

        </main>

        {/* ── Activity log — right panel ──────────────────────────────── */}
        <aside className="hidden xl:flex flex-col w-80 shrink-0 sticky top-0 h-screen border-l border-gray-200 bg-white overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-gray-200 shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Activity log</h2>
              <Link href="/dashboard" className="text-xs text-brown/70 hover:text-brown transition-colors">View all →</Link>
            </div>
            <input
              type="text"
              placeholder="Search checklists or submitted by…"
              value={activitySearch}
              onChange={e => setActivitySearch(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <div className="flex gap-1">
              {(["week", "month"] as const).map(p => (
                <button key={p} onClick={() => setActivityPeriod(p)}
                  className={`flex-1 px-2 py-1.5 rounded text-xs font-medium border transition-colors ${activityPeriod === p ? "bg-brand border-brand/50 text-brown" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                  {p === "week" ? "This Week" : "This Month"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {loading ? (
              <div className="p-4 text-sm text-gray-400 text-center">Loading…</div>
            ) : (() => {
              const now = new Date();
              const filtered = recentSubs.filter(s => {
                const dt = new Date(s.submitted_at);
                if (activityPeriod === "week") {
                  const daysFromMon = now.getDay() === 0 ? 6 : now.getDay() - 1;
                  const weekStart = new Date(now); weekStart.setDate(now.getDate() - daysFromMon); weekStart.setHours(0,0,0,0);
                  if (dt < weekStart) return false;
                } else {
                  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                  if (dt < monthStart) return false;
                }
                if (activitySearch) {
                  const q = activitySearch.toLowerCase();
                  return s.checklist?.name?.toLowerCase().includes(q) || s.submitted_by?.toLowerCase().includes(q);
                }
                return true;
              });
              if (filtered.length === 0) return <div className="p-4 text-sm text-gray-400 text-center">No submissions found.</div>;
              return filtered.map(s => {
                const dt = new Date(s.submitted_at);
                const isToday = dt.toDateString() === now.toDateString();
                const timeStr = isToday
                  ? dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                  : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                return (
                  <Link key={s.id} href={`/submission/${s.id}`} className="block px-4 py-3 hover:bg-gray-50 transition">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-brown/60 mb-0.5">{s.checklist?.category ?? "General"}</p>
                        <p className="text-sm font-medium text-gray-900 truncate leading-tight">{s.checklist?.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{s.submitted_by}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-gray-400">{timeStr}</p>
                        {!s.signed_off_at && (
                          <span className="inline-block mt-1 rounded-full bg-brand/40 px-1.5 py-0.5 text-[10px] font-semibold text-brown">Pending</span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              });
            })()}
          </div>
        </aside>

        </div>
      </div>
    </div>
  );
}

// ── Checklist group ───────────────────────────────────────────────────────────

function ChecklistGroup({
  label, items, styles, loading,
}: {
  label: string;
  items: Checklist[];
  styles: { header: string; dot: string; badge: string };
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-3 px-4 py-3 border-b text-left transition hover:opacity-90 focus:outline-none ${styles.header}`}
      >
        <span className={`h-2 w-2 rounded-full shrink-0 ${styles.dot}`} />
        <span className="text-sm font-semibold flex-1">{label}</span>
        <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${styles.badge}`}>{items.length}</span>
        <ChevronIcon open={open} />
      </button>
      {open && !loading && (
        <div className="divide-y divide-gray-100">
          {items.map(cl => (
            <div key={cl.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{cl.name}</p>
                <p className="text-xs text-gray-400">{frequencyLabel(cl.frequency as never)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/checklist/${cl.id}`} className="btn-primary text-xs py-1 px-3">Start</Link>
                <Link href={`/print-qr?id=${cl.id}`} className="btn-ghost text-xs py-1 px-2">QR</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SignOutButton() {
  const router = useRouter();
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <button onClick={handleLogout} className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-gray-400 hover:bg-white/10 hover:text-white transition-colors">
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Sign out
    </button>
  );
}

function StatCard({ label, value, loading, warn, href }: {
  label: string; value: number; loading: boolean; warn?: boolean; href?: string;
}) {
  const cardCls = warn ? "border-brand/50 bg-brand-light" : "border-gray-200 bg-white";
  const valCls  = warn ? "text-brown" : "text-gray-900";
  const lblCls  = warn ? "text-brown/70" : "text-gray-500";
  const inner = (
    <>
      <p className={`text-xs font-semibold uppercase tracking-wide ${lblCls}`}>{label}</p>
      {loading
        ? <div className="mt-2 h-8 w-14 animate-pulse rounded bg-gray-200" />
        : <p className={`mt-1 text-3xl font-bold ${valCls}`}>{value}</p>
      }
    </>
  );
  const cls = `rounded-xl border-2 p-4 shadow-sm transition ${cardCls} ${href ? "hover:shadow-md cursor-pointer" : ""}`;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <div className={cls}>{inner}</div>;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`h-4 w-4 opacity-60 transition-transform ${open ? "rotate-90" : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4l4 4-4 4"/>
    </svg>
  );
}
