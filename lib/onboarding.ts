import { supabase } from "@/lib/supabase";

// ── Onboarding "Get started" checklist ──────────────────────────────────────
// A 5-step walkthrough shown on /dashboard to brand-new orgs (gated by
// organisations.onboarding_dismissed — see scripts/add-onboarding.sql).
//
// Each step is "done" when EITHER the org has the real data for it, OR the user
// has finished that step's guided tour (tracked in localStorage). That way a
// user can tick a step by actually doing the work or by completing the tour.

export type StepKey = "staff" | "suppliers" | "raw_materials" | "production" | "checklists";

export interface OnboardingStep {
  key: StepKey;
  title: string;
  blurb: string;
  /** Where "Show me how" sends them. `tour` triggers the on-page guided tour. */
  href: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    key: "staff",
    title: "Add your staff & users",
    blurb: "Record your team members and invite the people who'll log in.",
    href: "/admin/staff",
  },
  {
    key: "suppliers",
    title: "Add your suppliers",
    blurb: "Create a supplier, send the SAQ link, set a risk rating and upload their certificates.",
    href: "/compliance/suppliers?tour=suppliers",
  },
  {
    key: "raw_materials",
    title: "Add your raw materials",
    blurb: "Add an ingredient with its price per kg, density (for liquids) and spec sheet.",
    href: "/compliance/raw-materials",
  },
  {
    key: "production",
    title: "Create your first production record",
    blurb: "Walk through logging a production run start to finish.",
    href: "/admin/production-flow",
  },
  {
    key: "checklists",
    title: "Customise your checklists",
    blurb: "Edit a checklist — add the questions you need and remove the ones you don't.",
    href: "/admin/checklists",
  },
];

// ── Per-step tour completion (localStorage) ─────────────────────────────────

function tourStorageKey(orgId: string) {
  return `kernel_onboarding_tours_${orgId}`;
}

export function getCompletedTours(orgId: string): StepKey[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(tourStorageKey(orgId)) ?? "[]");
  } catch {
    return [];
  }
}

export function markTourComplete(orgId: string, key: StepKey) {
  if (typeof window === "undefined") return;
  const done = new Set(getCompletedTours(orgId));
  done.add(key);
  localStorage.setItem(tourStorageKey(orgId), JSON.stringify([...done]));
}

// ── Data-based completion ───────────────────────────────────────────────────
// Returns the set of steps the org has real data for. RLS scopes every query
// to the caller's org, so these counts are always org-specific.

export async function fetchDataDoneSteps(): Promise<Set<StepKey>> {
  const done = new Set<StepKey>();

  const [staff, suppliers, ingredients, production] = await Promise.all([
    supabase.from("team_members").select("id", { count: "exact", head: true }),
    supabase.from("suppliers").select("id", { count: "exact", head: true }),
    supabase.from("ingredients").select("id", { count: "exact", head: true }),
    supabase
      .from("submissions")
      .select("id, checklist:checklists!inner(category)")
      .eq("checklists.category", "Production")
      .limit(1),
  ]);

  if ((staff.count ?? 0) > 0) done.add("staff");
  if ((suppliers.count ?? 0) > 0) done.add("suppliers");
  if ((ingredients.count ?? 0) > 0) done.add("raw_materials");
  if ((production.data?.length ?? 0) > 0) done.add("production");
  // "checklists" has no clean data signal — it's ticked by completing its tour.

  return done;
}

export async function dismissOnboarding(orgId: string) {
  await supabase.from("organisations").update({ onboarding_dismissed: true }).eq("id", orgId);
}
