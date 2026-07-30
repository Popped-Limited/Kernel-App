"use client";

// Production Schedule — plan next week's runs on the calendar (batches per
// day), then see what the plan needs vs what's on the shelf: the "to order"
// column is the shopping list. Deterministic maths, shown in full: needed =
// recipe grams × planned batches summed across the displayed week; in stock =
// lot remainders minus what in-progress batch drafts have reserved.

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fetchAll } from "@/lib/fetchAll";
import ProductionCalendar, { type CalendarEvent } from "@/components/ProductionCalendar";
import { packLotUses } from "@/lib/packing-runs";
import type { Checklist, Ingredient, IngredientLot } from "@/lib/types";

// Recipe entry parsed from an ingredient_table question: "Name|grams" per option
interface RecipeEntry { name: string; grams: number }

interface RequirementRow {
  name: string;         // display name (recipe spelling)
  neededG: number;
  availableG: number | null; // null = ingredient not found in Raw Materials
  toOrderG: number;
}

function fmtG(g: number): string {
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`;
}

export default function ProductionSchedulePage() {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  // checklist_id → its recipe (empty array = production checklist without an ingredient table)
  const [recipes, setRecipes] = useState<Record<string, RecipeEntry[]>>({});
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [lots, setLots] = useState<IngredientLot[]>([]);
  // Lot id → grams/units reserved by in-progress batch drafts
  const [reservedByLot, setReservedByLot] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // The week the calendar is showing, pushed up via onWeekData
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [weekEvents, setWeekEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const [clRes, qRes, ingRes, lotsData, draftsData] = await Promise.all([
      supabase.from("checklists").select("*").eq("active", true).order("name"),
      supabase.from("questions").select("checklist_id, options").eq("type", "ingredient_table"),
      supabase.from("ingredients").select("*").order("name"),
      // Lots and drafts grow with usage — paginate past the 1000-row cap so
      // the stock figures stay complete.
      fetchAll<IngredientLot>((from, to) =>
        supabase.from("ingredient_lots").select("*").gt("quantity_remaining_g", 0).order("julian_code").range(from, to)),
      fetchAll<{ id: string; answers: Record<string, unknown> | null }>((from, to) =>
        supabase.from("batch_drafts").select("id, answers").order("id").range(from, to)),
    ]);

    setChecklists((clRes.data ?? []) as Checklist[]);
    setIngredients((ingRes.data ?? []) as Ingredient[]);
    setLots(lotsData);

    // Parse each production checklist's recipe from its ingredient_table options
    const recipeMap: Record<string, RecipeEntry[]> = {};
    for (const q of (qRes.data ?? []) as { checklist_id: string; options: string[] | null }[]) {
      const entries: RecipeEntry[] = [];
      for (const opt of q.options ?? []) {
        const [name, grams] = opt.split("|");
        const g = parseFloat(grams);
        if (name?.trim() && !isNaN(g) && g > 0) entries.push({ name: name.trim(), grams: g });
      }
      recipeMap[q.checklist_id] = entries;
    }
    setRecipes(recipeMap);

    // Stock already committed to in-progress batch drafts — same accounting as
    // the Raw Materials page (ingredient_table lots + split packing lots).
    const reserved: Record<string, number> = {};
    for (const draft of draftsData) {
      for (const val of Object.values(draft.answers ?? {})) {
        if (typeof val !== "string") continue;
        try {
          const parsed = JSON.parse(val);
          const rows = Array.isArray(parsed) ? parsed : (parsed?.rows ?? []);
          if (!Array.isArray(rows) || rows.length === 0) continue;
          for (const row of rows) {
            for (const lot of (row.lots ?? [])) {
              if (lot.lot_id && Number(lot.weight_g) > 0) {
                reserved[lot.lot_id] = (reserved[lot.lot_id] || 0) + Number(lot.weight_g);
              }
            }
            for (const use of packLotUses(row)) {
              reserved[use.lot_id] = (reserved[use.lot_id] || 0) + use.amount;
            }
          }
        } catch { /* not a lot-linked answer — skip */ }
      }
    }
    setReservedByLot(reserved);
    setLoading(false);
  }

  const onWeekData = useCallback((ws: string, events: CalendarEvent[]) => {
    setWeekStart(ws);
    setWeekEvents(events);
  }, []);

  // On-shelf stock per ingredient, keyed by exact (case-insensitive, trimmed)
  // name — Tom's rule: never fuzzy-match ingredient names.
  const stockByName = useMemo(() => {
    const ingById: Record<string, Ingredient> = {};
    for (const ing of ingredients) ingById[ing.id] = ing;
    const map: Record<string, number> = {};
    for (const lot of lots) {
      const ing = ingById[lot.ingredient_id];
      if (!ing) continue;
      const key = ing.name.trim().toLowerCase();
      const onShelf = Math.max(0, lot.quantity_remaining_g - (reservedByLot[lot.id] ?? 0));
      map[key] = (map[key] ?? 0) + onShelf;
    }
    // An ingredient with no lots still exists — record 0 so it's "in stock: 0"
    // rather than "not found"
    for (const ing of ingredients) {
      const key = ing.name.trim().toLowerCase();
      if (!(key in map)) map[key] = 0;
    }
    return map;
  }, [ingredients, lots, reservedByLot]);

  const plannedEvents = useMemo(
    () => weekEvents.filter(e => e.type === "production" && e.checklist_id),
    [weekEvents]
  );

  const requirements = useMemo<RequirementRow[]>(() => {
    const needed: Record<string, { display: string; grams: number }> = {};
    for (const ev of plannedEvents) {
      const recipe = recipes[ev.checklist_id!] ?? [];
      const batches = Math.max(1, ev.batches ?? 1);
      for (const entry of recipe) {
        const key = entry.name.trim().toLowerCase();
        needed[key] = {
          display: needed[key]?.display ?? entry.name,
          grams: (needed[key]?.grams ?? 0) + entry.grams * batches,
        };
      }
    }
    const rows: RequirementRow[] = Object.entries(needed).map(([key, v]) => {
      const available = key in stockByName ? stockByName[key] : null;
      return {
        name: v.display,
        neededG: v.grams,
        availableG: available,
        toOrderG: available === null ? v.grams : Math.max(0, v.grams - available),
      };
    });
    // Shortfalls first (biggest gap at the top), covered ingredients after
    rows.sort((a, b) => (b.toOrderG - a.toOrderG) || a.name.localeCompare(b.name));
    return rows;
  }, [plannedEvents, recipes, stockByName]);

  const shortfalls = requirements.filter(r => r.toOrderG > 0);
  const totalBatches = plannedEvents.reduce((s, e) => s + Math.max(1, e.batches ?? 1), 0);

  const weekLabel = useMemo(() => {
    if (!weekStart) return "";
    const s = new Date(weekStart + "T12:00:00");
    const e = new Date(s); e.setDate(e.getDate() + 6);
    return `${s.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${e.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  }, [weekStart]);

  return (
    <div className="flex flex-1 min-h-0">
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto space-y-6">

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">Production Schedule</h1>
            <Link href="/production/goods-in" className="btn-primary text-sm">Log a Delivery →</Link>
          </div>

          {!loading && <ProductionCalendar checklists={checklists} showBatches onWeekData={onWeekData} />}

          {/* Weekly ingredient requirement — the plan vs the shelf */}
          {!loading && weekStart && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-gray-700">Ingredients for {weekLabel}</h2>
                {plannedEvents.length > 0 && (
                  <span className="text-xs text-gray-400">
                    {totalBatches} batch{totalBatches !== 1 ? "es" : ""} planned
                  </span>
                )}
              </div>

              {plannedEvents.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-500">
                  No production planned this week yet — tap a day above and add the runs you&apos;re going to make.
                </p>
              ) : requirements.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-500">
                  The planned records don&apos;t have an ingredient table, so there&apos;s nothing to total up.
                </p>
              ) : (
                <>
                  {shortfalls.length > 0 ? (
                    <div className="mx-4 mt-3 rounded-lg bg-amber-50 border border-amber-300 px-3 py-2">
                      <p className="text-xs font-semibold text-amber-800">
                        {shortfalls.length} ingredient{shortfalls.length !== 1 ? "s" : ""} to order before this week&apos;s runs
                      </p>
                    </div>
                  ) : (
                    <div className="mx-4 mt-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                      <p className="text-xs font-semibold text-green-700">
                        Stock covers everything planned this week
                      </p>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm mt-1">
                      <thead>
                        <tr className="text-xs text-gray-500 border-b border-gray-100">
                          <th className="text-left px-4 py-2 font-medium">Ingredient</th>
                          <th className="text-right px-4 py-2 font-medium">Needed</th>
                          <th className="text-right px-4 py-2 font-medium">In stock</th>
                          <th className="text-right px-4 py-2 font-medium">To order</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {requirements.map(r => (
                          <tr key={r.name}>
                            <td className="px-4 py-2 font-medium text-gray-900">{r.name}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-gray-600">{fmtG(r.neededG)}</td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {r.availableG === null ? (
                                <span className="text-xs text-red-500" title="No raw material with this exact name — check the recipe spelling matches Raw Materials">
                                  Not in Raw Materials
                                </span>
                              ) : (
                                <span className={r.availableG >= r.neededG ? "text-gray-600" : "text-amber-600 font-medium"}>
                                  {fmtG(r.availableG)}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {r.toOrderG > 0 ? (
                                <span className="font-semibold text-red-600">{fmtG(r.toOrderG)}</span>
                              ) : (
                                <span className="text-green-600">✓</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="px-4 py-3 text-xs text-gray-400">
                    Needed = recipe × planned batches for the week shown. In stock excludes what in-progress batches have already claimed.
                  </p>
                </>
              )}
            </div>
          )}

          {loading && (
            <div className="card px-4 py-8 text-center text-sm text-gray-400">Loading…</div>
          )}
        </div>
      </main>
    </div>
  );
}
