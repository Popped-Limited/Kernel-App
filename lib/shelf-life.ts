import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/fetchAll";

// Internal shelf-life extensions (shelf_life_extensions table).
// The supplier's best_before_date on ingredient_lots is immutable; each
// extension is an audit row and the EFFECTIVE best-before is the most recent
// extension for the lot, falling back to the supplier date.

export interface ShelfLifeExtension {
  id: string;
  organisation_id: string;
  lot_id: string;
  extended_until: string;
  reason: string;
  created_by: string;
  created_at: string;
}

/**
 * Fetch every extension visible under RLS (i.e. this org's), newest first.
 * Returns [] if the table doesn't exist yet — the feature degrades to
 * plain supplier best-before dates until the migration is run.
 */
export async function fetchShelfLifeExtensions(
  supabase: SupabaseClient
): Promise<ShelfLifeExtension[]> {
  try {
    // Extensions accumulate forever (audit trail) — paginate past the 1000-row cap.
    return await fetchAll<ShelfLifeExtension>((from, to) =>
      supabase
        .from("shelf_life_extensions")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to));
  } catch {
    return [];
  }
}

/** lot_id → its extensions, newest first (input is already newest-first). */
export function extensionsByLot(
  exts: ShelfLifeExtension[]
): Record<string, ShelfLifeExtension[]> {
  const byLot: Record<string, ShelfLifeExtension[]> = {};
  for (const e of exts) (byLot[e.lot_id] ??= []).push(e);
  return byLot;
}

/**
 * The date the lot should be judged against: the most recent extension wins
 * (the latest documented decision, even if it brought the date back in),
 * otherwise the supplier's printed best-before. Null = no date recorded.
 */
export function effectiveBestBefore(
  lot: { id: string; best_before_date: string | null },
  byLot: Record<string, ShelfLifeExtension[]>
): { date: string | null; extended: boolean } {
  const latest = byLot[lot.id]?.[0];
  if (latest) return { date: latest.extended_until, extended: true };
  return { date: lot.best_before_date, extended: false };
}

/**
 * Days until the date (negative = past), midnight-to-midnight so a lot
 * expiring today reads as 0, not a fraction. "soon" = within 7 days.
 */
export function expiryStatus(
  dateStr: string | null
): { days: number; status: "expired" | "soon" | "ok" } | null {
  if (!dateStr) return null;
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  if (isNaN(d.getTime())) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - now.getTime()) / 86_400_000);
  return { days, status: days < 0 ? "expired" : days <= 7 ? "soon" : "ok" };
}
