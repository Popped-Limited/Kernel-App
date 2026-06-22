"use client";
import BackButton from "@/components/BackButton";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import DocUploader from "@/components/DocUploader";
import RiskCalculator from "@/components/RiskCalculator";
import SAQResponsesViewer from "@/components/SAQResponsesViewer";
import { useGuidedTour } from "@/lib/useGuidedTour";

type SupplierType = "raw_material" | "packaging" | "service";
type SupplierRisk = "low" | "medium" | "high";
type SupplierStatus = "approved" | "under_review" | "unapproved";
type Certification = "BRCGS" | "SALSA" | "Hygiene Rating" | "None" | "Other";

interface Supplier {
  id: string;
  name: string;
  type: SupplierType;
  supplies: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  saq_token: string | null;
  certification: Certification | null;
  hygiene_rating: number | null;
  cert_expiry: string | null;
  saq_completed: boolean;
  saq_date: string | null;
  supplier_risk: SupplierRisk | null;
  raw_material_risk: SupplierRisk | null;
  review_frequency_years: number | null;
  next_review_due: string | null;
  status: SupplierStatus;
  notes: string | null;
  created_at: string;
}

function emptySupplier(): Omit<Supplier, "id" | "created_at"> {
  return {
    name: "",
    type: "raw_material",
    supplies: "",
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    saq_token: null,
    certification: null,
    hygiene_rating: null,
    cert_expiry: null,
    saq_completed: false,
    saq_date: null,
    supplier_risk: null,
    raw_material_risk: null,
    review_frequency_years: null,
    next_review_due: null,
    status: "approved",
    notes: null,
  };
}

const TYPE_LABELS: Record<SupplierType, string> = {
  raw_material: "Raw Material",
  packaging: "Packaging",
  service: "Service",
};

const RISK_COLORS: Record<SupplierRisk, string> = {
  low: "bg-brand/30 text-brown",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
};

const STATUS_COLORS: Record<SupplierStatus, string> = {
  approved: "bg-brand/30 text-brown",
  under_review: "bg-amber-100 text-amber-800",
  unapproved: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<SupplierStatus, string> = {
  approved: "Approved",
  under_review: "Under Review",
  unapproved: "Unapproved",
};

function daysDiff(dateStr: string): number {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - now.getTime()) / 86_400_000);
}

function DateCell({ dateStr }: { dateStr: string | null }) {
  if (!dateStr) return <span className="text-gray-400">—</span>;
  const days = daysDiff(dateStr);
  const formatted = new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (days < 0) return <span className="text-red-600 font-semibold">{formatted} <span className="text-xs">(expired)</span></span>;
  if (days <= 60) return <span className="text-amber-600 font-semibold">{formatted} <span className="text-xs">({days}d)</span></span>;
  return <span className="text-gray-600">{formatted}</span>;
}

