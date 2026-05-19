import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { basename } from "path";

const SUPABASE_URL = "https://dudchdacsrgdnenkqmyo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1ZGNoZGFjc3JnZG5lbmtxbXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDQ1NTUsImV4cCI6MjA5NDE4MDU1NX0.J94RDCFVm_bQ_VTY0B1TBiTdJ_QcbwKl01dYY4zGrBM";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BASE = "/Users/thomaspalmer/Downloads/SALSA_extracted/SALSA/Section 1 Pre-requisites";
const SUPPLIERS = `${BASE}/1.6 Control of Suppliers and Raw Materials/Suppliers`;
const COSHH_DIR = `${BASE}/1.3 Cleaning/COSHH`;

// ── Entity IDs (from database) ─────────────────────────────────────────────
const SUPPLIER_IDS = {
  "AA Produce":                "4849e1d8-f67e-49b8-8fa7-2e0eb6488ee6",
  "Challenge Packaging":       "93d4b353-3911-45c1-abf5-0bfd2d0a2a35",
  "Foodnet":                   "a610a666-ed15-4ff9-8da1-fa6cac57e1b2",
  "Glassworks International":  "a0746a67-f2e0-4914-8130-e94f3ab79593",
  "Hill Farm":                 "52e41c52-8c38-43cc-b6da-489a632c5a58",
  "Nutricraft":                "26635441-981b-49ad-b771-60791e9a3ed1",
  "Sichuan Hein Food Co":      "0b5b6e0e-f137-4105-96fc-1c168fb382d9",
  "The Bottle Company":        "78f72383-ced9-4dbe-a983-3e4acfbec12b",
  "The Chilli Doctor":         "63bf1234-5950-4c60-9620-8bcc1b9a4f6c",
  "Wanahong":                  "d5bbf46f-3bac-46e3-8c88-b913621a685d",
};

const INGREDIENT_IDS = {
  "Garlic":                          "d80430fb-6f17-44b2-9d30-97a9c93d845c",
  "Ginger":                          "0f1338e4-883f-4165-ae84-769b6ecaa61a",
  "Shallots":                        "cc10b624-6308-4ee6-854d-f38bd01ef095",
  "Long red chilli":                 "822a0aa8-c763-47bf-b117-5e089a450748",
  "Erjingtiao chilli flakes":        "beb1f86a-0044-4eec-959e-223a8a913a3d",
  "Sichuan peppercorn powder":       "1eba8687-90f4-4301-b6a8-93c684386cef",
  "Naga chilli flakes":              "4faccea9-868d-4ff9-b251-900429f3c58e",
  "Organic Shiitake mushroom powder":"b1f53995-8eb4-431a-af10-9fb53cb171da",
  "Rice wine":                       "75cf079c-ac68-4ab6-8831-c4fd0b2706eb",
  "Doubanjiang":                     "805745d6-bea9-4888-9cfb-c241280ea0a9",
  "Light soy sauce":                 "1a74db1b-8f2f-447b-a359-6aca1ae7b670",
  "199ml glass jars":                "60411c9b-d354-4023-8ef6-574a8acb63ff",
  "Black button lids":               "f72750ed-f6c0-4c15-89e2-d02002075484",
};

