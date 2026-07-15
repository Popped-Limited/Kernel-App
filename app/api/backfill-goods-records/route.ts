import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAll } from "@/lib/fetchAll";

/**
 * POST /api/backfill-goods-records
 *
 * One-time backfill: creates checklist submissions for all historical
 * ingredient_lots (Goods In) and dispatches (Goods Out) that don't yet
 * have a corresponding submission record.
 *
 * Groups:
 *   - ingredient_lots  → by (received_date, supplier, created_by)
 *   - dispatches       → by (dispatch_date, customer, dispatched_by, reference)
 */
export async function POST() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Service role key not configured" }, { status: 500 });
  }

  // ── Find checklist IDs ─────────────────────────────────────────────────────
  const [{ data: giChecklist }, { data: goChecklist }] = await Promise.all([
    supabaseAdmin
      .from("checklists")
      .select("id, organisation_id")
      .ilike("name", "%goods in%")
      .eq("active", true)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("checklists")
      .select("id, organisation_id")
      .ilike("name", "%goods out%")
      .eq("active", true)
      .limit(1)
      .maybeSingle(),
  ]);

  let goodsInCreated = 0;
  let goodsOutCreated = 0;

  // ── Goods In backfill ──────────────────────────────────────────────────────
  if (giChecklist) {
    const lots = await fetchAll<any>((from, to) => supabaseAdmin
      .from("ingredient_lots")
      .select("id, ingredient_id, julian_code, quantity_received_g, received_date, supplier, created_by, best_before_date, created_at, organisation_id, ingredient:ingredients(name, unit)")
      .order("received_date", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, to));

    if (lots && lots.length > 0) {
      // Group by (received_date, supplier, created_by)
      const groups = new Map<string, typeof lots>();
      for (const lot of lots) {
        const key = `${lot.received_date}|${lot.supplier ?? ""}|${lot.created_by ?? ""}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(lot);
      }

      for (const [, groupLots] of groups) {
        const first = groupLots[0];
        const supplierName = first.supplier ?? "Unknown supplier";
        const loggedBy = first.created_by ?? "Unknown";
        const receivedDate = first.received_date;

        const itemLines = groupLots.map((l: any) => {
          const name = l.ingredient?.name ?? "Unknown";
          const unit = l.ingredient?.unit ?? "g";
          const qty = unit === "units"
            ? `${Number(l.quantity_received_g).toLocaleString()} units`
            : `${Number(l.quantity_received_g).toLocaleString()}g`;
          const bbe = l.best_before_date ? ` · BBE: ${l.best_before_date}` : "";
          return `  • ${name}: ${qty} (Lot: ${l.julian_code})${bbe}`;
        });

        const batchNotes = [
          `Supplier: ${supplierName}`,
          `Date received: ${receivedDate}`,
          `Items:`,
          ...itemLines,
        ].join("\n");

        const { error } = await supabaseAdmin.from("submissions").insert({
          checklist_id: giChecklist.id,
          organisation_id: first.organisation_id ?? giChecklist.organisation_id ?? null,
          submitted_by: loggedBy,
          submitted_at: first.created_at ?? `${receivedDate}T09:00:00.000Z`,
          batch_notes: batchNotes,
        });

        if (!error) goodsInCreated++;
        else console.error("Goods-in backfill insert error:", error.message);
      }
    }
  }

  // ── Goods Out backfill ─────────────────────────────────────────────────────
  if (goChecklist) {
    const dispatches = await fetchAll<any>((from, to) => supabaseAdmin
      .from("dispatches")
      .select("id, dispatch_date, product, customer, cases_of_6, cases_of_3, singles, total_units, reference, dispatched_by, notes, created_at, organisation_id, status")
      .order("dispatch_date", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, to));

    if (dispatches && dispatches.length > 0) {
      // Group by (dispatch_date, customer, dispatched_by, reference)
      const groups = new Map<string, typeof dispatches>();
      for (const d of dispatches) {
        // Packed-not-shipped orders get their Goods Out record at Mark shipped
        if (d.status === "packed") continue;
        const key = `${d.dispatch_date}|${d.customer}|${d.dispatched_by}|${d.reference ?? ""}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(d);
      }

      for (const [, groupDispatches] of groups) {
        const first = groupDispatches[0];
        const grandTotal = groupDispatches.reduce((s: number, d: any) => s + (d.total_units ?? 0), 0);

        const itemLines = groupDispatches.map((d: any) => {
          const parts: string[] = [];
          if (d.cases_of_6) parts.push(`${d.cases_of_6}×6`);
          if (d.cases_of_3) parts.push(`${d.cases_of_3}×3`);
          if (d.singles) parts.push(`${d.singles} singles`);
          return `  • ${d.product}: ${parts.join(", ")} (${d.total_units} units)`;
        });

        const batchNoteLines = [
          `Customer: ${first.customer}`,
          `Date dispatched: ${first.dispatch_date}`,
          ...(first.reference ? [`Reference: ${first.reference}`] : []),
          `Products:`,
          ...itemLines,
          `Total: ${grandTotal} units`,
          ...(first.notes ? [`Notes: ${first.notes}`] : []),
        ];

        const { error } = await supabaseAdmin.from("submissions").insert({
          checklist_id: goChecklist.id,
          organisation_id: first.organisation_id ?? goChecklist.organisation_id ?? null,
          submitted_by: first.dispatched_by,
          submitted_at: first.created_at ?? `${first.dispatch_date}T09:00:00.000Z`,
          batch_notes: batchNoteLines.join("\n"),
        });

        if (!error) goodsOutCreated++;
        else console.error("Goods-out backfill insert error:", error.message);
      }
    }
  }

  return NextResponse.json({
    goodsInCreated,
    goodsOutCreated,
    goodsInChecklistFound: !!giChecklist,
    goodsOutChecklistFound: !!goChecklist,
  });
}
