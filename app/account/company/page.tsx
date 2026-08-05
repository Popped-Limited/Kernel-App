"use client";

// Company details — entered ONCE per organisation, not per product. Feeds the
// Company Information block of every product spec sheet (and anything else
// that needs the trading address / contacts later). The product Spec sheet tab
// only links here; it never edits these fields.

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import { isMissingTable, MIGRATION_NOTICE } from "@/components/useProductSpecSheet";
import {
  type CompanyDetails,
  defaultCompanyDetails, mergeCompanyDetails,
} from "@/lib/spec-sheet";

function Field({ label, value, onChange, textarea, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; textarea?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {textarea ? (
        <textarea className="input" rows={3} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      ) : (
        <input type="text" className="input" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      )}
    </div>
  );
}

export default function CompanyDetailsPage() {
  const { orgId, orgName } = useOrganisation();
  const [company, setCompany] = useState<CompanyDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!orgId) return;
    const { data, error: loadError } = await supabase
      .from("spec_company_details")
      .select("data")
      .eq("organisation_id", orgId)
      .maybeSingle();

    if (isMissingTable(loadError)) { setTableMissing(true); setLoading(false); return; }

    setCompany(mergeCompanyDetails(
      defaultCompanyDetails(orgName ?? ""),
      data?.data as Partial<CompanyDetails> | null,
    ));
    setLoading(false);
  }, [orgId, orgName]);

  useEffect(() => { load(); }, [load]);

  function patch(p: Partial<CompanyDetails>) {
    setCompany(c => (c ? { ...c, ...p } : c));
    setSaved(false);
  }

  async function save() {
    if (!orgId || !company) return;
    setSaving(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    const by = (user?.user_metadata?.full_name as string | undefined)?.trim() || user?.email || "";
    const { error: saveError } = await supabase
      .from("spec_company_details")
      .upsert(
        { organisation_id: orgId, data: company, updated_by: by, updated_at: new Date().toISOString() },
        { onConflict: "organisation_id" },
      );
    setSaving(false);
    if (saveError) {
      // A missing table means the migration hasn't run — say that, not the raw
      // PostgREST schema-cache message.
      setError(isMissingTable(saveError) ? MIGRATION_NOTICE : "Failed to save: " + saveError.message);
      return;
    }
    setSaved(true);
  }

  return (
    <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Company details</h1>
          <p className="text-sm text-gray-500 mt-0.5">Used on every product spec sheet</p>
        </div>

        {loading ? (
          <div className="card p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : tableMissing ? (
          <div className="card p-8 text-center text-sm text-gray-500">{MIGRATION_NOTICE}</div>
        ) : company && (
          <>
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-sm font-semibold text-gray-700">Business</h2>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Supplier name" value={company.supplierName} onChange={v => patch({ supplierName: v })} />
                <Field label="Telephone" value={company.telephone} onChange={v => patch({ telephone: v })} />
                <div className="sm:col-span-2">
                  <Field label="Address" textarea value={company.address} onChange={v => patch({ address: v })} placeholder="Including postcode" />
                </div>
                <Field label="Email" value={company.email} onChange={v => patch({ email: v })} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {(["commercial", "technical"] as const).map(kind => (
                <div key={kind} className="card overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <h2 className="text-sm font-semibold text-gray-700">
                      {kind === "commercial" ? "Commercial contact" : "Technical contact"}
                    </h2>
                  </div>
                  <div className="p-4 space-y-4">
                    <Field label="Name" value={company[kind].name} onChange={v => patch({ [kind]: { ...company[kind], name: v } } as Partial<CompanyDetails>)} />
                    <Field label="Telephone" value={company[kind].phone} onChange={v => patch({ [kind]: { ...company[kind], phone: v } } as Partial<CompanyDetails>)} />
                    <Field label="Email" value={company[kind].email} onChange={v => patch({ [kind]: { ...company[kind], email: v } } as Partial<CompanyDetails>)} />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="btn-primary text-sm disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save company details"}
              </button>
              {saved && <span className="text-xs text-green-600 font-medium">Saved</span>}
              {error && <span className="text-xs text-red-500">{error}</span>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