// ── Upload map ─────────────────────────────────────────────────────────────
const UPLOADS = [
  // ── Supplier accreditation certs ──────────────────────────────────────
  { file: `${SUPPLIERS}/Raw materials/AA Produce/Certificate & tech docs/SALSA_AA Produce_Certificate_2025_2026.pdf`,
    entityType: "supplier", entityId: SUPPLIER_IDS["AA Produce"], docType: "accreditation" },

  { file: `${SUPPLIERS}/Raw materials/Foodnet/Certificate & tech docs/Foodnet_Ltd_BRC_Certificate_19_Aug_2026.pdf`,
    entityType: "supplier", entityId: SUPPLIER_IDS["Foodnet"], docType: "accreditation" },

  { file: `${SUPPLIERS}/Raw materials/Hill farm/Certificate & tech docs/0427_F_Hillfarm_Oils_Suffolk_June_2025_BRCGS_START__Cert_Iss_1.pdf`,
    entityType: "supplier", entityId: SUPPLIER_IDS["Hill Farm"], docType: "accreditation" },

  { file: `${SUPPLIERS}/Raw materials/Nutricraft/NUTRICRAFT_ORGANIC_CERT_JUNE_2025.pdf`,
    entityType: "supplier", entityId: SUPPLIER_IDS["Nutricraft"], docType: "accreditation" },

  { file: `${SUPPLIERS}/Raw materials/The Chilli Doctor/Certificate & tech docs/BRCGS_Certificate_The_Chilli_Doctor_2025.pdf`,
    entityType: "supplier", entityId: SUPPLIER_IDS["The Chilli Doctor"], docType: "accreditation" },

  { file: `${SUPPLIERS}/Raw materials/Wanahong - Oriental essentials/Certificate & tech docs/Wa Na Hong Oriental Supermarket _ Rating Business Details _ Food Hygiene Ratings.pdf`,
    entityType: "supplier", entityId: SUPPLIER_IDS["Wanahong"], docType: "accreditation" },

  { file: `${SUPPLIERS}/Packaging Materials/Challenge packaging/Certificate/ba3ec9547bfd-Challenge_BRCGS_Packaging_Certificate_2025.pdf`,
    entityType: "supplier", entityId: SUPPLIER_IDS["Challenge Packaging"], docType: "accreditation" },

  { file: `${SUPPLIERS}/Packaging Materials/Glassworks international/Certificate & tech docs/BRC.pdf`,
    entityType: "supplier", entityId: SUPPLIER_IDS["Glassworks International"], docType: "accreditation" },

  { file: `${SUPPLIERS}/Packaging Materials/The bottle company/Certificate & tech docs/Certificate FSSC MASSILY FRANCE.pdf`,
    entityType: "supplier", entityId: SUPPLIER_IDS["The Bottle Company"], docType: "accreditation" },

  { file: `${SUPPLIERS}/Packaging Materials/The bottle company/Certificate & tech docs/MASSILLY Certificat 9001 (Anglais) Renouvellement (1) (1).pdf`,
    entityType: "supplier", entityId: SUPPLIER_IDS["The Bottle Company"], docType: "accreditation" },

  { file: `${SUPPLIERS}/Packaging Materials/The bottle company/Certificate & tech docs/MASSILLY Certificat ISO 22000 (Anglais) Renouvellement.pdf`,
    entityType: "supplier", entityId: SUPPLIER_IDS["The Bottle Company"], docType: "accreditation" },

  { file: `${SUPPLIERS}/Packaging Materials/The bottle company/Certificate & tech docs/20231009 Metal ex Russia.pdf`,
    entityType: "supplier", entityId: SUPPLIER_IDS["The Bottle Company"], docType: "accreditation" },

  // ── Ingredient spec sheets ────────────────────────────────────────────
  { file: `${SUPPLIERS}/Raw materials/Foodnet/Specification/Garlic Diced 3-5mm_5358342936340516102.pdf`,
    entityType: "ingredient", entityId: INGREDIENT_IDS["Garlic"], docType: "spec_sheet" },

  { file: `${SUPPLIERS}/Raw materials/Foodnet/Specification/Ginger Diced 5mm_355392422284186891.pdf`,
    entityType: "ingredient", entityId: INGREDIENT_IDS["Ginger"], docType: "spec_sheet" },

  { file: `${SUPPLIERS}/Raw materials/Foodnet/Specification/Shallots Diced 4-6mm.pdf`,
    entityType: "ingredient", entityId: INGREDIENT_IDS["Shallots"], docType: "spec_sheet" },

  { file: `${SUPPLIERS}/Raw materials/Foodnet/Specification/Chilli Red Chopped 4-6mm.pdf`,
    entityType: "ingredient", entityId: INGREDIENT_IDS["Long red chilli"], docType: "spec_sheet" },

  { file: `${SUPPLIERS}/Raw materials/Sichuan Hein Food Co/Specification/Erjingtiao chillies_Product spec.pdf`,
    entityType: "ingredient", entityId: INGREDIENT_IDS["Erjingtiao chilli flakes"], docType: "spec_sheet" },

  { file: `${SUPPLIERS}/Raw materials/Sichuan Hein Food Co/Specification/Sichuan peppercorn_Product spec.pdf`,
    entityType: "ingredient", entityId: INGREDIENT_IDS["Sichuan peppercorn powder"], docType: "spec_sheet" },

  { file: `${SUPPLIERS}/Raw materials/The Chilli Doctor/Specification/NAGFL01 Bhut Jolokia Naga chilli flakes v15.pdf`,
    entityType: "ingredient", entityId: INGREDIENT_IDS["Naga chilli flakes"], docType: "spec_sheet" },

  { file: `${SUPPLIERS}/Raw materials/Nutricraft/Specification/NutriCraft TDS - Organic Shiitake Mushroom Powder.pdf`,
    entityType: "ingredient", entityId: INGREDIENT_IDS["Organic Shiitake mushroom powder"], docType: "spec_sheet" },

  { file: `${SUPPLIERS}/Raw materials/Wanahong - Oriental essentials/Specification/Erguotou Baijiu Rice Wine.pdf`,
    entityType: "ingredient", entityId: INGREDIENT_IDS["Rice wine"], docType: "spec_sheet" },

  { file: `${SUPPLIERS}/Raw materials/Wanahong - Oriental essentials/Specification/LKK Sichuan Style Toban Chilli Sauce 12X350g JAN 2026.pdf`,
    entityType: "ingredient", entityId: INGREDIENT_IDS["Doubanjiang"], docType: "spec_sheet" },

  { file: `${SUPPLIERS}/Raw materials/Wanahong - Oriental essentials/Specification/Wadakan Tokkyu Soy Sauce.pdf`,
    entityType: "ingredient", entityId: INGREDIENT_IDS["Light soy sauce"], docType: "spec_sheet" },

  { file: `${SUPPLIERS}/Packaging Materials/Glassworks international/Specification/6089T418-A - 20.6cl JAR LW.pdf`,
    entityType: "packaging", entityId: INGREDIENT_IDS["199ml glass jars"], docType: "spec_sheet" },

  { file: `${SUPPLIERS}/Packaging Materials/Glassworks international/Specification/STT99IMS001(en) Compliance Statement 9jan25.pdf`,
    entityType: "packaging", entityId: INGREDIENT_IDS["199ml glass jars"], docType: "spec_sheet" },

  { file: `${SUPPLIERS}/Packaging Materials/The bottle company/Specification/AA018501.pdf`,
    entityType: "packaging", entityId: INGREDIENT_IDS["Black button lids"], docType: "spec_sheet" },

  // ── COSHH sheets (supply items — created separately if needed) ────────
  { file: `${COSHH_DIR}/Jantex Concentrate Floor Maintainer.pdf`,
    entityType: "supply", entityId: null, docType: "coshh", supplyName: "Jantex Concentrate Floor Maintainer" },

  { file: `${COSHH_DIR}/Jantex Kitchen Degreaser.pdf`,
    entityType: "supply", entityId: null, docType: "coshh", supplyName: "Jantex Kitchen Degreaser" },

  { file: `${COSHH_DIR}/Jantex Multi Surface Sanitiser Cleaner.pdf`,
    entityType: "supply", entityId: null, docType: "coshh", supplyName: "Jantex Multi Surface Sanitiser Cleaner" },

  { file: `${COSHH_DIR}/Jantex Washing Up Liquid.pdf`,
    entityType: "supply", entityId: null, docType: "coshh", supplyName: "Jantex Washing Up Liquid" },
];

