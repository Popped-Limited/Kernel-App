"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fetchAll } from "@/lib/fetchAll";
import { useOrganisation } from "@/contexts/OrganisationContext";
import { formatDate } from "@/lib/utils";
import CloseFindingModal from "@/components/gmp/CloseFindingModal";
import {
  DEFAULT_GMP_AREAS, RISK_CHIP, RISK_LABEL, isOverdue, localDateStr, nextAuditDue,
  type GmpArea, type GmpAudit, type GmpFinding,
} from "@/lib/gmp";

// GMP Audits (SALSA issue 7): one area audited per month on a rota. This page
// is the hub — when the next audit is due, which area to do next, the live
// list of findings needing close-out, and the audit history.

export default function GmpAuditsPage() {
  const router = useRouter();
  const { orgId, role } = useOrganisation();
  const [areas, setAreas] = useState<GmpArea[]>([]);
  const [audits, setAudits] = useState<GmpAudit[]>([]);
  const [findings, setFindings] = useState<GmpFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showStart, setShowStart] = useState(false);
  const [showAreas, setShowAreas] = useState(false);
  const [closing, setClosing] = useState<GmpFinding | null>(null);
  const seeded = useRef(false);

  useEffect(() => { if (orgId) load(); }, [orgId]);

  async function load() {
    // Never leave the page on "Loading…" forever — if the tables aren't there
    // (migration not run yet) or a query fails, say so.
    try {
      await loadInner();
    } catch (err: any) {
      setLoadError(err?.message ?? String(err));
      setLoading(false);
    }
  }

  async function loadInner() {
    const [areaRows, auditRows, findingRows] = await Promise.all([
      supabase.from("gmp_areas").select("*").eq("organisation_id", orgId).order("sort").order("name")
        .then(r => (r.data ?? []) as GmpArea[]),
      // Both grow with usage — always paginate (PostgREST caps un-ranged selects at 1000)
      fetchAll<GmpAudit>((from, to) =>
        supabase.from("gmp_audits").select("*, gmp_areas(name)")
          .eq("organisation_id", orgId)
          .order("audit_date", { ascending: false }).order("id")
          .range(from, to)),
      fetchAll<GmpFinding>((from, to) =>
        supabase.from("gmp_findings").select("*, gmp_audits(audit_date, area_id, gmp_areas(name))")
          .eq("organisation_id", orgId)
          .order("created_at", { ascending: false }).order("id")
          .range(from, to)),
    ]);

    // First visit: seed the SALSA-shaped default area list (editable after).
    // UNIQUE(organisation_id, name) makes a double-seed harmless.
    if (areaRows.length === 0 && !seeded.current) {
      seeded.current = true;
      await supabase.from("gmp_areas").insert(
        DEFAULT_GMP_AREAS.map((name, i) => ({ organisation_id: orgId, name, sort: i })));
      return load();
    }

    setAreas(areaRows);
    setAudits(auditRows);
    setFindings(findingRows);
    setLoading(false);
  }

  // ── Derived: rota + due status ─────────────────────────────
  const lastAuditByArea = new Map<string, string>(); // area_id → latest audit_date
  for (const a of audits) {
    const prev = lastAuditByArea.get(a.area_id);
    if (!prev || a.audit_date > prev) lastAuditByArea.set(a.area_id, a.audit_date);
  }
  const activeAreas = areas.filter(a => a.active);
  // Suggest the area that's gone longest unaudited (never-audited first, in list order)
  const suggestedArea = [...activeAreas].sort((x, y) => {
    const lx = lastAuditByArea.get(x.id), ly = lastAuditByArea.get(y.id);
    if (!lx && !ly) return x.sort - y.sort;
    if (!lx) return -1;
    if (!ly) return 1;
    return lx < ly ? -1 : 1;
  })[0] ?? null;

  const completed = audits.filter(a => a.status === "completed");
  const lastCompletedDate = completed.length ? completed[0].audit_date : null;
  const dueDate = nextAuditDue(lastCompletedDate);
  const today = localDateStr();
  const auditOverdue = dueDate !== null && dueDate < today;
  const inProgress = audits.find(a => a.status === "in_progress") ?? null;

  const openFindings = findings
    .filter(f => f.status === "open")
    .sort((a, b) => (a.due_date ?? "9999") < (b.due_date ?? "9999") ? -1 : 1);
  const closedFindings = findings.filter(f => f.status === "closed");
  const findingCounts = new Map<string, { total: number; open: number }>();
  for (const f of findings) {
    const c = findingCounts.get(f.audit_id) ?? { total: 0, open: 0 };
    c.total++;
    if (f.status === "open") c.open++;
    findingCounts.set(f.audit_id, c);
  }

  const isAdmin = role === "admin" || role === "manager";

  return (
    <>
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-6xl w-full mx-auto space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900">GMP Audits</h1>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button onClick={() => setShowAreas(true)} className="btn-secondary text-sm">Manage areas</button>
            )}
            {inProgress ? (
              <Link href={`/compliance/gmp-audits/${inProgress.id}`} className="btn-primary text-sm">
                Resume audit →
              </Link>
            ) : (
              <button onClick={() => setShowStart(true)} className="btn-primary text-sm">+ Start audit</button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
        ) : loadError ? (
          <div className="card p-8 text-center">
            <p className="text-sm font-medium text-red-700 mb-1">Couldn&apos;t load GMP audits</p>
            <p className="text-xs text-gray-500">{loadError}</p>
          </div>
        ) : (
          <>
            {/* Due status */}
            <div className={`card p-4 flex items-start justify-between gap-3 flex-wrap ${auditOverdue ? "border-red-300 bg-red-50" : ""}`}>
              <div>
                {inProgress ? (
                  <>
                    <p className="text-sm font-semibold text-gray-900">
                      Audit in progress — {inProgress.gmp_areas?.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Started {formatDate(inProgress.audit_date)} by {inProgress.auditor_name || "—"}
                    </p>
                  </>
                ) : dueDate === null ? (
                  <>
                    <p className="text-sm font-semibold text-gray-900">No GMP audit recorded yet</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Audit one area each month, rotating so the whole site gets covered.
                      {suggestedArea && <> Start with <span className="font-medium">{suggestedArea.name}</span>.</>}
                    </p>
                  </>
                ) : (
                  <>
                    <p className={`text-sm font-semibold ${auditOverdue ? "text-red-700" : "text-gray-900"}`}>
                      {auditOverdue ? `Monthly audit overdue — was due ${formatDate(dueDate)}` : `Next audit due ${formatDate(dueDate)}`}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Last audit {formatDate(lastCompletedDate!)}.
                      {suggestedArea && <> Suggested next area: <span className="font-medium">{suggestedArea.name}</span>
                        {lastAuditByArea.get(suggestedArea.id)
                          ? ` (last audited ${formatDate(lastAuditByArea.get(suggestedArea.id)!)})`
                          : " (never audited)"}.</>}
                    </p>
                  </>
                )}
              </div>
              {!inProgress && (
                <button onClick={() => setShowStart(true)} className="btn-primary text-xs shrink-0">
                  Start audit
                </button>
              )}
            </div>

            {/* Open findings — the live "needs closing" list */}
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-900">
                Needs closing out {openFindings.length > 0 && (
                  <span className="ml-1 text-xs font-medium text-white bg-red-500 rounded-full px-2 py-0.5">{openFindings.length}</span>
                )}
              </h2>
              {openFindings.length === 0 ? (
                <div className="card p-6 text-center">
                  <p className="text-sm text-gray-500">No open findings — everything is closed out. 🎉</p>
                </div>
              ) : (
                <div className="card divide-y divide-gray-100">
                  {openFindings.map(f => {
                    const overdue = isOverdue(f);
                    return (
                      <div key={f.id} className="p-4 flex items-start gap-3 flex-wrap sm:flex-nowrap">
                        <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${RISK_CHIP[f.risk]}`}>
                          {RISK_LABEL[f.risk]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-800">{f.description}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {f.gmp_audits?.gmp_areas?.name ?? "—"} · audit {formatDate(f.gmp_audits?.audit_date ?? f.created_at)}
                            {f.assigned_to_name && <> · assigned to <span className="font-medium">{f.assigned_to_name}</span></>}
                            {f.due_date && (
                              <> · <span className={overdue ? "text-red-600 font-semibold" : ""}>
                                due {formatDate(f.due_date)}{overdue ? " — overdue" : ""}
                              </span></>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Link href={`/compliance/gmp-audits/${f.audit_id}`} className="btn-ghost text-xs">View</Link>
                          <button onClick={() => setClosing(f)} className="btn-secondary text-xs">Close out</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Audit history */}
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-900">Audit history</h2>
              {audits.length === 0 ? (
                <div className="card p-12 text-center">
                  <p className="text-3xl mb-3">🔍</p>
                  <p className="text-sm font-medium text-gray-700 mb-1">No audits yet</p>
                  <p className="text-xs text-gray-400 mb-4">Walk one area, photograph what you find, assign the fixes</p>
                  <button onClick={() => setShowStart(true)} className="btn-primary text-xs">+ Start your first audit</button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {audits.map(a => {
                    const counts = findingCounts.get(a.id) ?? { total: 0, open: 0 };
                    return (
                      <Link key={a.id} href={`/compliance/gmp-audits/${a.id}`} className="card p-4 hover:border-brand/40 transition-colors flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-sm text-gray-900">{a.gmp_areas?.name ?? "—"}</p>
                          <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${a.status === "completed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                            {a.status === "completed" ? "Completed" : "In progress"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          {formatDate(a.audit_date)} · {a.auditor_name || "—"}
                        </p>
                        <p className="text-xs text-gray-500 mt-auto">
                          {counts.total === 0 ? "No findings — clean audit" : (
                            <>{counts.total} finding{counts.total > 1 ? "s" : ""}
                              {counts.open > 0
                                ? <span className="text-red-600 font-medium"> · {counts.open} open</span>
                                : " · all closed"}</>
                          )}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Closed-out history */}
            {closedFindings.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-gray-900">Closed out</h2>
                <div className="card divide-y divide-gray-100">
                  {closedFindings.slice(0, 20).map(f => (
                    <div key={f.id} className="p-4 flex items-start gap-3">
                      <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${RISK_CHIP[f.risk]}`}>
                        {RISK_LABEL[f.risk]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-700">{f.description}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {f.gmp_audits?.gmp_areas?.name ?? "—"} · closed {f.closed_at ? formatDate(f.closed_at) : "—"} by {f.closed_by || "—"}
                          {f.close_note && <> — {f.close_note}</>}
                        </p>
                      </div>
                      <Link href={`/compliance/gmp-audits/${f.audit_id}`} className="btn-ghost text-xs shrink-0">View</Link>
                    </div>
                  ))}
                  {closedFindings.length > 20 && (
                    <p className="p-3 text-xs text-gray-400 text-center">Showing the 20 most recent — older close-outs stay on their audit records.</p>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {showStart && orgId && (
        <StartAuditModal
          orgId={orgId}
          areas={activeAreas}
          lastAuditByArea={lastAuditByArea}
          suggestedAreaId={suggestedArea?.id ?? null}
          onCancel={() => setShowStart(false)}
          onStarted={id => router.push(`/compliance/gmp-audits/${id}`)}
        />
      )}

      {showAreas && orgId && (
        <ManageAreasModal
          orgId={orgId}
          areas={areas}
          lastAuditByArea={lastAuditByArea}
          onClose={() => { setShowAreas(false); load(); }}
        />
      )}

      {closing && (
        <CloseFindingModal
          finding={closing}
          areaName={closing.gmp_audits?.gmp_areas?.name ?? null}
          onCancel={() => setClosing(null)}
          onDone={() => { setClosing(null); load(); }}
        />
      )}
    </>
  );
}

// ── Start audit ──────────────────────────────────────────────

function StartAuditModal({
  orgId, areas, lastAuditByArea, suggestedAreaId, onCancel, onStarted,
}: {
  orgId: string;
  areas: GmpArea[];
  lastAuditByArea: Map<string, string>;
  suggestedAreaId: string | null;
  onCancel: () => void;
  onStarted: (auditId: string) => void;
}) {
  const [areaId, setAreaId] = useState(suggestedAreaId ?? areas[0]?.id ?? "");
  const [date, setDate] = useState(localDateStr());
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!areaId) return;
    setStarting(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error: e } = await supabase
      .from("gmp_audits")
      .insert({
        organisation_id: orgId,
        area_id: areaId,
        audit_date: date,
        auditor_name: user?.user_metadata?.full_name ?? user?.email ?? "",
        auditor_user: user?.id ?? null,
      })
      .select("id")
      .single();
    if (e || !data) {
      setError(e?.message ?? "Could not start the audit");
      setStarting(false);
      return;
    }
    onStarted(data.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="card w-full max-w-md p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Start GMP audit</h3>
        <div>
          <label className="label">Area to audit *</label>
          <select className="input" value={areaId} onChange={e => setAreaId(e.target.value)} autoFocus>
            {areas.map(a => {
              const last = lastAuditByArea.get(a.id);
              return (
                <option key={a.id} value={a.id}>
                  {a.name} — {last ? `last audited ${formatDate(last)}` : "never audited"}
                  {a.id === suggestedAreaId ? " (suggested)" : ""}
                </option>
              );
            })}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            The suggested area is the one that's gone longest without an audit — pick a different one if something needs looking at sooner.
          </p>
        </div>
        <div>
          <label className="label">Audit date</label>
          <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button onClick={start} disabled={starting || !areaId} className="btn-primary flex-1">
            {starting ? "Starting…" : "Start audit →"}
          </button>
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Manage areas ─────────────────────────────────────────────

function ManageAreasModal({
  orgId, areas, lastAuditByArea, onClose,
}: {
  orgId: string;
  areas: GmpArea[];
  lastAuditByArea: Map<string, string>;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<GmpArea[]>(areas);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const { data } = await supabase.from("gmp_areas").select("*")
      .eq("organisation_id", orgId).order("sort").order("name");
    setRows((data ?? []) as GmpArea[]);
  }

  async function rename(id: string, name: string) {
    const clean = name.trim();
    const current = rows.find(r => r.id === id);
    if (!clean || !current || current.name === clean) return;
    setError(null);
    const { error: e } = await supabase.from("gmp_areas").update({ name: clean }).eq("id", id);
    if (e) setError(e.message.includes("duplicate") ? "An area with that name already exists" : e.message);
    reload();
  }

  async function toggle(a: GmpArea) {
    setError(null);
    await supabase.from("gmp_areas").update({ active: !a.active }).eq("id", a.id);
    reload();
  }

  async function add() {
    const clean = newName.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    const maxSort = rows.reduce((m, r) => Math.max(m, r.sort), -1);
    const { error: e } = await supabase.from("gmp_areas")
      .insert({ organisation_id: orgId, name: clean, sort: maxSort + 1 });
    if (e) setError(e.message.includes("duplicate") ? "An area with that name already exists" : e.message);
    else setNewName("");
    setBusy(false);
    reload();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
      <div className="card w-full max-w-lg p-6 space-y-4 my-8">
        <div>
          <h3 className="font-semibold text-gray-900">GMP audit areas</h3>
          <p className="text-xs text-gray-400 mt-1">
            The rota works through these areas. Areas with past audits can be hidden but not deleted — the history stays.
          </p>
        </div>

        <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {rows.map(a => (
            <div key={a.id} className={`p-3 flex items-center gap-3 ${a.active ? "" : "opacity-50"}`}>
              <input
                className="input text-sm flex-1"
                defaultValue={a.name}
                onBlur={e => rename(a.id, e.target.value)}
                onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
              <span className="text-xs text-gray-400 shrink-0 hidden sm:block">
                {lastAuditByArea.get(a.id) ? `Last ${formatDate(lastAuditByArea.get(a.id)!)}` : "Never audited"}
              </span>
              <button onClick={() => toggle(a)} className="btn-ghost text-xs shrink-0">
                {a.active ? "Hide" : "Restore"}
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            className="input text-sm flex-1"
            placeholder="Add an area, e.g. Goods-in bay"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && add()}
          />
          <button onClick={add} disabled={busy || !newName.trim()} className="btn-secondary text-sm">Add</button>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button onClick={onClose} className="btn-primary w-full">Done</button>
      </div>
    </div>
  );
}
