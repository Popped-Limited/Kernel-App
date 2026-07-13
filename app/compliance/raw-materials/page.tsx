"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import SaveButton from "@/components/SaveButton";
import { useOrganisation } from "@/contexts/OrganisationContext";
import type { Ingredient, IngredientLot, NutritionPer100g } from "@/lib/types";
// type-only import — the ~550KB CoFID dataset itself is loaded on demand via
// dynamic import when the user first searches
import type { CofidFood } from "@/lib/nutrition/cofid";
import { formatDate } from "@/lib/utils";
import DocUploader from "@/components/DocUploader";
import SortableTh, { type SortDir } from "@/components/SortableTh";
import { useGuidedTour } from "@/lib/useGuidedTour";
import { fetchLotUsage, fetchWastage } from "@/lib/traceability";
import { fetchAll } from "@/lib/fetchAll";

interface Supplier { id: string; name: string }
type ItemType = "ingredient" | "packaging" | "supplies";
type IngredientWithLots = Ingredient & { lots: IngredientLot[]; supplier?: Supplier };

const TABS: { key: ItemType; label: string; icon: string }[] = [
  { key: "ingredient", label: "Ingredients",  icon: "🌽" },
  { key: "packaging",  label: "Packaging",    icon: "📦" },
  { key: "supplies",   label: "Supplies",     icon: "🧴" },
];

// Nutrition inputs, in FIC declaration order. Keys match NutritionPer100g.
const NUTRITION_FIELDS: { key: keyof NutritionPer100g; label: string }[] = [
  { key: "energy_kcal",    label: "Energy (kcal)" },
  { key: "energy_kj",      label: "Energy (kJ)" },
  { key: "fat_g",          label: "Fat (g)" },
  { key: "saturates_g",    label: "of which saturates (g)" },
  { key: "carbohydrate_g", label: "Carbohydrate (g)" },
  { key: "sugars_g",       label: "of which sugars (g)" },
  { key: "fibre_g",        label: "Fibre (g)" },
  { key: "protein_g",      label: "Protein (g)" },
  { key: "salt_g",         label: "Salt (g)" },
];

const NUTRITION_SOURCE_LABELS: Record<string, string> = {
  cofid: "CoFID",
  spec_sheet: "Spec sheet",
  manual: "Manual",
};

// Singular noun for the per-tab "+ Add" button (mirrors "+ Add Supplier").
const ADD_LABELS: Record<ItemType, string> = {
  ingredient: "Ingredient",
  packaging:  "Packaging",
  supplies:   "Supply",
};

// The tab bar shows the three item types plus a read-only reconciliation history.
type View = ItemType | "reconciliation";