async function ensureSupply(name) {
  const { data } = await supabase
    .from("ingredients")
    .select("id")
    .eq("name", name)
    .eq("type", "supplies")
    .maybeSingle();
  if (data) return data.id;
  const { data: created } = await supabase
    .from("ingredients")
    .insert({ name, type: "supplies", unit: "units" })
    .select("id")
    .single();
  console.log(`  Created supply: ${name}`);
  return created.id;
}

async function uploadDoc({ file, entityType, entityId, docType, supplyName }) {
  if (!existsSync(file)) {
    console.log(`  ⚠ File not found: ${basename(file)}`);
    return;
  }

  // Resolve supply ID if needed
  let id = entityId;
  if (entityType === "supply" && supplyName) {
    id = await ensureSupply(supplyName);
  }
  if (!id) { console.log(`  ⚠ No entity ID for ${basename(file)}`); return; }

  const fileName = basename(file);
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${entityType}/${id}/${docType}/${Date.now()}_${safeName}`;

  const buffer = readFileSync(file);
  const { error: storageErr } = await supabase.storage
    .from("compliance-docs")
    .upload(path, buffer, { contentType: "application/pdf", upsert: false });

  if (storageErr) {
    console.log(`  ✗ Storage error for ${fileName}: ${storageErr.message}`);
    return;
  }

  const { error: dbErr } = await supabase.from("documents").insert({
    entity_type: entityType,
    entity_id: id,
    doc_type: docType,
    file_name: fileName,
    file_path: path,
  });

  if (dbErr) {
    console.log(`  ✗ DB error for ${fileName}: ${dbErr.message}`);
  } else {
    console.log(`  ✓ ${fileName}`);
  }
}

console.log(`Uploading ${UPLOADS.length} compliance documents…\n`);
for (const item of UPLOADS) {
  await uploadDoc(item);
}
console.log("\nDone.");
