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

/**
 * True when the table doesn't exist yet (migration not run). PostgREST answers
 * with its OWN code — PGRST205, "Could not find the table … in the schema
 * cache" — not the Postgres 42P01 you'd get from raw SQL. Checking only 42P01
 * meant the setup notice never showed and the user hit a raw error on save.
 */
export function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

/**
 * What a CUSTOMER sees if the spec-sheet tables aren't present. Never put a
 * script name, SQL, or any other internal instruction in front of a user —
 * Kernel is commercial software and that reads as "this product is broken".
 * The actionable version is console-logged and shown only to support@.
 */
export const SETUP_NOTICE_USER =
  "Spec sheets aren't switched on for your account yet. Get in touch and we'll sort it out.";

/** Support-only: the actual fix. Never rendered for anyone else. */
export const SETUP_NOTICE_SUPPORT =
  "Spec sheet tables are missing — run scripts/add-spec-sheets.sql in the Supabase SQL editor, then check to_regclass('public.product_spec_sheets') is not null.";

/** Kernel's own account — the only login that should see internal detail. */
export const SUPPORT_EMAIL = "support@kernelapp.co.uk";

/** Pick the right setup message for whoever is looking. */
export function setupNotice(email: string | null | undefined): string {
  return (email ?? "").toLowerCase() === SUPPORT_EMAIL ? SETUP_NOTICE_SUPPORT : SETUP_NOTICE_USER;
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

  if (isMissingTable(error)) {
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
  if (isMissingTable(readError)) return { error: SETUP_NOTICE_USER };
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
    if (error) return { error: isMissingTable(error) ? SETUP_NOTICE_USER : error.message };
    return { id: existing.id };
  }

  const { data: inserted, error } = await supabase
    .from("product_spec_sheets")
    .insert({ organisation_id: orgId, product_name: productName, data: merged, ...shot, ...base })
    .select("id")
    .single();
  if (error) return { error: isMissingTable(error) ? SETUP_NOTICE_USER : error.message };
  return { id: inserted?.id };
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
  if (isMissingTable(error)) return { company: defaults, tableMissing: true };
  return {
    company: mergeCompanyDetails(defaults, data?.data as Partial<CompanyDetails> | null),
    tableMissing: false,
  };
}

/** True when enough of the company block is filled in for a usable spec sheet. */
export function companyIsComplete(c: CompanyDetails): boolean {
  return Boolean(c.supplierName.trim() && c.address.trim() && (c.telephone.trim() || c.email.trim()));
}
