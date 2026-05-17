"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Checklist, Submission, IngredientLot, Ingredient, Dispatch } from "@/lib/types";
import { frequencyLabel, frequencyBadgeColor } from "@/lib/utils";
import AppSidebar from "@/components/AppSidebar";

// ── Constants ─────────────────────────────────────────────────────────────────

const SKUS = [
  "Garlic Chilli Oil",
  "Garlic Chilli Oil with Beef",
  "Sichuan Chilli Crisp",
  "Sichuan Chilli Crisp Double Heat",
  "Hunan Salted Chillies",
];

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

  useEffect(() => { load(); }, []);

  async function load() {
    const [clRes, subRes, draftRes, dispRes, batchSubRes] = await Promise.all([
      supabase.from("checklists").select("*").eq("active", true).order("name"),
      supabase.from("submissions").select("*, checklist:checklists(*)").order("submitted_at", { ascending: false }).limit(50),
      supabase.from("batch_drafts").select("*, checklist:checklists(name, category)").order("last_saved_at", { ascending: false }).limit(10),
      supabase.from("dispatches").select("product, total_units"),
      supabase.from("submissions").select("id, checklist:checklists(name, category), answers(value, question:questions(type, label))").eq("checklists.category", "Production"),
    ]);

    if (clRes.data) setChecklists(clRes.data as Checklist[]);

    if (subRes.data) {
      const all = subRes.data as (Submission & { checklist: Checklist })[];
      setRecentSubs(all.filter(s => s.checklist).slice(0, 8));
      setPendingSignOff(all.filter(s => s.checklist && !s.signed_off_at).slice(0, 20));
    }

    if (draftRes.data) setOpenDrafts(draftRes.data as never);

    if (batchSubRes.data && dispRes.data) {
      const dispatched: Record<string, number> = {};
      for (const d of (dispRes.data as { product: string; total_units: number }[]))
        dispatched[d.product] = (dispatched[d.product] ?? 0) + d.total_units;

      const produced: Record<string, number> = {};
      for (const sub of (batchSubRes.data as never as Array<{ checklist: { name: string; category: string } | null; answers: Array<{ value: string | null; question: { type: string } | null }> }>)) {
        if (sub.checklist?.category !== "Production") continue;
        const sku = sub.checklist.name.replace(" — Production Record", "");
        for (const ans of (sub.answers ?? [])) {
          if (ans.question?.type !== "packing_runs" || !ans.value) continue;
          try {
            const rows = JSON.parse(ans.value);
            if (Array.isArray(rows)) for (const r of rows) produced[sku] = (produced[sku] ?? 0) + (Number(r.jars_used) || 0);
          } catch { /* ignore */ }
        }
      }

      setSkuStock(SKUS.map(name => {
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
      <div className="flex-1 lg:ml-56 flex flex-col min-h-screen">

        {/* Mobile top bar */}
        <div className="lg:hidden sticky top-0 z-20 bg-white border-b border-gray-200 flex items-center justify-between px-4 py-3">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded text-gray-600 hover:bg-gray-100">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <rect y="3" width="20" height="2" rx="1"/><rect y="9" width="20" height="2" rx="1"/><rect y="15" width="20" height="2" rx="1"/>
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kernel.png" alt="Kernel" className="h-7 w-auto" />
          <div className="w-8" />
        </div>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-6xl w-full mx-auto space-y-6">

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-sm text-gray-500">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
            </div>
            <Link href="/admin/goods-in" className="btn-primary text-sm hidden sm:inline-flex">+ Goods In</Link>
          </div>

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

          {/* ── Stock + Recent ─────────────────────────────────────────── */}
          <div className="grid gap-6 lg:grid-cols-2">

            {/* Finished goods stock */}
            <section className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Finished Goods</h3>
                <Link href="/admin/goods-out" className="text-xs text-brown/70 hover:text-brown hover:underline">Log dispatch →</Link>
              </div>
              <div className="divide-y divide-gray-100">
                {loading
                  ? <div className="p-4 text-center text-sm text-gray-400">Loading…</div>
                  : skuStock.map(sku => (
                    <div key={sku.name} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{sku.name}</p>
                        <p className="text-xs text-gray-400">{sku.produced} produced · {sku.dispatched} dispatched</p>
                      </div>
                      <p className={`text-lg font-bold tabular-nums shrink-0 ${sku.inStock === 0 ? "text-gray-300" : "text-gray-900"}`}>
                        {sku.inStock}
                      </p>
                    </div>
                  ))
                }
              </div>
            </section>

            {/* Recent activity */}
            <section className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Recent Submissions</h3>
                <Link href="/dashboard" className="text-xs text-brown/70 hover:text-brown hover:underline">View all →</Link>
              </div>
              <div className="divide-y divide-gray-100">
                {loading
                  ? <div className="p-4 text-center text-sm text-gray-400">Loading…</div>
                  : recentSubs.length === 0
                    ? <div className="p-4 text-center text-sm text-gray-400">No submissions yet.</div>
                    : recentSubs.map(s => {
                        const dt = new Date(s.submitted_at);
                        const isToday = dt.toDateString() === new Date().toDateString();
                        const timeStr = isToday
                          ? dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                          : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                        return (
                          <Link key={s.id} href={`/submission/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{s.checklist?.name}</p>
                              <p className="text-xs text-gray-400">{s.submitted_by} · {timeStr}</p>
                            </div>
                            {!s.signed_off_at && (
                              <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-brown">Pending</span>
                            )}
                          </Link>
                        );
                      })
                }
              </div>
            </section>
          </div>
        </main>
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
        className={`w-full flex items-center gap-3 px-4 py-3 border-b text-left transition hover:opacity-90 ${styles.header}`}
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
