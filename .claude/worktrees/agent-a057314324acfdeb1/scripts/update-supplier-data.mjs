import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://dudchdacsrgdnenkqmyo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1ZGNoZGFjc3JnZG5lbmtxbXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDQ1NTUsImV4cCI6MjA5NDE4MDU1NX0.J94RDCFVm_bQ_VTY0B1TBiTdJ_QcbwKl01dYY4zGrBM";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Known IDs from DB (from upload-compliance-docs.mjs)
const IDS = {
  "AA Produce":               "4849e1d8-f67e-49b8-8fa7-2e0eb6488ee6",
  "Challenge Packaging":      "93d4b353-3911-45c1-abf5-0bfd2d0a2a35",
  "Foodnet":                  "a610a666-ed15-4ff9-8da1-fa6cac57e1b2",
  "Glassworks International": "a0746a67-f2e0-4914-8130-e94f3ab79593",
  "Hill Farm":                "52e41c52-8c38-43cc-b6da-489a632c5a58",
  "Nutricraft":               "26635441-981b-49ad-b771-60791e9a3ed1",
  "Sichuan Hein Food Co":     "0b5b6e0e-f137-4105-96fc-1c168fb382d9",
  "The Bottle Company":       "78f72383-ced9-4dbe-a983-3e4acfbec12b",
  "The Chilli Doctor":        "63bf1234-5950-4c60-9620-8bcc1b9a4f6c",
  "Wanahong":                 "d5bbf46f-3bac-46e3-8c88-b913621a685d",
};

// ── Updates for existing suppliers ─────────────────────────────────────────
// Data sourced from MISC.1.6 - Supplier Approval Matrix.xlsx
// Last review date from spreadsheet: 2026-01-12
// Review due dates: 3yr → 2029-01-12, 2yr → 2028-01-12
// Packaging review due: 2029-12-23

const UPDATES = [
  // ── Raw Material Suppliers ─────────────────────────────────────────────
  {
    id: IDS["AA Produce"],
    contact_name: "Sudhakar Elangovan",
    contact_phone: "07799069563",
    contact_email: "sudhakar@aaproduce.co.uk",
    certification: "SALSA",
    cert_expiry: "2026-01-22",
    supplier_risk: "low",
    raw_material_risk: "medium",
    review_frequency_years: 3,
    next_review_due: "2029-01-12",
    saq_completed: true,
    status: "approved",
  },
  {
    id: IDS["Nutricraft"],
    contact_name: "Alex O'Connor",
    contact_phone: "07596833810",
    contact_email: "alex@nutricraft.co.uk",
    certification: "Other",         // Organic Food Federation
    cert_expiry: "2026-06-26",
    supplier_risk: "low",
    raw_material_risk: "medium",
    review_frequency_years: 3,
    next_review_due: "2029-01-12",
    saq_completed: true,
    status: "approved",
    notes: "Organic Food Federation certification",
  },
  {
    id: IDS["Wanahong"],
    contact_name: "Ki Lim",
    contact_phone: "07922821007",
    contact_email: "agic@wanahong.co.uk",
    certification: "Hygiene Rating",
    hygiene_rating: 5,
    cert_expiry: null,
    supplier_risk: "medium",
    raw_material_risk: "medium",
    review_frequency_years: 2,
    next_review_due: "2028-01-12",
    saq_completed: true,
    status: "approved",
  },
  {
    id: IDS["Sichuan Hein Food Co"],
    contact_name: "Cathy Mu",
    contact_phone: "+8618280445345",
    contact_email: "agrip1@scmiec.com",
    certification: "None",
    cert_expiry: null,
    supplier_risk: "medium",
    raw_material_risk: "low",
    review_frequency_years: 3,
    next_review_due: "2029-01-12",
    saq_completed: true,
    status: "approved",
  },
  {
    id: IDS["Foodnet"],
    contact_name: "Filipe Soares",
    contact_phone: "01494434600",
    contact_email: "filipe@foodnet.ltd.uk",
    certification: "BRCGS",
    cert_expiry: "2026-08-19",
    supplier_risk: "low",
    raw_material_risk: "medium",
    review_frequency_years: 3,
    next_review_due: "2029-01-12",
    saq_completed: true,
    status: "approved",
    notes: "BRCGS Agents & Brokers, Grade AA, Site code: 1481679",
  },
  {
    id: IDS["The Chilli Doctor"],
    contact_name: "Qaiser Qureshi",
    contact_phone: "07508405397",
    contact_email: "qaiser@barneswilliams.co.uk",
    certification: "BRCGS",
    cert_expiry: "2026-08-25",
    supplier_risk: "low",
    raw_material_risk: "medium",
    review_frequency_years: 3,
    next_review_due: "2029-01-12",
    saq_completed: true,
    status: "approved",
    notes: "BRCGS Food, Grade AA+, Site code: 1750906",
  },
  {
    id: IDS["Hill Farm"],
    contact_name: "Daniel Munson",
    contact_phone: "01986798660",
    contact_email: "production@hillfarmoils.com",
    certification: "BRCGS",
    cert_expiry: "2026-07-24",
    supplier_risk: "low",
    raw_material_risk: "low",
    review_frequency_years: 3,
    next_review_due: "2029-01-12",
    saq_completed: true,
    status: "approved",
    notes: "BRCGS Start, Site code: 4866145",
  },

  // ── Packaging Suppliers ────────────────────────────────────────────────
  {
    id: IDS["Challenge Packaging"],
    contact_name: "Sheila Lyons",
    contact_phone: "01825748828",
    contact_email: "sheila.lyons@challengepackaging.co.uk",
    certification: "BRCGS",
    cert_expiry: "2026-03-13",
    supplier_risk: "low",
    raw_material_risk: "low",
    review_frequency_years: 3,
    next_review_due: "2029-12-23",
    saq_completed: true,
    status: "approved",
    notes: "BRC Packaging, Grade AA, Site code: 6251607",
  },
  {
    id: IDS["The Bottle Company"],
    contact_name: "Sandra Watts",
    contact_phone: "01179869667",
    contact_email: "sandra@bottlecompanysouth.co.uk",
    certification: "None",
    cert_expiry: null,
    supplier_risk: "medium",
    raw_material_risk: "low",
    review_frequency_years: 3,
    next_review_due: "2029-12-23",
    saq_completed: true,
    status: "approved",
  },
  {
    id: IDS["Glassworks International"],
    contact_name: "Stuart Alexander",
    contact_phone: "07494450203",
    contact_email: "stuarta@glassworksinternational.com",
    certification: "BRCGS",
    cert_expiry: "2026-06-22",
    supplier_risk: "low",
    raw_material_risk: "low",
    review_frequency_years: 3,
    next_review_due: "2029-12-23",
    saq_completed: true,
    status: "approved",
    notes: "BRC Agents & Brokers, Grade AA, Site code: 10000949",
  },
];

