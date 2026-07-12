"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { fetchAll } from "@/lib/fetchAll";
import { useOrganisation } from "@/contexts/OrganisationContext";
import type { NutritionPer100g } from "@/lib/types";
import { normaliseName, type RecipeRow, type IngredientData } from "@/lib/nutrition/recipe-calc";

/** Saved per-product calc inputs, as editable strings. */
export interface LoadedSettings {
  id: string | null;
  netWeight: string;
  unitsPerBatch: string;
  prepYields: Record<string, string>; // normalised name → percent string
}

export interface ProductNutritionData {
  loading: boolean;
  error: string;
  recipeFound: boolean;
  recipe: RecipeRow[];
  ingredients: Map<string, IngredientData>;
  /** Primary packaging mapped on the packing_runs question (for costing). */
  packaging: { jar: string | null; closure: string | null };
  settings: LoadedSettings;
  orgId: string | null;
  reload: () => Promise<void>;
}

const EMPTY_SETTINGS: LoadedSettings = { id: null, netWeight: "", unitsPerBatch: "", prepYields: {} };

/** Parse the production checklist recipe ("Name|grams") into rows. */
function parseRecipe(options: string[] | null): RecipeRow[] {
  return (options ?? [])
    .map((o) => {
      const [name, grams] = String(o).split("|");
      return { name: (name ?? "").trim(), grams: Number(grams) || 0 };
    })
    .filter((r) => r.name);
}

/**
 * Loads everything the recipe→label calc needs for one product: the production
 * checklist recipe definition, the org's raw materials (keyed by exact name)
 * and the saved calc settings. Shared by the Recipe & yields and Declarations
 * tabs so each loads independently.
 */
export function useProductNutrition(productName: string): ProductNutritionData {
  const { orgId } = useOrganisation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recipeFound, setRecipeFound] = useState(false);
  const [recipe, setRecipe] = useState<RecipeRow[]>([]);
  const [ingredients, setIngredients] = useState<Map<string, IngredientData>>(new Map());
  const [packaging, setPackaging] = useState<{ jar: string | null; closure: string | null }>({ jar: null, closure: null });
  const [settings, setSettings] = useState<LoadedSettings>(EMPTY_SETTINGS);

  const reload = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError("");
    try {
      // Recipe: the product's Production checklist ingredient_table definition,
      // plus the packing_runs hint (primary packaging mapping, for costing).
      const { data: checklists } = await supabase
        .from("checklists")
        .select("name, questions(type, options, hint)")
        .eq("organisation_id", orgId)
        .eq("category", "Production");

      const target = normaliseName(productName);
      let rows: RecipeRow[] = [];
      let pkg: { jar: string | null; closure: string | null } = { jar: null, closure: null };
      let found = false;
      for (const cl of (checklists ?? []) as { name: string; questions: { type: string; options: string[] | null; hint: string | null }[] }[]) {
        const clProduct = normaliseName(cl.name.replace(/\s*[—–-]+\s*Production Record\s*$/i, ""));
        if (clProduct !== target) continue;
        found = true;
        const q = (cl.questions ?? []).find((x) => x.type === "ingredient_table");
        if (q) rows = parseRecipe(q.options);
        const pack = (cl.questions ?? []).find((x) => x.type === "packing_runs");
        if (pack?.hint) {
          try {
            const h = JSON.parse(pack.hint) as { jar_ingredient?: string; closure_ingredient?: string };
            pkg = { jar: h.jar_ingredient?.trim() || null, closure: h.closure_ingredient?.trim() || null };
          } catch { /* ignore malformed hint */ }
        }
        break;
      }
      setRecipe(rows);
      setPackaging(pkg);
      setRecipeFound(found);

      // Raw materials, keyed by exact (normalised) name.
      const ings = await fetchAll<{
        name: string;
        unit: "g" | "units";
        price_per_kg: number | null;
        nutrition_per_100g: NutritionPer100g | null;
        nutrition_basis: "per_100g" | "per_100ml" | null;
        density_g_per_l: number | null;
        allergens: string[] | null;
        may_contain_allergens: string[] | null;
      }>((from, to) => supabase
        .from("ingredients")
        .select("name, unit, price_per_kg, nutrition_per_100g, nutrition_basis, density_g_per_l, allergens, may_contain_allergens")
        .eq("organisation_id", orgId)
        .order("name")
        .range(from, to));

      const map = new Map<string, IngredientData>();
      for (const i of ings) {
        map.set(normaliseName(i.name), {
          nutrition: i.nutrition_per_100g,
          basis: i.nutrition_basis ?? "per_100g",
          densityGPerL: i.density_g_per_l,
          allergens: i.allergens ?? [],
          mayContain: i.may_contain_allergens ?? [],
          pricePerKg: i.price_per_kg,
          unit: i.unit ?? "g",
        });
      }
      setIngredients(map);

      // Saved settings for this product.
      const esc = productName.replace(/([%_\\])/g, "\\$1");
      const { data: ps } = await supabase
        .from("product_nutrition_settings")
        .select("id, net_weight_per_unit_g, units_per_batch, prep_yields")
        .eq("organisation_id", orgId)
        .ilike("product_name", esc)
        .maybeSingle();

      if (ps) {
        const yields: Record<string, string> = {};
        for (const [k, v] of Object.entries((ps.prep_yields ?? {}) as Record<string, number>)) {
          yields[normaliseName(k)] = String(Math.round((Number(v) || 1) * 100));
        }
        setSettings({
          id: ps.id,
          netWeight: ps.net_weight_per_unit_g != null ? String(ps.net_weight_per_unit_g) : "",
          unitsPerBatch: ps.units_per_batch != null ? String(ps.units_per_batch) : "",
          prepYields: yields,
        });
      } else {
        setSettings(EMPTY_SETTINGS);
      }
    } catch {
      setError("Couldn't load the recipe data.");
    } finally {
      setLoading(false);
    }
  }, [orgId, productName]);

  useEffect(() => { reload(); }, [reload]);

  return { loading, error, recipeFound, recipe, ingredients, packaging, settings, orgId, reload };
}
