"use client";

// Shared read/write for a product's spec sheet row. Two tabs write DIFFERENT
// keys of the same (org, product_name) jsonb `data`: the Organoleptic tab owns
// `organoleptic`, the Spec sheet tab owns everything else. Every save re-reads
// the row and merges, so neither tab can clobber the other's keys (same
// pattern as saveProductSettings for product_nutrition_settings).

import { supabase } from "@/lib/supabase";
import type { CompanyDetails, SpecData } from "@/lib/spec-sheet";
import { defaultCompanyDetails, mergeCompanyDetails } from "@/lib/spec-sheet";

/** Escape ilike wildcards so a product name containing % or _ stays an exact match. */
function esc(productName: string) {
  return productName.replace(/[\\%_]/g, m => "\\" + m);
}

export interface SpecRow {
  id: string | null;
  data: Partial<SpecData>;
  packShotPath: string | null;
  /** True when the migration hasn't been run yet (relation doesn't exist). */
  tableMissing: boolean;
}

export async function loadSpecRow(orgId: string, productName: string): Promise<SpecRow> {
  const { data, error } = await supabase
    .from("product_spec_sheets")
    .select("id, data, pack_shot_path")
    .eq("organisation_id", orgId)
    .ilike("product_name", esc(productName))
    .maybeSingle();

  if (error?.code === "42P01") {
    return { id: null, data: {}, packShotPath: null, tableMissing: true };
  }
  return {
    id: data?.id ?? null,
    data: (data?.data ?? {}) as Partial<SpecData>,
    packShotPath: data?.pack_shot_path ?? null,
    tableMissing: false,
  };
}

/**
 * Merge a partial spec into the stored jsonb without touching the other tab's
 * keys. `packShotPath` is only written when explicitly passed.
 */
export async function saveSpecPatch(
  orgId: string,
  productName: string,
  patch: Partial<SpecData>,
  packShotPath?: string | null,
): Promise<{ error?: string; id?: string }> {
  const { data: existing, error: readError } = await supabase
    .from("product_spec_sheets")
    .select("id, data")
    .eq("organisation_id", orgId)
    .ilike("product_name", esc(productName))
    .maybeSingle();
  if (readError && readError.code !== "PGRST116") return { error: readError.message };

  const { data: { user } } = await supabase.auth.getUser();
  const base = {
    updated_by: (user?.user_metadata?.full_name as string | undefined)?.trim() || user?.email || "",
    updated_at: new Date().toISOString(),
  };
  const merged = { ...((existing?.data ?? {}) as Partial<SpecData>), ...patch };
  const shot = packShotPath !== undefined ? { pack_shot_path: packShotPath } : {};

  if (existing?.id) {
    const { error } = await supabase
      .from("product_spec_sheets")
      .update({ data: merged, ...shot, ...base })
      .eq("id", existing.id);
    return error ? { error: error.message } : { id: existing.id };
  }

  const { data: inserted, error } = await supabase
    .from("product_spec_sheets")
    .insert({ organisation_id: orgId, product_name: productName, data: merged, ...shot, ...base })
    .select("id")
    .single();
  return error ? { error: error.message } : { id: inserted?.id };
}

/** Org-level company block, shared by every product's spec sheet. */
export async function loadCompanyDetails(
  orgId: string,
  orgName: string,
): Promise<{ company: CompanyDetails; tableMissing: boolean }> {
  const { data, error } = await supabase
    .from("spec_company_details")
    .select("data")
    .eq("organisation_id", orgId)
    .maybeSingle();

  const defaults = defaultCompanyDetails(orgName);
  if (error?.code === "42P01") return { company: defaults, tableMissing: true };
  return {
    company: mergeCompanyDetails(defaults, data?.data as Partial<CompanyDetails> | null),
    tableMissing: false,
  };
}

/** True when enough of the company block is filled in for a usable spec sheet. */
export function companyIsComplete(c: CompanyDetails): boolean {
  return Boolean(c.supplierName.trim() && c.address.trim() && (c.telephone.trim() || c.email.trim()));
}