// ── New service suppliers to insert ───────────────────────────────────────
const NEW_SERVICES = [
  {
    name: "Beacon Compliance",
    type: "service",
    supplies: "Technical Support",
    contact_name: "Katie Watkins-Young",
    contact_email: "Katie@beacon-compliance.co.uk",
    contact_phone: "07486 687747",
    certification: null,
    cert_expiry: null,
    saq_completed: false,
    supplier_risk: null,
    raw_material_risk: null,
    review_frequency_years: null,
    next_review_due: null,
    status: "approved",
    notes: null,
    hygiene_rating: null,
    saq_date: null,
  },
  {
    name: "Rapidkill Pest Control",
    type: "service",
    supplies: "Pest Control",
    contact_name: "Shahid",
    contact_email: "info@rapidkillpestcontrol.co.uk",
    contact_phone: "0208 001 0218",
    certification: null,
    cert_expiry: null,
    saq_completed: false,
    supplier_risk: null,
    raw_material_risk: null,
    review_frequency_years: null,
    next_review_due: null,
    status: "approved",
    notes: null,
    hygiene_rating: null,
    saq_date: null,
  },
  {
    name: "Better Waste Solutions",
    type: "service",
    supplies: "Waste Management",
    contact_name: "Better Waste Solutions",
    contact_email: "sales@betterwaste.co.uk",
    contact_phone: "0330 390 7540",
    certification: null,
    cert_expiry: null,
    saq_completed: false,
    supplier_risk: null,
    raw_material_risk: null,
    review_frequency_years: null,
    next_review_due: null,
    status: "approved",
    notes: "Also: csteam@betterwaste.co.uk",
    hygiene_rating: null,
    saq_date: null,
  },
  {
    name: "E2B Fulfilment",
    type: "service",
    supplies: "Fulfilment",
    contact_name: "Emily Snelling",
    contact_email: "emily.snelling@e2bfulfilment.com",
    contact_phone: "+44 7787 447618",
    certification: null,
    cert_expiry: null,
    saq_completed: false,
    supplier_risk: null,
    raw_material_risk: null,
    review_frequency_years: null,
    next_review_due: null,
    status: "approved",
    notes: null,
    hygiene_rating: null,
    saq_date: null,
  },
];

async function run() {
  // ── 1. Update existing suppliers ─────────────────────────────────────────
  console.log("Updating existing suppliers…\n");
  for (const { id, ...data } of UPDATES) {
    const { error } = await supabase.from("suppliers").update(data).eq("id", id);
    if (error) {
      console.log(`  ✗ ${id}: ${error.message}`);
    } else {
      console.log(`  ✓ Updated: ${Object.values(IDS).indexOf(id) >= 0 ? Object.keys(IDS)[Object.values(IDS).indexOf(id)] : id}`);
    }
  }

  // ── 2. Insert service suppliers (skip if already exists) ─────────────────
  console.log("\nInserting service suppliers…\n");
  for (const supplier of NEW_SERVICES) {
    const { data: existing } = await supabase
      .from("suppliers")
      .select("id")
      .eq("name", supplier.name)
      .maybeSingle();

    if (existing) {
      // Update instead of insert
      const { error } = await supabase.from("suppliers").update(supplier).eq("id", existing.id);
      if (error) {
        console.log(`  ✗ ${supplier.name}: ${error.message}`);
      } else {
        console.log(`  ✓ Updated (existing): ${supplier.name}`);
      }
    } else {
      const { error } = await supabase.from("suppliers").insert(supplier);
      if (error) {
        console.log(`  ✗ ${supplier.name}: ${error.message}`);
      } else {
        console.log(`  ✓ Inserted: ${supplier.name}`);
      }
    }
  }

  console.log("\nDone.");
}

run();