export default function SuppliersPage() {
  const { orgId } = useOrganisation();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SupplierType | "all">("all");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Omit<Supplier, "id" | "created_at">>(emptySupplier());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [riskCalcOpen, setRiskCalcOpen] = useState(false);
  const [saqViewerOpen, setSaqViewerOpen] = useState(false);

  useEffect(() => { if (orgId) load(); }, [orgId]);

  // Guided tour — launched from the /dashboard "Get started" checklist via ?tour=suppliers
  useGuidedTour({
    tourKey: "suppliers",
    ready: !loading,
    orgId,
    openPanel: openNew,
    steps: [
      {
        element: '[data-tour="add-supplier"]',
        popover: {
          title: "Add your first supplier",
          description:
            "Every ingredient, packaging item or service you buy in is logged here. Click Next and I'll open the form for you.",
          side: "bottom",
          align: "end",
        },
      },
      {
        element: '[data-tour="supplier-name"]',
        popover: {
          title: "Supplier name",
          description:
            "Enter just the supplier's name here — e.g. \"AA Produce\". There's a separate field for what they supply.",
          side: "right",
        },
      },
      {
        element: '[data-tour="supplier-type"]',
        popover: {
          title: "Choose a type",
          description:
            "Raw material, packaging or service. Raw-material and packaging suppliers get a Self-Assessment Questionnaire (SAQ); services don't.",
          side: "right",
        },
      },
      {
        element: '[data-tour="supplier-supplies"]',
        popover: {
          title: "What they supply",
          description:
            "List what this supplier provides — e.g. \"Fresh chillies\" or \"Glass jars\".",
          side: "right",
        },
      },
      {
        element: '[data-tour="supplier-risk"]',
        popover: {
          title: "Risk assessment",
          description:
            "Set a supplier and raw-material risk rating, or hit \"Run calculator\" to work it out from their certification and SAQ.",
          side: "left",
        },
      },
      {
        element: '[data-tour="supplier-save"]',
        popover: {
          title: "Save to finish",
          description:
            "Hit Save. The supplier reopens with a unique SAQ link to send them, and a file-upload area to store their certificates and accreditations.",
          side: "top",
        },
      },
    ],
  });

  async function load() {
    const { data } = await supabase
      .from("suppliers")
      .select("*")
      .eq("organisation_id", orgId)
      .order("type")
      .order("name");
    if (data) setSuppliers(data as Supplier[]);
    setLoading(false);
  }

  function openNew() {
    const token = crypto.randomUUID();
    setForm({ ...emptySupplier(), saq_token: token });
    setEditing(null);
    setIsNew(true);
  }

  function openEdit(s: Supplier) {
    setForm({
      name: s.name,
      type: s.type,
      supplies: s.supplies,
      contact_name: s.contact_name,
      contact_email: s.contact_email,
      contact_phone: s.contact_phone,
      saq_token: s.saq_token,
      certification: s.certification,
      hygiene_rating: s.hygiene_rating,
      cert_expiry: s.cert_expiry,
      saq_completed: s.saq_completed,
      saq_date: s.saq_date,
      supplier_risk: s.supplier_risk,
      raw_material_risk: s.raw_material_risk,
      review_frequency_years: s.review_frequency_years,
      next_review_due: s.next_review_due,
      status: s.status,
      notes: s.notes,
    });
    setEditing(s);
    setIsNew(false);
  }

  function closePanel() {
    setEditing(null);
    setIsNew(false);
  }

  function setF<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function save() {
    if (!form.name.trim() || !form.supplies.trim()) return;
    setSaving(true);

    const saqToken = form.saq_token || (isNew ? crypto.randomUUID() : null);

    const payload = {
      ...form,
      name: form.name.trim(),
      supplies: form.supplies.trim(),
      contact_name: form.contact_name?.trim() || null,
      contact_email: form.contact_email?.trim() || null,
      contact_phone: form.contact_phone?.trim() || null,
      saq_token: saqToken,
      cert_expiry: form.cert_expiry || null,
      saq_date: form.saq_date || null,
      next_review_due: form.next_review_due || null,
      hygiene_rating: form.hygiene_rating || null,
      review_frequency_years: form.review_frequency_years || null,
      notes: form.notes?.trim() || null,
    };

    if (isNew) {
      const { data: created } = await supabase
        .from("suppliers")
        .insert({ ...payload, organisation_id: orgId })
        .select()
        .single();
      setSaving(false);
      await load();
      if (created) openEdit(created as Supplier); // auto-reopen so SAQ link is visible immediately
    } else if (editing) {
      await supabase.from("suppliers").update(payload).eq("id", editing.id);
      setSaving(false);
      closePanel();
      await load();
    }
  }

  async function confirmDelete(id: string) {
    await supabase.from("suppliers").delete().eq("id", id);
    setDeleteConfirm(null);
    await load();
  }

  const filtered = filter === "all" ? suppliers : suppliers.filter(s => s.type === filter);

  const expiringSoon = suppliers.filter(s =>
    (s.cert_expiry && daysDiff(s.cert_expiry) <= 60) ||
    (s.next_review_due && daysDiff(s.next_review_due) <= 60)
  ).length;

  const counts = {
    raw_material: suppliers.filter(s => s.type === "raw_material").length,
    packaging: suppliers.filter(s => s.type === "packaging").length,
    service: suppliers.filter(s => s.type === "service").length,
  };

  const panelOpen = isNew || !!editing;

  return (
    <>
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-6xl w-full mx-auto space-y-6">

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold text-gray-900">Approved Suppliers</h1>
            {expiringSoon > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {expiringSoon} action{expiringSoon !== 1 ? "s" : ""} needed
              </span>
            )}
          </div>
          <button data-tour="add-supplier" onClick={openNew} className="btn-primary text-sm">+ Add Supplier</button>
        </div>
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {(["raw_material", "packaging", "service"] as SupplierType[]).map(t => (
            <div key={t} className="card p-4">
              <p className="text-xs text-gray-500">{TYPE_LABELS[t]} Suppliers</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{counts[t]}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4">
          {([["all", "All"], ["raw_material", "Raw Materials"], ["packaging", "Packaging"], ["service", "Services"]] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${filter === val ? "bg-brand text-brown" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No suppliers yet — add one above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Supplier</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600">Contact</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600">Email</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600">Phone</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600">Certification</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600">Cert Expires</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600">SAQ</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600">Supplier Risk</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600">RM Risk</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600">Next Review</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-900">{s.name}</td>
                      <td className="px-3 py-3 text-gray-600">{s.contact_name ?? <span className="text-gray-400">—</span>}</td>
                      <td className="px-3 py-3 text-gray-600">{s.contact_email ?? <span className="text-gray-400">—</span>}</td>
                      <td className="px-3 py-3 text-gray-600">{s.contact_phone ?? <span className="text-gray-400">—</span>}</td>
                      <td className="px-3 py-3">
                        {s.certification
                          ? <span>{s.certification}{s.hygiene_rating ? ` (${s.hygiene_rating}/5)` : ""}</span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="px-3 py-3"><DateCell dateStr={s.cert_expiry} /></td>
                      <td className="px-3 py-3">
                        {s.type === "service"
                          ? <span className="text-gray-400">N/A</span>
                          : s.saq_completed
                            ? <span className="text-brown font-medium">Yes{s.saq_date ? ` · ${new Date(s.saq_date).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}` : ""}</span>
                            : <span className="text-red-600 font-medium">No</span>
                        }
                      </td>
                      <td className="px-3 py-3">
                        {s.supplier_risk
                          ? <span className={`inline-block rounded-full px-2 py-0.5 font-medium capitalize ${RISK_COLORS[s.supplier_risk]}`}>{s.supplier_risk}</span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="px-3 py-3">
                        {s.raw_material_risk
                          ? <span className={`inline-block rounded-full px-2 py-0.5 font-medium capitalize ${RISK_COLORS[s.raw_material_risk]}`}>{s.raw_material_risk}</span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="px-3 py-3"><DateCell dateStr={s.next_review_due} /></td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(s)} className="btn-ghost text-xs px-2">Edit</button>
                          {deleteConfirm === s.id ? (
                            <>
                              <button onClick={() => confirmDelete(s.id)} className="text-xs text-red-600 font-semibold hover:underline px-1">Delete?</button>
                              <button onClick={() => setDeleteConfirm(null)} className="text-xs text-gray-400 hover:underline px-1">Cancel</button>
                            </>
                          ) : (
                            <button onClick={() => setDeleteConfirm(s.id)} className="text-xs text-red-400 hover:text-red-600 px-1">✕</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Edit / Add Panel */}
      {panelOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/30" onClick={closePanel} />
          <div className="w-full max-w-lg bg-white shadow-xl flex flex-col overflow-hidden">
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
              <h2 className="text-sm font-semibold text-gray-900">{isNew ? "Add Supplier" : "Edit Supplier"}</h2>
              <button onClick={closePanel} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <Field label="Supplier name *">
                <input data-tour="supplier-name" className="input w-full" value={form.name} onChange={e => setF("name", e.target.value)} placeholder="e.g. AA Produce" />
              </Field>

              <Field label="Type *">
                <select data-tour="supplier-type" className="input w-full" value={form.type} onChange={e => setF("type", e.target.value as SupplierType)}>
                  <option value="raw_material">Raw Material</option>
                  <option value="packaging">Packaging</option>
                  <option value="service">Service</option>
                </select>
              </Field>

              <Field label="What they supply *">
                <input data-tour="supplier-supplies" className="input w-full" value={form.supplies} onChange={e => setF("supplies", e.target.value)} placeholder="e.g. Fresh produce, Glass jars, Pest control" />
              </Field>

              {/* Contact Information */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Contact Information</p>
                <div className="grid grid-cols-1 gap-3">
                  <Field label="Contact name">
                    <input className="input w-full" value={form.contact_name ?? ""} onChange={e => setF("contact_name", e.target.value || null)} placeholder="e.g. Jane Smith" />
                  </Field>
                  <Field label="Contact email">
                    <input className="input w-full" type="email" value={form.contact_email ?? ""} onChange={e => setF("contact_email", e.target.value || null)} placeholder="jane@supplier.com" />
                  </Field>
                  <Field label="Contact phone">
                    <input className="input w-full" type="tel" value={form.contact_phone ?? ""} onChange={e => setF("contact_phone", e.target.value || null)} placeholder="+44 7700 900000" />
                  </Field>
                </div>
              </div>

              {/* SAQ Link — only for non-service suppliers */}
              {!isNew && editing && editing.saq_token && form.type !== "service" && (
                <div className="rounded-lg border border-brand/40 bg-brand/10 p-3 space-y-2">
                  <p className="text-xs font-semibold text-brown uppercase tracking-wide">SAQ Link</p>
                  <p className="text-xs text-gray-600">Share this link with your supplier to complete the self-assessment questionnaire.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[11px] bg-white border border-gray-200 rounded px-2 py-1.5 text-gray-700 truncate">
                      {typeof window !== "undefined" ? `${window.location.origin}/saq/${editing.saq_token}` : `/saq/${editing.saq_token}`}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${window.location.origin}/saq/${editing.saq_token}`;
                        navigator.clipboard.writeText(url);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="shrink-0 text-xs font-medium text-brown border border-brand rounded px-2 py-1.5 hover:bg-brand/20 transition"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  {editing.saq_completed && (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-brown font-medium">
                        ✅ SAQ completed {editing.saq_date ? `on ${new Date(editing.saq_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                      </p>
                      <button
                        type="button"
                        onClick={() => setSaqViewerOpen(true)}
                        className="text-xs font-medium text-brown hover:underline"
                      >
                        View responses →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Certification — full fields for ingredient/packaging, just expiry for services */}
              {form.type !== "service" && (
                <>
                  <Field label="Certification">
                    <select className="input w-full" value={form.certification ?? ""} onChange={e => setF("certification", (e.target.value || null) as Certification | null)}>
                      <option value="">— Select —</option>
                      <option value="BRCGS">BRCGS</option>
                      <option value="SALSA">SALSA</option>
                      <option value="Hygiene Rating">Hygiene Rating</option>
                      <option value="None">None</option>
                      <option value="Other">Other</option>
                    </select>
                  </Field>
                  {form.certification === "Hygiene Rating" && (
                    <Field label="Hygiene rating score (1–5)">
                      <input className="input w-full" type="number" min={1} max={5} value={form.hygiene_rating ?? ""} onChange={e => setF("hygiene_rating", e.target.value ? Number(e.target.value) : null)} />
                    </Field>
                  )}
                </>
              )}

              <Field label={form.type === "service" ? "Certificate expiry date (e.g. pest control)" : "Certificate expiry date"}>
                <input className="input w-full" type="date" value={form.cert_expiry ?? ""} onChange={e => setF("cert_expiry", e.target.value || null)} />
              </Field>

              {/* Risk + review — not applicable for services */}
              {form.type !== "service" && (
                <>
                  <div data-tour="supplier-risk" className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-gray-700">Risk Assessment</p>
                      <button
                        type="button"
                        onClick={() => setRiskCalcOpen(true)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brown hover:underline"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <rect x="1" y="1" width="10" height="10" rx="1.5"/>
                          <path d="M3.5 4h5M3.5 6h5M3.5 8h3"/>
                        </svg>
                        Run calculator
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Supplier risk">
                        <select className="input w-full" value={form.supplier_risk ?? ""} onChange={e => setF("supplier_risk", (e.target.value || null) as SupplierRisk | null)}>
                          <option value="">— Select —</option>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </Field>
                      <Field label="Raw material risk">
                        <select className="input w-full" value={form.raw_material_risk ?? ""} onChange={e => setF("raw_material_risk", (e.target.value || null) as SupplierRisk | null)}>
                          <option value="">— Select —</option>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </Field>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Review frequency">
                      <select className="input w-full" value={form.review_frequency_years ?? ""} onChange={e => setF("review_frequency_years", e.target.value ? Number(e.target.value) : null)}>
                        <option value="">— Select —</option>
                        <option value={1}>Every year</option>
                        <option value={2}>Every 2 years</option>
                        <option value={3}>Every 3 years</option>
                      </select>
                    </Field>
                    <Field label="Next review due">
                      <input className="input w-full" type="date" value={form.next_review_due ?? ""} onChange={e => setF("next_review_due", e.target.value || null)} />
                    </Field>
                  </div>
                </>
              )}

              <Field label="Status">
                <select className="input w-full" value={form.status} onChange={e => setF("status", e.target.value as SupplierStatus)}>
                  <option value="approved">Approved</option>
                  <option value="under_review">Under Review</option>
                  <option value="unapproved">Unapproved</option>
                </select>
              </Field>

              <Field label="Notes">
                <textarea className="input w-full" rows={3} value={form.notes ?? ""} onChange={e => setF("notes", e.target.value || null)} placeholder="Any additional notes…" />
              </Field>

              {/* Documents — only shown when editing an existing supplier */}
              {!isNew && editing && (
                <DocUploader
                  entityType="supplier"
                  entityId={editing.id}
                  orgId={orgId}
                  docType="accreditation"
                  label="Accreditation & Certificates"
                />
              )}

              {!isNew && editing && (
                <div className="border-t border-gray-200 pt-4">
                  {deleteConfirm === editing.id ? (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-red-600">Delete {editing.name}?</span>
                      <button onClick={() => confirmDelete(editing.id)} className="text-xs text-red-600 font-semibold hover:underline">Yes, delete</button>
                      <button onClick={() => setDeleteConfirm(null)} className="text-xs text-gray-500 hover:underline">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(editing.id)} className="text-xs text-red-500 hover:text-red-700">Delete supplier</button>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 px-6 py-4 flex gap-3 shrink-0">
              <button onClick={closePanel} className="btn-ghost flex-1">Cancel</button>
              <button data-tour="supplier-save" onClick={save} disabled={saving || !form.name.trim() || !form.supplies.trim()} className="btn-primary flex-1">
                {saving ? "Saving…" : isNew ? "Add Supplier" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SAQ Responses Viewer */}
      {editing && (
        <SAQResponsesViewer
          open={saqViewerOpen}
          onClose={() => setSaqViewerOpen(false)}
          supplierName={editing.name}
          supplierId={editing.id}
          supplierType={editing.type}
          saqDate={editing.saq_date}
        />
      )}

      {/* Risk Calculator Modal */}
      <RiskCalculator
        open={riskCalcOpen}
        onClose={() => setRiskCalcOpen(false)}
        supplierType={form.type}
        saqCompleted={form.saq_completed}
        hasCertification={!!form.certification && form.certification !== "None"}
        onApply={({ raw_material_risk, supplier_risk, review_frequency_years, next_review_due }) => {
          setF("raw_material_risk", raw_material_risk);
          setF("supplier_risk", supplier_risk);
          setF("review_frequency_years", review_frequency_years);
          setF("next_review_due", next_review_due);
        }}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