// A single historic stock reconciliation, from the write-only wastage_log table.
interface WastageEntry {
  id: string;
  ingredient_id: string | null;
  lot_id: string | null;
  julian_code: string;
  ingredient_name: string;
  adjusted_from_g: number;
  adjusted_to_g: number;
  quantity_written_off_g: number;
  reason: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

const RECON_REASON_LABELS: Record<string, string> = {
  wastage: "Wastage",
  damaged: "Damaged / contaminated",
  expired: "Expired",
  other:   "Other",
};

// The "Recalculate stock" button was a stop-gap for stock bugs that are now fixed.
// Hidden until a customer needs it; the handler is kept intact behind this flag.
const SHOW_RECALCULATE = false;

function fmtQty(qty: number, unit: "g" | "units") {
  return unit === "units" ? `${qty} units` : `${(qty / 1000).toFixed(2)} kg`;
}

/**
 * Sum the ingredient quantities held by in-progress batch drafts, per lot id.
 * Stock is only deducted from lots when a batch record is SUBMITTED, so a
 * long-running draft (e.g. a two-week ferment) still shows here as committed
 * stock — this lets the page show "in production" alongside "in stock" so
 * weekly reconciliation matches what's physically on the shelf.
 */
function reservedFromDrafts(drafts: { answers: Record<string, unknown> | null }[]): Record<string, number> {
  const reserved: Record<string, number> = {};
  for (const draft of drafts) {
    for (const val of Object.values(draft.answers ?? {})) {
      if (typeof val !== "string") continue;
      try {
        const parsed = JSON.parse(val);
        const rows = Array.isArray(parsed) ? parsed : (parsed?.rows ?? []);
        if (!Array.isArray(rows) || rows.length === 0) continue;
        for (const row of rows) {
          // ingredient_table lots (grams)
          for (const lot of (row.lots ?? [])) {
            if (lot.lot_id && Number(lot.weight_g) > 0) {
              reserved[lot.lot_id] = (reserved[lot.lot_id] || 0) + Number(lot.weight_g);
            }
          }
          // packing_runs primary packaging (units)
          if (row.jar_lot_id && Number(row.jars_used) > 0) {
            reserved[row.jar_lot_id] = (reserved[row.jar_lot_id] || 0) + Number(row.jars_used);
          }
          if (row.lids_lot_id && Number(row.lids_count) > 0) {
            reserved[row.lids_lot_id] = (reserved[row.lids_lot_id] || 0) + Number(row.lids_count);
          }
        }
      } catch { /* not a lot-linked answer — skip */ }
    }
  }
  return reserved;
}

/** Small "review due" badge shown under the spec-sheet tick. Amber when due within
 *  60 days, red when overdue — mirrors the supplier accreditation review dates. */
function SpecReviewBadge({ dateStr }: { dateStr: string | null }) {
  if (!dateStr) return null;
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const days = Math.floor((d.getTime() - now.getTime()) / 86_400_000);
  const formatted = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (days < 0) return <p className="mt-1 text-[10px] font-semibold text-red-600 whitespace-nowrap">Review overdue</p>;
  if (days <= 60) return <p className="mt-1 text-[10px] font-semibold text-amber-600 whitespace-nowrap">Review due {formatted}</p>;
  return <p className="mt-1 text-[10px] text-gray-400 whitespace-nowrap">Review {formatted}</p>;
}

const ALLERGENS = [
  "Celery", "Gluten", "Crustaceans", "Eggs", "Fish", "Lupin",
  "Milk", "Molluscs", "Mustard", "Tree nuts", "Peanuts", "Sesame",
  "Soya", "Sulphites",
];

const EMPTY_ITEM: IngredientWithLots = {
  id: "", name: "", type: "ingredient", unit: "g",
  price_per_kg: null, supplier_id: null, density_g_per_l: null,
  allergens: [], may_contain_allergens: [],
  spec_sheet_review_frequency_years: null, spec_sheet_next_review_due: null,
  is_primary_packaging: false,
  created_at: "", lots: [],
};

export default function RawMaterialsPage() {
  const { orgId } = useOrganisation();
  const [items, setItems]           = useState<IngredientWithLots[]>([]);
  const [suppliers, setSuppliers]   = useState<Supplier[]>([]);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState<View>("ingredient");
  const [wastageLog, setWastageLog] = useState<WastageEntry[]>([]);
  const [expanded, setExpanded]     = useState<Record<string, boolean>>({});
  const [hasDoc, setHasDoc]         = useState<Set<string>>(new Set());
  // Lot id → grams held by in-progress batch drafts (not yet deducted from stock)
  const [reservedByLot, setReservedByLot] = useState<Record<string, number>>({});

  // Reconcile panel
  // reconMode controls how the typed number is interpreted:
  //   "remove"   → the amount to write off (new remaining = current − typed)
  //   "count"    → the actual amount left after a stocktake (new remaining = typed)
  //   "variance" → log an unaccounted historical write-off WITHOUT changing
  //                remaining stock (closes a mass-balance gap truthfully)
  // The item being reconciled — opens the panel; the lot is picked inside it
  const [reconIng, setReconIng]         = useState<IngredientWithLots | null>(null);
  const [reconLot, setReconLot]         = useState<{ lot: IngredientLot; ing: IngredientWithLots; reserved: number } | null>(null);
  const [reconMode, setReconMode]       = useState<"remove" | "count" | "variance">("remove");
  const [reconInput, setReconInput]     = useState("");
  const [reconReason, setReconReason]   = useState("wastage");
  const [reconNotes, setReconNotes]     = useState("");
  const [reconSaving, setReconSaving]   = useState(false);
  const [reconError, setReconError]     = useState("");
  // Depleted (0-left) lots are hidden from the picker by default — they're historic
  // goods-in records. Toggle reveals them so a variance can still be explained.
  const [reconShowDepleted, setReconShowDepleted] = useState(false);
  // received − used − written off − remaining for the open lot (null while loading)
  const [reconUnaccounted, setReconUnaccounted] = useState<number | null>(null);
  // The used/written-off figures behind that gap, so the panel can show the maths
  const [reconBalance, setReconBalance] = useState<{ used: number; writtenOff: number } | null>(null);
  // Who is reconciling — stamped onto every wastage_log row for the audit trail
  const [userName, setUserName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const name = (user?.user_metadata as { full_name?: string } | undefined)?.full_name;
      if (name) setUserName(name);
    });
  }, []);

  // Resolve the typed value + mode into the new quantity_remaining_g to store.
  // "remove" mode: deduct from total remaining (on-shelf write-off).
  // "count" mode: user typed what's physically on shelf; add back in-production
  //   so the stored figure = on-shelf + reserved.
  function reconNewRemainingG(lot: IngredientLot, unit: "g" | "units", reserved: number): number | null {
    if (reconInput === "") return null;
    const typed = parseFloat(reconInput);
    if (isNaN(typed)) return null;
    const typedG = unit === "units" ? Math.round(typed) : Math.round(typed * 1000);
    return reconMode === "count" ? typedG + reserved : lot.quantity_remaining_g - typedG;
  }

  // Nutrition (per 100g) — string inputs; the dirty flag gates the save payload
  // so every other edit keeps working until the nutrition migration has been run
  const [editNutrition, setEditNutrition] = useState<Record<string, string>>({});
  const [editNutritionSource, setEditNutritionSource] = useState<"" | "cofid" | "spec_sheet" | "manual">("");
  const [editNutritionCode, setEditNutritionCode] = useState("");
  // Basis the values are stored on: liquids may be per 100ml (converted to
  // per 100g in the label calc using density). CoFID is always per 100g.
  const [editNutritionBasis, setEditNutritionBasis] = useState<"per_100g" | "per_100ml">("per_100g");
  const [nutritionDirty, setNutritionDirty] = useState(false);
  const [cofidQuery, setCofidQuery] = useState("");
  const [cofidResults, setCofidResults] = useState<CofidFood[]>([]);
  const [cofidPreview, setCofidPreview] = useState<CofidFood | null>(null);
  // AI spec-sheet extraction — pre-fills the form; the user still reviews & saves
  const [extracting, setExtracting] = useState(false);
  const [extractNotes, setExtractNotes] = useState<string[]>([]);
  const [extractError, setExtractError] = useState("");
  // Live spec-sheet count for the open item, so the Read button appears as soon
  // as a spec is uploaded in-panel (not only after a reload)
  const [specDocCount, setSpecDocCount] = useState(0);

  // Edit / create panel
  const [editing, setEditing]           = useState<IngredientWithLots | null>(null);
  const [editName, setEditName]         = useState("");
  const [editType, setEditType]         = useState<ItemType>("ingredient");
  const [editUnit, setEditUnit]         = useState<"g" | "units">("g");
  const [editPrice, setEditPrice]       = useState("");
  const [editSupplier, setEditSupplier] = useState("");
  const [editDensity, setEditDensity]     = useState("");
  const [editAllergens, setEditAllergens] = useState<string[]>([]);
  const [editMayContain, setEditMayContain] = useState<string[]>([]);
  const [editSpecReviewFreq, setEditSpecReviewFreq] = useState("");
  const [editSpecReviewDue, setEditSpecReviewDue]   = useState("");
  const [editIsPrimary, setEditIsPrimary]           = useState(false);
  const [saving, setSaving]               = useState(false);
  const [saveError, setSaveError]       = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const isNew = editing?.id === "";

  // Table sorting
  const [sortKey, setSortKey] = useState<string>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  function toggleSort(col: string) {
    if (sortKey === col) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(col); setSortDir("asc"); }
  }

  // Recalculate stock
  const [recalculating, setRecalculating] = useState(false);
  const [recalcResult, setRecalcResult]   = useState<string | null>(null);

  async function handleRecalculate() {
    if (!confirm("This will reset all lot quantities from scratch by replaying every production record. Continue?")) return;
    setRecalculating(true);
    setRecalcResult(null);
    try {
      const res  = await fetch("/api/admin/recalculate-stock", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setRecalcResult(
        `Done — ${data.lots_reset} lots reset, ${data.deduction_entries_replayed} deductions replayed across ${data.lots_with_usage} lots.`
      );
      load(); // refresh the page data
    } catch (e: unknown) {
      setRecalcResult("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRecalculating(false);
    }
  }

  useEffect(() => { load(); }, []);

  useGuidedTour({
    tourKey: "raw_materials",
    ready: !loading,
    orgId,
    openPanel: openCreate,
    steps: [
      {
        element: '[data-tour="add-ingredient"]',
        popover: {
          title: "Add a raw material",
          description:
            "Every ingredient, packaging item and cleaning supply lives here. Click Next and I'll open the form.",
          side: "left",
        },
      },
      {
        element: '[data-tour="ingredient-name"]',
        popover: {
          title: "Name it",
          description: "Give the raw material a name — e.g. \"Garlic\".",
          side: "right",
        },
      },
      {
        element: '[data-tour="ingredient-supplier"]',
        popover: {
          title: "Choose a supplier",
          description:
            "Link it to the supplier you buy it from — the ones you added earlier appear here.",
          side: "right",
        },
      },
      {
        element: '[data-tour="ingredient-price"]',
        popover: {
          title: "Price & density",
          description:
            "Enter the price per kg so Kernel values your stock. For liquids, set the density just below (e.g. 917 for oil) so deliveries in litres convert to grams.",
          side: "right",
        },
      },
      {
        element: '[data-tour="ingredient-allergens"]',
        popover: {
          title: "Tag allergens",
          description:
            "Tap any allergens this ingredient contains — these flow through to your allergen records.",
          side: "left",
        },
      },
      {
        element: '[data-tour="ingredient-save"]',
        popover: {
          title: "Save to finish",
          description:
            "Hit Create. Reopen it any time to attach a spec sheet or COSHH document.",
          side: "top",
        },
      },
    ],
  });

  async function load() {
    // Lots, wastage history and documents all grow without bound — paginate
    // past the 1000-row cap so stock totals and reconciliation history stay complete.
    const [lotsData, ingsRes, supRes, docsData, draftsData, wastageData] = await Promise.all([
      fetchAll<IngredientLot & { ingredient: Ingredient }>((from, to) =>
        supabase.from("ingredient_lots").select("*, ingredient:ingredients(*)").order("julian_code").range(from, to)),
      supabase.from("ingredients").select("*").order("name"),
      supabase.from("suppliers").select("id, name").order("name"),
      fetchAll<{ entity_id: string; doc_type: string }>((from, to) =>
        supabase.from("documents").select("entity_id, doc_type").in("entity_type", ["ingredient", "packaging", "supply"]).order("id").range(from, to)),
      fetchAll<{ id: string; answers: Record<string, unknown> | null }>((from, to) =>
        supabase.from("batch_drafts").select("id, answers").order("id").range(from, to)),
      fetchAll<WastageEntry>((from, to) =>
        supabase.from("wastage_log").select("*").order("created_at", { ascending: false }).range(from, to)),
    ]);

    setReservedByLot(reservedFromDrafts(draftsData));
    setWastageLog(wastageData);

    const sups = (supRes.data ?? []) as Supplier[];
    setSuppliers(sups);

    // Build a set of ingredient IDs that have a relevant doc uploaded
    const docSet = new Set<string>();
    for (const doc of docsData) {
      if (doc.doc_type === "spec_sheet" || doc.doc_type === "coshh") {
        docSet.add(doc.entity_id);
      }
    }
    setHasDoc(docSet);

    if (ingsRes.data) {
      const supById = Object.fromEntries(sups.map(s => [s.id, s]));
      const lotsByIng: Record<string, IngredientLot[]> = {};
      for (const lot of lotsData)
        (lotsByIng[lot.ingredient_id] ??= []).push(lot);

      setItems(
        (ingsRes.data as Ingredient[]).map(ing => ({
          ...ing,
          lots: lotsByIng[ing.id] ?? [],
          supplier: ing.supplier_id ? supById[ing.supplier_id] : undefined,
        }))
      );
    }
    setLoading(false);
  }

  function resetNutritionState(ing: IngredientWithLots | null) {
    const n = ing?.nutrition_per_100g;
    const vals: Record<string, string> = {};
    for (const f of NUTRITION_FIELDS) {
      const v = n?.[f.key];
      vals[f.key] = v != null ? String(v) : "";
    }
    setEditNutrition(vals);
    setEditNutritionSource(ing?.nutrition_source ?? "");
    setEditNutritionCode(ing?.nutrition_cofid_code ?? "");
    setEditNutritionBasis(ing?.nutrition_basis ?? "per_100g");
    setNutritionDirty(false);
    setCofidQuery("");
    setCofidResults([]);
    setCofidPreview(null);
    setExtracting(false);
    setExtractNotes([]);
    setExtractError("");
  }

  function openEdit(ing: IngredientWithLots) {
    setEditing(ing);
    setEditName(ing.name);
    setEditType(ing.type ?? "ingredient");
    setEditUnit(ing.unit ?? "g");
    setEditPrice(ing.price_per_kg != null ? String(ing.price_per_kg) : "");
    setEditSupplier(ing.supplier_id ?? "");
    setEditDensity(ing.density_g_per_l != null ? String(ing.density_g_per_l) : "");
    setEditAllergens(ing.allergens ?? []);
    setEditMayContain(ing.may_contain_allergens ?? []);
    setEditSpecReviewFreq(ing.spec_sheet_review_frequency_years != null ? String(ing.spec_sheet_review_frequency_years) : "");
    setEditSpecReviewDue(ing.spec_sheet_next_review_due ?? "");
    setEditIsPrimary(ing.is_primary_packaging ?? false);
    resetNutritionState(ing);
    setSpecDocCount(hasDoc.has(ing.id) ? 1 : 0);
    setSaveError("");
    setDeleteConfirm(false);
  }

  function openCreate() {
    // Reconciliation is a read-only view; fall back to Ingredient when adding.
    const t: ItemType = activeTab === "reconciliation" ? "ingredient" : activeTab;
    const defaultUnit = t === "ingredient" ? "g" : "units";
    setEditing({ ...EMPTY_ITEM, type: t, unit: defaultUnit });
    setEditName("");
    setEditType(t);
    setEditUnit(defaultUnit);
    setEditPrice("");
    setEditSupplier("");
    setEditDensity("");
    setEditAllergens([]);
    setEditMayContain([]);
    setEditSpecReviewFreq("");
    setEditSpecReviewDue("");
    setEditIsPrimary(false);
    resetNutritionState(null);
    setSpecDocCount(0);
    setSaveError("");
    setDeleteConfirm(false);
  }

  async function runCofidSearch(q: string) {
    setCofidQuery(q);
    setCofidPreview(null);
    if (q.trim().length < 2) { setCofidResults([]); return; }
    const { searchCofid } = await import("@/lib/nutrition/cofid");
    setCofidResults(searchCofid(q, 8));
  }

  // Copy a confirmed CoFID match into the form. The user has seen the per-100g
  // preview by this point — never applied without that human check.
  function applyCofid(f: CofidFood) {
    setEditNutrition({
      energy_kcal: String(f.kcal), energy_kj: String(f.kj),
      fat_g: String(f.fat),
      saturates_g: f.saturates != null ? String(f.saturates) : "",
      carbohydrate_g: f.carbohydrate != null ? String(f.carbohydrate) : "",
      sugars_g: f.sugars != null ? String(f.sugars) : "",
      fibre_g: f.fibre != null ? String(f.fibre) : "",
      protein_g: String(f.protein),
      salt_g: f.salt != null ? String(f.salt) : "",
    });
    setEditNutritionSource("cofid");
    setEditNutritionCode(f.code);
    setEditNutritionBasis("per_100g"); // CoFID is always by-weight per 100g
    setNutritionDirty(true);
    setCofidQuery("");
    setCofidResults([]);
    setCofidPreview(null);
  }

  // Ask the server to read the uploaded spec sheet with Claude and pre-fill the
  // form. Values only land in the inputs — the user reviews, then saves.
  async function extractFromSpecSheet() {
    if (!editing?.id) return;
    setExtracting(true);
    setExtractError("");
    setExtractNotes([]);
    try {
      const res = await fetch("/api/extract-spec-nutrition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredient_id: editing.id }),
      });
      const data = await res.json();
      if (!res.ok) { setExtractError(data.error ?? "Extraction failed"); return; }

      const ex = data.extraction as Record<string, unknown> & {
        basis: string; warnings: string[]; salt_converted_from_sodium: boolean;
        allergen_info_found: boolean; allergens_contains: string[]; allergens_may_contain: string[];
      };

      const notes: string[] = [];
      let applied = false;

      // Allergens — only touch them when the spec actually had allergen info, so
      // a nutrition-only read never wipes existing allergen data. Filter to
      // Kernel's known list defensively.
      if (ex.allergen_info_found) {
        const known = (arr: string[]) => (arr ?? []).filter(a => ALLERGENS.includes(a));
        setEditAllergens(known(ex.allergens_contains));
        setEditMayContain(known(ex.allergens_may_contain));
        applied = true;
        notes.push("Allergens and 'may contain' set from the spec's allergen table — check every one against the document.");
      }

      // Nutrition
      if (ex.basis === "per_100g" || ex.basis === "per_100ml") {
        const vals: Record<string, string> = {};
        for (const f of NUTRITION_FIELDS) {
          const v = ex[f.key];
          vals[f.key] = typeof v === "number" ? String(v) : "";
        }
        setEditNutrition(vals);
        setEditNutritionSource("spec_sheet");
        setEditNutritionCode("");
        setEditNutritionBasis(ex.basis === "per_100ml" ? "per_100ml" : "per_100g");
        setNutritionDirty(true);
        applied = true;
        // Drop model warnings that just restate what the structured fields
        // already surface (per-100ml basis, sodium→salt) so we don't print twice.
        const modelWarnings = (ex.warnings ?? []).filter(w => {
          const lc = w.toLowerCase();
          if (ex.basis === "per_100ml" && lc.includes("100ml")) return false;
          if (ex.salt_converted_from_sodium && lc.includes("sodium")) return false;
          return true;
        });
        notes.push(
          ...(ex.basis === "per_100ml" ? ["Nutrition values are per 100ml, not per 100g (liquid product)."] : []),
          ...(ex.salt_converted_from_sodium ? ["Salt was converted from the stated sodium (×2.5)."] : []),
          ...modelWarnings,
        );
      } else {
        notes.push(ex.basis === "per_serving_only"
          ? "No per-100g nutrition column found (only per-serving) — nutrition left unchanged."
          : "No nutrition table found — nutrition left unchanged.");
      }

      if (!applied) {
        setExtractError(`Couldn't read allergens or nutrition from ${data.file_name}`);
        return;
      }
      setExtractNotes([`Read from ${data.file_name} — review before saving.`, ...notes]);
    } catch {
      setExtractError("Extraction failed — try again in a moment");
    } finally {
      setExtracting(false);
    }
  }

  function setNutritionField(key: string, value: string) {
    setEditNutrition(prev => ({ ...prev, [key]: value }));
    setNutritionDirty(true);
    // Hand-edited values are no longer a straight CoFID copy; default fresh
    // typing to spec sheet (the usual source when typing values in).
    if (editNutritionSource === "cofid") { setEditNutritionSource("manual"); setEditNutritionCode(""); }
    else if (editNutritionSource === "") setEditNutritionSource("spec_sheet");
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editName.trim()) { setSaveError("Name is required"); return; }
    setSaving(true);
    setSaveError("");

    const payload: Record<string, unknown> = {
      name: editName.trim(),
      type: editType,
      unit: editUnit,
      price_per_kg: editPrice ? parseFloat(editPrice) : null,
      supplier_id: editSupplier || null,
      density_g_per_l: editDensity ? parseFloat(editDensity) : null,
      allergens: editAllergens,
      may_contain_allergens: editMayContain,
      spec_sheet_review_frequency_years: editSpecReviewFreq ? parseInt(editSpecReviewFreq, 10) : null,
      spec_sheet_next_review_due: editSpecReviewDue || null,
      is_primary_packaging: editType === "packaging" ? editIsPrimary : false,
    };

    // Nutrition keys ride along only when touched, so saves on every other field
    // keep working even before scripts/add-ingredient-nutrition.sql has been run.
    if (nutritionDirty) {
      const values: Record<string, number | null> = {};
      let any = false;
      for (const f of NUTRITION_FIELDS) {
        const raw = (editNutrition[f.key] ?? "").trim();
        const n = raw === "" ? null : parseFloat(raw);
        values[f.key] = n != null && !isNaN(n) ? n : null;
        if (values[f.key] != null) any = true;
      }
      payload.nutrition_per_100g = any ? values : null;
      payload.nutrition_source = any ? (editNutritionSource || "manual") : null;
      payload.nutrition_cofid_code = any && editNutritionSource === "cofid" ? editNutritionCode || null : null;
      payload.nutrition_basis = any ? editNutritionBasis : null;
      payload.nutrition_updated_at = any ? new Date().toISOString() : null;
    }

    const { error } = isNew
      ? await supabase.from("ingredients").insert({ ...payload, organisation_id: orgId })
      : await supabase.from("ingredients").update(payload).eq("id", editing.id);

    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    setEditing(null);
    await load();
  }

  // Open the panel for an item; the lot is chosen inside the panel. With a
  // single lot there's nothing to choose, so it's picked automatically.
  function openReconcilePanel(ing: IngredientWithLots) {
    setReconIng(ing);
    setReconLot(null);
    setReconError("");
    setReconShowDepleted(false);
    // Auto-select only when there's exactly one lot worth acting on (has stock);
    // if all lots are depleted, fall through so the toggle reveals them.
    const available = ing.lots.filter(l => l.quantity_remaining_g > 0);
    if (available.length === 1) selectReconLot(available[0], ing);
  }

  function closeReconcile() {
    setReconIng(null);
    setReconLot(null);
  }

  function selectReconLot(lot: IngredientLot, ing: IngredientWithLots) {
    const reserved = reservedByLot[lot.id] ?? 0;
    setReconLot({ lot, ing, reserved });
    setReconMode("remove");
    setReconInput("");
    setReconReason("wastage");
    setReconNotes("");
    setReconError("");
    // Compute this lot's mass-balance gap so the panel can offer to close it:
    // unaccounted = received − used in production − written off − remaining.
    setReconUnaccounted(null);
    setReconBalance(null);
    Promise.all([fetchLotUsage([lot.id]), fetchWastage([lot.id])])
      .then(([usage, wastage]) => {
        const used = usage[lot.id] ?? 0;
        const writtenOff = (wastage[lot.id] ?? []).reduce((s, w) => s + w.grams, 0);
        const unaccounted = (lot.quantity_received_g ?? 0) - used - writtenOff - lot.quantity_remaining_g;
        setReconUnaccounted(unaccounted);
        setReconBalance({ used, writtenOff });
        // A depleted lot has nothing left to write off or count — if it has a
        // gap, explaining the variance is the only useful action, so jump there.
        const tolerance = (ing.unit ?? "g") === "units" ? 0.5 : 5;
        if (lot.quantity_remaining_g === 0 && unaccounted > tolerance) {
          setReconMode("variance");
          setReconInput((ing.unit ?? "g") === "units" ? String(Math.round(unaccounted)) : (unaccounted / 1000).toFixed(3));
        }
      })
      .catch(() => setReconUnaccounted(0)); // can't compute → just don't offer the variance mode
  }

  /**
   * Variance mode: log a write-off that already physically happened but was
   * never recorded (reconciliations before the wastage log existed). Stock
   * remaining is untouched — only the history row is written, which closes
   * the lot's unaccounted gap in every trace and mock recall.
   */
  async function saveVariance() {
    if (!reconLot) return;
    const { lot, ing } = reconLot;
    const unit = ing.unit ?? "g";
    const typed = parseFloat(reconInput);
    if (isNaN(typed) || typed <= 0) { setReconError("Please enter a valid amount"); return; }
    const varianceG = unit === "units" ? Math.round(typed) : Math.round(typed * 1000);
    const tolerance = unit === "units" ? 0 : 5;
    if (reconUnaccounted !== null && varianceG > reconUnaccounted + tolerance) {
      setReconError(`Only ${fmtQty(Math.max(0, reconUnaccounted), unit)} is unaccounted for on this lot`);
      return;
    }

    setReconSaving(true);
    setReconError("");
    const { error: logErr } = await supabase.from("wastage_log").insert({
      organisation_id: orgId,
      lot_id: lot.id,
      ingredient_id: ing.id,
      julian_code: lot.julian_code,
      ingredient_name: ing.name,
      // The stock physically went from remaining+X to remaining at some earlier,
      // unlogged point — record exactly that; quantity_remaining_g is untouched.
      adjusted_from_g: lot.quantity_remaining_g + varianceG,
      adjusted_to_g: lot.quantity_remaining_g,
      reason: reconReason,
      notes: reconNotes.trim() || "Unaccounted variance reconciliation",
      created_by: userName || null,
    });
    setReconSaving(false);
    if (logErr) { setReconError("The variance couldn't be logged: " + logErr.message); return; }
    closeReconcile();
    await load();
  }

  async function saveReconcile() {
    if (!reconLot) return;
    if (reconMode === "variance") return saveVariance();
    const { lot, ing, reserved } = reconLot;
    const unit = ing.unit ?? "g";
    const onShelfG = Math.max(0, lot.quantity_remaining_g - reserved);

    const actualG = reconNewRemainingG(lot, unit, reserved);

    if (actualG === null) {
      setReconError("Please enter a valid amount");
      return;
    }
    // New remaining must not dip below reserved — that would remove in-production stock
    if (actualG < reserved) {
      setReconError(`That's more than the ${fmtQty(onShelfG, unit)} currently on shelf (${fmtQty(reserved, unit)} is in production)`);
      return;
    }
    if (actualG < 0) {
      setReconError(`That's more than the ${fmtQty(lot.quantity_remaining_g, unit)} currently remaining`);
      return;
    }
    if (actualG > lot.quantity_received_g) {
      setReconError(`Cannot exceed amount received (${fmtQty(lot.quantity_received_g, unit)})`);
      return;
    }

    setReconSaving(true);
    setReconError("");

    const { error: lotErr } = await supabase
      .from("ingredient_lots")
      .update({ quantity_remaining_g: actualG })
      .eq("id", lot.id);

    if (lotErr) { setReconError(lotErr.message); setReconSaving(false); return; }

    // The reconciliation history depends on this row. Surface a failure instead
    // of silently swallowing it (a silently-failing insert left the whole log
    // empty before), but keep the completed stock change either way.
    const { error: logErr } = await supabase.from("wastage_log").insert({
      organisation_id: orgId,
      lot_id: lot.id,
      ingredient_id: ing.id,
      julian_code: lot.julian_code,
      ingredient_name: ing.name,
      adjusted_from_g: lot.quantity_remaining_g,
      adjusted_to_g: actualG,
      reason: reconReason,
      notes: reconNotes.trim() || null,
      created_by: userName || null,
    });
    if (logErr) {
      console.error("wastage_log insert failed:", logErr);
      setReconError("Stock updated, but the reconciliation couldn't be logged: " + logErr.message);
      setReconSaving(false);
      await load();
      return;
    }

    setReconSaving(false);
    closeReconcile();
    await load();
  }

  async function deleteItem() {
    if (!editing) return;
    if (editing.lots.length > 0) {
      setSaveError("Cannot delete — this item has delivery records. Remove the lots first.");
      setDeleteConfirm(false);
      return;
    }
    const { error } = await supabase.from("ingredients").delete().eq("id", editing.id);
    if (error) { setSaveError(error.message); return; }
    setEditing(null);
    await load();
  }

  function sortVal(ing: IngredientWithLots, key: string): string | number {
    switch (key) {
      case "supplier": return (ing.supplier?.name ?? "").toLowerCase();
      case "price": return ing.price_per_kg ?? -1;
      case "doc": return hasDoc.has(ing.id) ? 1 : 0;
      case "stock": return ing.lots.reduce((s, l) => s + l.quantity_remaining_g, 0);
      default: return ing.name.toLowerCase();
    }
  }
  const tabItems = items
    .filter(i => (i.type ?? "ingredient") === activeTab)
    .sort((a, b) => {
      const av = sortVal(a, sortKey), bv = sortVal(b, sortKey);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  // Reconciliation view: history grouped per ingredient, and the full item list
  // (all types) mirrored so every raw material is expandable to its own history.
  const reconByIng: Record<string, WastageEntry[]> = {};
  for (const w of wastageLog) if (w.ingredient_id) (reconByIng[w.ingredient_id] ??= []).push(w);
  const reconItems = [...items].sort((a, b) => a.name.localeCompare(b.name));

  const totalRemainingG = items.filter(i => i.type === "ingredient").reduce((s, i) => s + i.lots.reduce((a, l) => a + l.quantity_remaining_g, 0), 0);
  const totalValue = items.reduce((s, ing) => {
    if (!ing.price_per_kg) return s;
    const qty = ing.lots.reduce((a, l) => a + l.quantity_remaining_g, 0);
    return s + (ing.unit === "units" ? qty : qty / 1000) * ing.price_per_kg;
  }, 0);
  const outOfStock = items.filter(i =>
    i.lots.length > 0 && i.lots.reduce((s, l) => s + l.quantity_remaining_g, 0) === 0
  ).length;

  const priceLabel = editUnit === "units" ? "Price per unit (£)" : "Price per kg (£)";

  return (
    <>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-6xl w-full mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">Raw Materials</h1>
            <div className="flex items-center gap-2">
              {/* Recalculate stock: kept for support use but hidden — the bugs that
                  required it are fixed. Flip SHOW_RECALCULATE to re-expose it. */}
              {SHOW_RECALCULATE && (
                <button
                  onClick={handleRecalculate}
                  disabled={recalculating}
                  className="btn-secondary text-sm"
                  title="Recount all stock by replaying every production record from scratch"
                >
                  {recalculating ? "Recalculating…" : "Recalculate stock"}
                </button>
              )}
              {activeTab !== "reconciliation" && (
                <button data-tour="add-ingredient" onClick={openCreate} className="btn-primary text-sm">
                  + Add {ADD_LABELS[activeTab]}
                </button>
              )}
            </div>
          </div>
          {recalcResult && (
            <div className={`rounded-xl px-4 py-3 text-sm ${recalcResult.startsWith("Error") ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
              {recalcResult}
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Ingredients</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{items.filter(i => i.type === "ingredient").length}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Ingredient stock</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{(totalRemainingG / 1000).toFixed(1)} kg</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Stock value</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {totalValue > 0 ? `£${totalValue.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
              </p>
            </div>
            <div className={`card p-4 ${outOfStock > 0 ? "border-brand/50 bg-brand-light" : ""}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${outOfStock > 0 ? "text-brown/70" : "text-gray-500"}`}>Out of stock</p>
              <p className={`mt-1 text-2xl font-bold ${outOfStock > 0 ? "text-brown" : "text-gray-900"}`}>{outOfStock}</p>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === tab.key
                    ? "border-brand text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
                <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                  activeTab === tab.key ? "bg-brand text-gray-900" : "bg-gray-100 text-gray-500"
                }`}>
                  {items.filter(i => (i.type ?? "ingredient") === tab.key).length}
                </span>
              </button>
            ))}
            <button
              onClick={() => setActiveTab("reconciliation")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === "reconciliation"
                  ? "border-brand text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <span>🤝</span>
              Reconciliation
              <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                activeTab === "reconciliation" ? "bg-brand text-gray-900" : "bg-gray-100 text-gray-500"
              }`}>
                {wastageLog.length}
              </span>
            </button>
          </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="card p-8 text-center text-sm text-gray-500">Loading…</div>
          ) : activeTab === "reconciliation" ? (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">
                  Reconciliation history
                  <span className="ml-2 text-gray-400 font-normal">({wastageLog.length} logged)</span>
                </h2>
              </div>
              {reconItems.length === 0 ? (
                <div className="p-10 text-center text-sm text-gray-400">No raw materials yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Last reconciled</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reconciliations</th>
                      <th className="px-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reconItems.map(ing => {
                      const entries = reconByIng[ing.id] ?? [];
                      const unit = ing.unit ?? "g";
                      const isOpen = expanded[ing.id];
                      const hasHistory = entries.length > 0;
                      return (
                        <React.Fragment key={ing.id}>
                          <tr className={`transition-colors ${hasHistory ? "hover:bg-gray-50 cursor-pointer" : ""}`}
                              onClick={hasHistory ? () => setExpanded(p => ({ ...p, [ing.id]: !p[ing.id] })) : undefined}>
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">
                                {ing.name}
                                {ing.type === "packaging" && (
                                  <span className="ml-2 align-middle text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold">Packaging</span>
                                )}
                                {ing.type === "supplies" && (
                                  <span className="ml-2 align-middle text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold">Supply</span>
                                )}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                              {hasHistory ? formatDate(entries[0].created_at.slice(0, 10)) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {hasHistory
                                ? <span className="font-semibold text-gray-900">{entries.length}</span>
                                : <span className="text-gray-300">None</span>}
                            </td>
                            <td className="px-2 py-3 text-right">
                              {hasHistory && (
                                <svg className={`inline h-4 w-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                  viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </td>
                          </tr>
                          {isOpen && hasHistory && (
                            <tr key={`${ing.id}-recon`}>
                              <td colSpan={4} className="bg-gray-50 border-t border-gray-100 px-4 py-3">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-500">
                                      <th className="text-left py-1 font-medium">Date</th>
                                      <th className="text-left py-1 font-medium">Batch / ref</th>
                                      <th className="text-right py-1 font-medium">From → To</th>
                                      <th className="text-right py-1 font-medium">Written off</th>
                                      <th className="text-left py-1 font-medium pl-4">Reason</th>
                                      <th className="text-left py-1 font-medium hidden sm:table-cell">Notes</th>
                                      <th className="text-left py-1 font-medium hidden sm:table-cell">By</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {entries.map(w => (
                                      <tr key={w.id}>
                                        <td className="py-1.5 text-gray-600 whitespace-nowrap">{formatDate(w.created_at.slice(0, 10))}</td>
                                        <td className="py-1.5 font-mono text-gray-700">{w.julian_code || "—"}</td>
                                        <td className="py-1.5 text-right tabular-nums text-gray-600 whitespace-nowrap">
                                          {fmtQty(w.adjusted_from_g, unit)} → {fmtQty(w.adjusted_to_g, unit)}
                                        </td>
                                        <td className={`py-1.5 text-right tabular-nums font-semibold whitespace-nowrap ${w.quantity_written_off_g > 0 ? "text-red-600" : "text-gray-500"}`}>
                                          {w.quantity_written_off_g > 0 ? fmtQty(w.quantity_written_off_g, unit) : "—"}
                                        </td>
                                        <td className="py-1.5 pl-4 text-gray-600">{RECON_REASON_LABELS[w.reason] ?? w.reason}</td>
                                        <td className="py-1.5 text-gray-500 hidden sm:table-cell">{w.notes || "—"}</td>
                                        <td className="py-1.5 text-gray-500 hidden sm:table-cell">{w.created_by || "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">
                  {TABS.find(t => t.key === activeTab)?.label}
                  <span className="ml-2 text-gray-400 font-normal">({tabItems.length})</span>
                </h2>
              </div>

              {tabItems.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-sm text-gray-400 mb-3">No {TABS.find(t => t.key === activeTab)?.label.toLowerCase()} yet</p>
                  <button onClick={openCreate} className="btn-primary text-xs">+ Add one now</button>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <SortableTh label="Name" col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide" />
                      <SortableTh label="Supplier" col="supplier" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell" />
                      <SortableTh label={activeTab === "ingredient" ? "Price / kg" : "Price / unit"} col="price" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell" />
                      <SortableTh label={activeTab === "supplies" ? "COSHH" : "Spec Sheet"} col="doc" align="center" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell" />
                      <SortableTh label="In stock" col="stock" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide" />
                      <th className="px-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tabItems.map(ing => {
                      const totalRemaining = ing.lots.reduce((s, l) => s + l.quantity_remaining_g, 0);
                      const totalReserved = ing.lots.reduce((s, l) => s + (reservedByLot[l.id] ?? 0), 0);
                      const isOpen = expanded[ing.id];
                      const hasStock = totalRemaining > 0;
                      const noLots = ing.lots.length === 0;
                      // Depleted lots are historic goods-in — the batch breakdown
                      // shows available (has-stock) lots only.
                      const availableLots = ing.lots.filter(l => l.quantity_remaining_g > 0);
                      const noAvailableLots = availableLots.length === 0;
                      const unit = ing.unit ?? "g";
                      const value = ing.price_per_kg != null
                        ? (unit === "units" ? totalRemaining : totalRemaining / 1000) * ing.price_per_kg
                        : null;

                      return (
                        <React.Fragment key={ing.id}>
                          <tr className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-start gap-1.5">
                              {noAvailableLots ? (
                                <span className="shrink-0 p-0.5 -ml-0.5" aria-hidden="true"><span className="block h-4 w-4" /></span>
                              ) : (
                                <button
                                  onClick={() => setExpanded(p => ({ ...p, [ing.id]: !p[ing.id] }))}
                                  aria-label={isOpen ? "Hide lots" : "Show lots"}
                                  aria-expanded={isOpen}
                                  className="shrink-0 text-gray-400 hover:text-brown p-0.5 -ml-0.5 mt-0.5"
                                >
                                  <svg
                                    className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
                                    viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
                                  >
                                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              )}
                              <div>
                              <p className="font-medium text-gray-900">
                                {ing.name}
                                {ing.type === "packaging" && ing.is_primary_packaging && (
                                  <span className="ml-2 align-middle text-[10px] px-1.5 py-0.5 rounded-full bg-brand/30 text-brown font-semibold">Primary</span>
                                )}
                              </p>
                              {ing.allergens && ing.allergens.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                  {ing.allergens.map(a => (
                                    <span key={a} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                                      {a}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {ing.may_contain_allergens && ing.may_contain_allergens.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1 mt-1">
                                  <span className="text-[10px] text-gray-400 font-medium">May contain:</span>
                                  {ing.may_contain_allergens.map(a => (
                                    <span key={a} className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-300 text-amber-700 font-medium">
                                      {a}
                                    </span>
                                  ))}
                                </div>
                              )}
                              </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              {ing.supplier?.name
                                ? <span className="text-gray-600">{ing.supplier.name}</span>
                                : <span className="text-amber-500 text-xs">Not set</span>}
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              {ing.price_per_kg != null
                                ? <span className="text-gray-600">£{ing.price_per_kg.toFixed(2)}</span>
                                : <span className="text-amber-500 text-xs">Not set</span>}
                            </td>
                            <td className="px-4 py-3 text-center hidden sm:table-cell">
                              {hasDoc.has(ing.id) ? (
                                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-green-100">
                                  <svg className="h-3 w-3 text-green-600" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M2 6l3 3 5-5" />
                                  </svg>
                                </span>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                              {activeTab !== "supplies" && <SpecReviewBadge dateStr={ing.spec_sheet_next_review_due} />}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {noLots ? (
                                <span className="text-gray-300">—</span>
                              ) : (
                                <div>
                                  <p className={`font-semibold tabular-nums ${!hasStock ? "text-red-600" : "text-gray-900"}`}>
                                    {fmtQty(totalRemaining, unit)}
                                  </p>
                                  {totalReserved > 0 && (
                                    <p className="text-xs text-amber-600 font-medium whitespace-nowrap" title="Allocated to in-progress batch records — deducted when the batch is submitted">
                                      {fmtQty(totalReserved, unit)} in production
                                    </p>
                                  )}
                                  {value != null && (
                                    <p className="text-xs text-brown font-medium">
                                      £{value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-3">
                              <div className="flex items-center justify-end gap-3 pr-2">
                                <button onClick={() => openEdit(ing)} className="text-xs text-brown/60 hover:text-brown hover:underline">Details</button>
                                {!noLots && (
                                  <button onClick={() => openReconcilePanel(ing)} className="text-xs text-brown/60 hover:text-brown hover:underline">Reconcile</button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {isOpen && !noAvailableLots && (
                            <tr key={`${ing.id}-lots`}>
                              <td colSpan={6} className="bg-gray-50 border-t border-gray-100 px-4 py-3">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-500">
                                      <th className="text-left py-1 font-medium">Batch / ref</th>
                                      <th className="text-right py-1 font-medium hidden sm:table-cell">Received</th>
                                      <th className="text-right py-1 font-medium">Remaining</th>
                                      <th className="text-right py-1 font-medium" title="Allocated to in-progress batch records — deducted when the batch is submitted">In production</th>
                                      <th className="text-right py-1 font-medium" title="Remaining minus in production — what should physically be on the shelf">On shelf</th>
                                      <th className="text-left py-1 font-medium pl-4 hidden sm:table-cell">Date in</th>
                                      <th className="text-left py-1 font-medium hidden sm:table-cell">Supplier</th>
                                      <th className="text-left py-1 font-medium hidden sm:table-cell">Best before</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {availableLots.map(lot => {
                                      const lotReserved = reservedByLot[lot.id] ?? 0;
                                      return (
                                      <tr key={lot.id}>
                                        <td className="py-1.5 font-mono font-semibold text-gray-900">{lot.julian_code}</td>
                                        <td className="py-1.5 text-right tabular-nums text-gray-600 hidden sm:table-cell">{fmtQty(lot.quantity_received_g, unit)}</td>
                                        <td className="py-1.5 text-right tabular-nums font-semibold text-gray-900">{fmtQty(lot.quantity_remaining_g, unit)}</td>
                                        <td className={`py-1.5 text-right tabular-nums ${lotReserved > 0 ? "text-amber-600 font-medium" : "text-gray-300"}`}>
                                          {lotReserved > 0 ? fmtQty(lotReserved, unit) : "—"}
                                        </td>
                                        <td className="py-1.5 text-right tabular-nums font-semibold text-gray-700">
                                          {fmtQty(Math.max(0, lot.quantity_remaining_g - lotReserved), unit)}
                                        </td>
                                        <td className="py-1.5 pl-4 text-gray-500 hidden sm:table-cell">{formatDate(lot.received_date)}</td>
                                        <td className="py-1.5 text-gray-500 hidden sm:table-cell">{lot.supplier ?? "—"}</td>
                                        <td className="py-1.5 text-gray-500 hidden sm:table-cell">{lot.best_before_date ? formatDate(lot.best_before_date) : "—"}</td>
                                      </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
        </main>

      {/* Reconcile panel — opened per item, lot picked inside */}
      {reconIng && (() => {
        const ing = reconIng;
        const unit = ing.unit ?? "g";
        const unitLabel = unit === "units" ? "units" : "kg";
        const lot = reconLot?.lot ?? null;
        const reserved = reconLot?.reserved ?? 0;
        const onShelfG = lot ? Math.max(0, lot.quantity_remaining_g - reserved) : 0;
        const onShelfDisplay = fmtQty(onShelfG, unit);
        const isVariance = reconMode === "variance";
        const newRemainingG = !lot || isVariance ? null : reconNewRemainingG(lot, unit, reserved);
        // For display: on-shelf figure after the adjustment
        const newOnShelfG = newRemainingG !== null ? newRemainingG - reserved : null;
        const writtenOff = newRemainingG !== null ? onShelfG - (newRemainingG - reserved) : null;
        const overRemove = newRemainingG !== null && newRemainingG < reserved;
        // Offer the variance mode only when the lot genuinely has a mass-balance gap
        const varianceTolerance = unit === "units" ? 0.5 : 5;
        const hasVariance = reconUnaccounted !== null && reconUnaccounted > varianceTolerance;
        const typedVarianceG = isVariance && reconInput !== "" && !isNaN(parseFloat(reconInput))
          ? (unit === "units" ? Math.round(parseFloat(reconInput)) : Math.round(parseFloat(reconInput) * 1000))
          : null;
        const overVariance = isVariance && typedVarianceG !== null && reconUnaccounted !== null && typedVarianceG > reconUnaccounted + varianceTolerance;

        return (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={closeReconcile} />
            <div className="w-full max-w-sm bg-white shadow-xl flex flex-col">
              <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Reconcile Stock</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{ing.name}{lot ? ` · ${lot.julian_code}` : ""}</p>
                </div>
                <button onClick={closeReconcile} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Lot picker. Available lots only by default; depleted lots are
                    historic goods-in, revealed by the toggle so a variance can
                    still be explained (that workflow lives on depleted lots). */}
                {(() => {
                  const depletedCount = ing.lots.filter(l => l.quantity_remaining_g <= 0).length;
                  const pickerLots = reconShowDepleted
                    ? ing.lots
                    : ing.lots.filter(l => l.quantity_remaining_g > 0);
                  return (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-700">Batch / lot</label>
                    {depletedCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setReconShowDepleted(v => !v)}
                        className="text-xs text-brown/60 hover:text-brown hover:underline"
                      >
                        {reconShowDepleted ? "Hide depleted" : `Show depleted (${depletedCount})`}
                      </button>
                    )}
                  </div>
                  <select
                    className="input w-full"
                    value={lot?.id ?? ""}
                    onChange={e => {
                      const picked = ing.lots.find(l => l.id === e.target.value);
                      if (picked) selectReconLot(picked, ing);
                    }}
                  >
                    <option value="" disabled>Select a lot…</option>
                    {pickerLots.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.julian_code} · {fmtQty(l.quantity_remaining_g, unit)} left · {formatDate(l.received_date)}
                      </option>
                    ))}
                  </select>
                </div>
                  );
                })()}

                {lot && (<>
                {/* Current stock info */}
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 space-y-1">
                  <p className="text-xs text-amber-700 font-medium">On shelf (available to count)</p>
                  <p className="text-2xl font-bold text-amber-900">{onShelfDisplay}</p>
                  {reserved > 0 && (
                    <p className="text-xs text-amber-600">
                      + {fmtQty(reserved, unit)} in production — not reconcilable until batch is submitted
                    </p>
                  )}
                </div>

                {/* Unaccounted banner — offers to close a historical mass-balance gap */}
                {hasVariance && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 space-y-2">
                    <p className="text-xs text-red-700 font-medium">
                      {fmtQty(reconUnaccounted!, unit)} of this lot is missing from the records
                    </p>
                    {reconBalance && (
                      <div className="text-xs text-red-800 space-y-0.5">
                        <div className="flex justify-between"><span>Received</span><span className="tabular-nums">{fmtQty(lot.quantity_received_g, unit)}</span></div>
                        <div className="flex justify-between"><span>Used in production</span><span className="tabular-nums">− {fmtQty(reconBalance.used, unit)}</span></div>
                        <div className="flex justify-between"><span>Written off</span><span className="tabular-nums">− {fmtQty(reconBalance.writtenOff, unit)}</span></div>
                        <div className="flex justify-between"><span>Still in stock</span><span className="tabular-nums">− {fmtQty(lot.quantity_remaining_g, unit)}</span></div>
                        <div className="flex justify-between border-t border-red-200 pt-1 font-bold text-red-900"><span>Not recorded anywhere</span><span className="tabular-nums">{fmtQty(reconUnaccounted!, unit)}</span></div>
                      </div>
                    )}
                    <p className="text-xs text-red-600">
                      This amount was used up at some point without being logged — usually prep waste
                      (peeling, trimming) from before wastage logging existed. Choose &ldquo;Explain variance&rdquo;
                      to record it, so this lot&apos;s history adds up in traces and mock recalls.
                    </p>
                  </div>
                )}

                {/* Mode toggle — write off an amount, record a counted total, or explain a gap */}
                <div className={`grid gap-1 p-1 rounded-lg bg-gray-100 ${hasVariance ? "grid-cols-3" : "grid-cols-2"}`}>
                  {([
                    { key: "remove", label: "Write off amount" },
                    { key: "count",  label: "Counted stock" },
                    ...(hasVariance ? [{ key: "variance", label: "Explain variance" }] : []),
                  ] as { key: "remove" | "count" | "variance"; label: string }[]).map(m => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => {
                        setReconMode(m.key);
                        // Pre-fill the whole gap — that's almost always what's being explained
                        setReconInput(m.key === "variance" && reconUnaccounted !== null
                          ? (unit === "units" ? String(Math.round(reconUnaccounted)) : (reconUnaccounted / 1000).toFixed(3))
                          : "");
                      }}
                      className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${
                        reconMode === m.key ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Amount input */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {reconMode === "remove"
                      ? `Amount to write off (${unitLabel})`
                      : reconMode === "count"
                      ? `Amount counted on shelf (${unitLabel})`
                      : `Unaccounted amount to explain (${unitLabel})`}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step={unit === "units" ? "1" : "0.001"}
                      min="0"
                      className="input flex-1"
                      placeholder={unit === "units" ? "0" : "0.000"}
                      value={reconInput}
                      onChange={e => setReconInput(e.target.value)}
                    />
                    {!isVariance && (
                      <button
                        type="button"
                        onClick={() => {
                          // "Write off all" → writes off all on-shelf stock (in-production is untouched)
                          const allOnShelf = unit === "units" ? String(onShelfG) : (onShelfG / 1000).toString();
                          setReconInput(reconMode === "remove" ? allOnShelf : "0");
                        }}
                        className="text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                      >
                        Write off all
                      </button>
                    )}
                  </div>

                  {/* Live preview */}
                  {isVariance ? (
                    overVariance ? (
                      <p className="mt-2 text-xs text-red-600">
                        Only {fmtQty(Math.max(0, reconUnaccounted ?? 0), unit)} is unaccounted for on this lot.
                      </p>
                    ) : typedVarianceG !== null && (
                      <p className="mt-2 text-xs text-gray-600">
                        <span className="font-semibold text-gray-800">{fmtQty(typedVarianceG, unit)}</span> will be logged as a historical write-off ·
                        {" "}stock remaining stays <span className="font-semibold text-gray-800">{fmtQty(lot.quantity_remaining_g, unit)}</span>
                      </p>
                    )
                  ) : overRemove ? (
                    <p className="mt-2 text-xs text-red-600">
                      That&apos;s more than the {onShelfDisplay} currently on shelf.
                    </p>
                  ) : writtenOff !== null && newOnShelfG !== null && (
                    <p className="mt-2 text-xs text-gray-600">
                      <span className="font-semibold text-gray-800">{fmtQty(writtenOff, unit)}</span> written off ·
                      {" "}<span className="font-semibold text-gray-800">{fmtQty(newOnShelfG, unit)}</span> on shelf after
                    </p>
                  )}
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
                  <select
                    className="input w-full"
                    value={reconReason}
                    onChange={e => setReconReason(e.target.value)}
                  >
                    <option value="wastage">Wastage (prep, trim, yield loss)</option>
                    <option value="damaged">Damaged / contaminated</option>
                    <option value="expired">Expired / best before passed</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
                  <textarea
                    className="input w-full"
                    rows={2}
                    placeholder="e.g. Shallots peeled for batch B240520"
                    value={reconNotes}
                    onChange={e => setReconNotes(e.target.value)}
                  />
                </div>
                </>)}
              </div>

              {reconError && (
                <div className="mx-6 mb-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  {reconError}
                </div>
              )}

              <div className="border-t border-gray-200 px-6 pt-3 pb-3">
                <div className="flex gap-3">
                  <button onClick={closeReconcile} className="btn-ghost flex-1">Cancel</button>
                  <SaveButton
                    onClick={saveReconcile}
                    saving={reconSaving}
                    disabled={!lot || reconInput === "" || overRemove || overVariance}
                    className="btn-primary flex-1"
                  >
                    {isVariance ? "Log variance" : "Save reconciliation"}
                  </SaveButton>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit / create panel */}
      {editing && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/30" onClick={() => setEditing(null)} />
          <div className="w-full max-w-sm bg-white shadow-xl flex flex-col">
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                {isNew ? `New ${TABS.find(t => t.key === editType)?.label.replace(/s$/, "").toLowerCase()}` : editing.name}
              </h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {isNew && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    data-tour="ingredient-name"
                    type="text"
                    className="input w-full"
                    placeholder="e.g. Garlic"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Supplier</label>
                <select data-tour="ingredient-supplier" className="input w-full" value={editSupplier} onChange={e => setEditSupplier(e.target.value)}>
                  <option value="">— None —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{priceLabel}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">£</span>
                  <input
                    data-tour="ingredient-price"
                    type="number" step="0.01" min="0"
                    className="input w-full pl-7" placeholder="0.00"
                    value={editPrice} onChange={e => setEditPrice(e.target.value)}
                  />
                </div>
                {editPrice && !isNew && editing.lots.length > 0 && (
                  <p className="mt-1.5 text-xs text-gray-500">
                    Stock value:{" "}
                    <span className="font-semibold text-brown">
                      £{(() => {
                        const qty = editing.lots.reduce((s, l) => s + l.quantity_remaining_g, 0);
                        return ((editUnit === "units" ? qty : qty / 1000) * parseFloat(editPrice))
                          .toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      })()}
                    </span>
                  </p>
                )}
              </div>

              {editType === "packaging" && (
                <div className="rounded-lg border border-gray-200 p-3">
                  <button
                    type="button"
                    onClick={() => setEditIsPrimary(p => !p)}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <span className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition ${editIsPrimary ? "bg-brand justify-end" : "bg-gray-200 justify-start"}`}>
                      <span className="h-4 w-4 rounded-full bg-white shadow" />
                    </span>
                    <span className="text-xs font-medium text-gray-800">Primary packaging — traced &amp; deducted from stock</span>
                  </button>
                </div>
              )}

              {editType === "ingredient" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Density (g per litre)</label>
                  <input
                    data-tour="ingredient-density"
                    type="number" step="0.1" min="0"
                    className="input w-full" placeholder="e.g. 917 for oil"
                    value={editDensity} onChange={e => setEditDensity(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-gray-400">Set for liquids so Goods In can accept litres</p>
                </div>
              )}

              {/* Spec sheet — upload + AI read, above the allergen & nutrition
                  fields it fills. Only shown once the item exists (upload needs
                  an id); the Read button is ingredient-only. */}
              {!isNew && editing && editing.id && (
                <div className="space-y-2">
                  <DocUploader
                    entityType={editType === "supplies" ? "supply" : editType === "packaging" ? "packaging" : "ingredient"}
                    entityId={editing.id}
                    orgId={orgId}
                    docType={editType === "supplies" ? "coshh" : "spec_sheet"}
                    label={editType === "supplies" ? "COSHH Sheet" : "Spec Sheet"}
                    onCountChange={setSpecDocCount}
                  />
                  {editType === "ingredient" && specDocCount > 0 && (
                    <button
                      type="button"
                      onClick={extractFromSpecSheet}
                      disabled={extracting}
                      className="w-full rounded-lg border border-brand bg-brand/10 px-3 py-2 text-xs font-medium text-brown hover:bg-brand/20 transition disabled:opacity-60"
                    >
                      {extracting ? "Reading spec sheet…" : "Read allergens & nutrition from the spec sheet"}
                    </button>
                  )}
                  {editType === "ingredient" && extractError && (
                    <p className="rounded bg-red-50 border border-red-200 px-2.5 py-1.5 text-[11px] text-red-700">{extractError}</p>
                  )}
                  {editType === "ingredient" && extractNotes.length > 0 && (
                    <div className="rounded bg-amber-50 border border-amber-200 px-2.5 py-1.5 space-y-0.5">
                      {extractNotes.map((n, i) => (
                        <p key={i} className="text-[11px] text-amber-800">{n}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {editType === "ingredient" && (
                <div data-tour="ingredient-allergens">
                  <label className="block text-xs font-medium text-gray-700 mb-2">Allergens (contains)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALLERGENS.map(allergen => {
                      const selected = editAllergens.includes(allergen);
                      return (
                        <button
                          key={allergen}
                          type="button"
                          onClick={() => setEditAllergens(prev =>
                            prev.includes(allergen)
                              ? prev.filter(a => a !== allergen)
                              : [...prev, allergen]
                          )}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            selected
                              ? "bg-amber-100 border-amber-400 text-amber-800 font-medium"
                              : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                          }`}
                        >
                          {allergen}
                        </button>
                      );
                    })}
                  </div>
                  {editAllergens.length === 0 && (
                    <p className="mt-1.5 text-xs text-gray-400">Tap allergens present in this ingredient</p>
                  )}
                </div>
              )}

              {editType === "ingredient" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">May contain (as stated on packaging)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALLERGENS.map(allergen => {
                      const selected = editMayContain.includes(allergen);
                      return (
                        <button
                          key={allergen}
                          type="button"
                          onClick={() => setEditMayContain(prev =>
                            prev.includes(allergen)
                              ? prev.filter(a => a !== allergen)
                              : [...prev, allergen]
                          )}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            selected
                              ? "bg-white border-amber-400 text-amber-700 font-medium"
                              : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                          }`}
                        >
                          {allergen}
                        </button>
                      );
                    })}
                  </div>
                  {editMayContain.length === 0 && (
                    <p className="mt-1.5 text-xs text-gray-400">Cross-contamination warnings from the supplier&apos;s label</p>
                  )}
                </div>
              )}

              {editType === "ingredient" && (() => {
                const anyValue = NUTRITION_FIELDS.some(f => (editNutrition[f.key] ?? "").trim() !== "");
                const fmtN = (v: number | null) => (v == null ? "—" : String(v));
                return (
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nutrition (per 100g)</p>
                    {anyValue && editNutritionSource ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">
                        {NUTRITION_SOURCE_LABELS[editNutritionSource]}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">Not set</span>
                    )}
                  </div>

                  {/* CoFID search — pick a match, preview per-100g values, confirm.
                      Spec-sheet reading lives in the Spec Sheet section above. */}
                  <div className="relative">
                    <input
                      type="text"
                      className="input w-full"
                      placeholder="Search CoFID (UK food database)…"
                      value={cofidQuery}
                      onChange={e => runCofidSearch(e.target.value)}
                    />
                    {cofidResults.length > 0 && !cofidPreview && (
                      <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg divide-y divide-gray-50">
                        {cofidResults.map(f => (
                          <li key={f.code}>
                            <button
                              type="button"
                              onClick={() => setCofidPreview(f)}
                              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-brand/10"
                            >
                              {f.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {cofidPreview && (
                    <div className="mt-2 rounded-lg border border-brand bg-brand-cream px-3 py-2.5">
                      <p className="text-xs font-semibold text-brown">{cofidPreview.name}</p>
                      <div className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-1 text-[11px] text-gray-700">
                        <span>Energy {fmtN(cofidPreview.kcal)} kcal</span>
                        <span>Fat {fmtN(cofidPreview.fat)}</span>
                        <span>Saturates {fmtN(cofidPreview.saturates)}</span>
                        <span>Carbs {fmtN(cofidPreview.carbohydrate)}</span>
                        <span>Sugars {fmtN(cofidPreview.sugars)}</span>
                        <span>Fibre {fmtN(cofidPreview.fibre)}</span>
                        <span>Protein {fmtN(cofidPreview.protein)}</span>
                        <span>Salt {fmtN(cofidPreview.salt)}</span>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => applyCofid(cofidPreview)} className="btn-primary text-xs px-3 py-1.5">
                          Use these values
                        </button>
                        <button type="button" onClick={() => setCofidPreview(null)} className="btn-ghost text-xs px-3 py-1.5">
                          Back
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {NUTRITION_FIELDS.map(f => (
                      <div key={f.key}>
                        <label className="block text-[10px] font-medium text-gray-500 mb-0.5 leading-tight">{f.label}</label>
                        <input
                          type="number" step="0.1" min="0"
                          className="input w-full"
                          value={editNutrition[f.key] ?? ""}
                          onChange={e => setNutritionField(f.key, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>

                  {anyValue && (
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Source</label>
                        <select
                          className="input w-full"
                          value={editNutritionSource}
                          onChange={e => { setEditNutritionSource(e.target.value as typeof editNutritionSource); setNutritionDirty(true); }}
                        >
                          <option value="spec_sheet">Supplier spec sheet</option>
                          <option value="cofid">CoFID (UK food database)</option>
                          <option value="manual">Manual / other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Basis</label>
                        <select
                          className="input w-full"
                          value={editNutritionBasis}
                          onChange={e => { setEditNutritionBasis(e.target.value as typeof editNutritionBasis); setNutritionDirty(true); }}
                        >
                          <option value="per_100g">Per 100g</option>
                          <option value="per_100ml">Per 100ml (liquid)</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
                );
              })()}

              {editType !== "supplies" && (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Spec Sheet Review</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Review frequency</label>
                      <select className="input w-full" value={editSpecReviewFreq} onChange={e => setEditSpecReviewFreq(e.target.value)}>
                        <option value="">— Select —</option>
                        <option value="1">Every year</option>
                        <option value="2">Every 2 years</option>
                        <option value="3">Every 3 years</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Next review due</label>
                      <input className="input w-full" type="date" value={editSpecReviewDue} onChange={e => setEditSpecReviewDue(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {saveError && (
              <div className="mx-6 mb-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {saveError}
              </div>
            )}

            <div className="border-t border-gray-200 px-6 pt-3 pb-3">
              {!isNew && (
                deleteConfirm ? (
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs text-red-600 flex-1">Delete {editing.name}?</span>
                    <button onClick={deleteItem} className="text-xs text-red-600 font-semibold hover:underline">Yes, delete</button>
                    <button onClick={() => setDeleteConfirm(false)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteConfirm(true)} className="text-xs text-red-400 hover:text-red-600 mb-3 block">
                    Delete item
                  </button>
                )
              )}
              <div className="flex gap-3">
                <button onClick={() => setEditing(null)} className="btn-ghost flex-1">Cancel</button>
                <SaveButton data-tour="ingredient-save" onClick={saveEdit} saving={saving} className="btn-primary flex-1">
                  {isNew ? "Create" : "Save"}
                </SaveButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
