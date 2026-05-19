/**
 * Import Typeform SAQ responses into Kernel
 * Run: node scripts/import-typeform.mjs
 */

const SUPABASE_URL = "https://dudchdacsrgdnenkqmyo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1ZGNoZGFjc3JnZG5lbmtxbXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDQ1NTUsImV4cCI6MjA5NDE4MDU1NX0.J94RDCFVm_bQ_VTY0B1TBiTdJ_QcbwKl01dYY4zGrBM";

async function db(path, method = "GET", body = null) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "",
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${err}`);
  }
  return res.status === 204 ? null : res.json();
}

// ── Fetch current SAQ question IDs from live DB ───────────────────────────────
async function getQuestionIds() {
  const qs = await db("saq_questions?select=question_id,section_number,question_text&order=sort_order");
  console.log("\n📋 Current SAQ question IDs in DB:");
  for (const q of qs) console.log(`  [${q.section_number}] ${q.question_id}: ${q.question_text.substring(0, 60)}`);
  return qs.map(q => q.question_id);
}

// ── Map certification columns to a single value ───────────────────────────────
function mapCert(row) {
  if (row["SALSA"]) return "SALSA";
  if (row["BRCGS"]) return "BRCGS";
  if (row["ISO 22000"]) return "ISO22000";
  if (row["None"]) return "None";
  if (row["Other"]) return row["Other"];
  return null;
}

// ── Map a yes/no Typeform value (1 = yes, 0/empty = no) to Yes/No ─────────────
function yn(val) {
  if (!val || val === "0" || val === "") return "No";
  return "Yes";
}

// ── Build responses object from ingredient supplier row ───────────────────────
function buildIngredientResponses(row) {
  const cert = mapCert(row);
  const fullAddress = [row["Address"], row["Address line 2"], row["City/Town"], row["State/Region/Province"], row["Zip/Post Code"], row["Country"]]
    .filter(Boolean).join(", ");
  const contactName = `${row["First name"] || ""} ${row["Last name"] || ""}`.trim();

  return {
    // Section 1: Company Details
    "1_company_name": row["What is the legal company name?"] || "",
    "1_address": fullAddress,
    "1_contact_name": contactName,
    "1_telephone": (row["Phone number"] || "").replace(/^'+/, ""),
    "1_email": row["Email"] || "",

    // Section 2: Food Safety Certification
    "2_holds_cert": cert && cert !== "None" ? "Yes" : "No",
    "2_cert_name": cert && cert !== "None" ? cert : "",

    // Section 3: Food Safety Management & HACCP
    "3_fs_policy": yn(row["If not certified, do you have a documented Food Safety Management System?"]),
    "3_haccp_plan": yn(row["Do you have a current HACCP plan?"]),
    "3_recall_procedure": yn(row["Do you have a documented product recall/withdrawal procedure?"]),
    "3_supplier_approval": yn(row["Do you approve your own suppliers of raw materials/packaging?"]),
    "3_internal_audits": yn(row["Are staff trained in food safety & hygiene?"]),

    // Section 4: Premises & Equipment
    "4_pest_control": row["Pest control"] ? "Yes" : "No",

    // Section 5: Hygiene & Cleaning
    "5_hygiene_policy": row["Personal hygiene"] ? "Yes" : "No",
    "5_visitors": yn(row["Do you have site hygiene rules and visitor procedures?"]),
    "5_cleaning_schedule": row["Cleaning & sanitation"] ? "Yes" : "No",
    "5_chemicals": "Yes",

    // Section 6: Allergen & Contamination Control
    "6_allergen_labels": yn(row["Are allergens clearly declared and controlled in your supply chain?"]),
    "6_allergen_seg": yn(row["Are allergens stored and handled to prevent cross-contact?"]),
    "6_metal_detection": row["Metal detection"] || row["X-ray"] ? "Yes" : "No",
    "6_foreign_body": row["Sieves"] || row["Magnets"] || row["Metal detection"] || row["X-ray"] ? "Yes" : "No",
    "6_glass_policy": row["Glass/wood/plastic control"] ? "Yes" : "No",

    // Section 7: Products, Testing & Traceability
    "7_specifications": yn(row["Do you have specifications for the products you supply?"]),
    "7_labelling": yn(row["Do your products meet UK/EU food law requirements?"]),
    "7_traceability": yn(row["Can you provide full traceability?"]),

    // Section 8: Transport & Storage
    "8_storage_conditions": "Yes",

    // Section 9: Training & Personnel
    "9_handler_training": yn(row["Are staff trained in food safety & hygiene?"]),

    // Section 11: Declaration
    "11_full_name": contactName,
    "11_date": row["Please enter the date this form was completed."]
      ? row["Please enter the date this form was completed."].split("T")[0]
      : "",
  };
}

// ── Build responses object from packaging supplier row ────────────────────────
function buildPackagingResponses(row) {
  const cert = mapCert(row);
  const fullAddress = [row["Address"], row["Address line 2"], row["City/Town"], row["State/Region/Province"], row["Zip/Post Code"], row["Country"]]
    .filter(Boolean).join(", ");
  const contactName = `${row["First name"] || ""} ${row["Last name"] || ""}`.trim();

  return {
    "1_company_name": row["What is the legal company name?"] || "",
    "1_address": fullAddress,
    "1_contact_name": contactName,
    "1_telephone": (row["Phone number"] || "").replace(/^'+/, ""),
    "1_email": row["Email"] || "",

    "2_holds_cert": cert && cert !== "None" ? "Yes" : "No",
    "2_cert_name": cert && cert !== "None" ? cert : "",

    "3_fs_policy": yn(row["If not certified, do you have a documented Quality or Food Safety Management System?"]),
    "3_recall_procedure": yn(row["Do you have a documented product recall/withdrawal procedure?"] || ""),

    "4_pest_control": row["Pest control"] ? "Yes" : "No",

    "5_hygiene_policy": row["Personal hygiene"] ? "Yes" : "No",
    "5_visitors": yn(row["Do you have site hygiene rules and visitor procedures?"]),
    "5_cleaning_schedule": row["Cleaning & sanitation"] ? "Yes" : "No",

    "7_labelling": yn(row["Do your products comply with relevant UK/EU regulations?"]),
    "7_specifications": yn(row["Do you have specifications for the products you supply?"]),
    "7_traceability": yn(row["Can you provide traceability information on supplied goods if requested?"]),

    "11_full_name": contactName,
    "11_date": row["Please enter the date this form was completed."]
      ? row["Please enter the date this form was completed."].split("T")[0]
      : "",
  };
}

// ── Parse simple CSV (handles quoted fields with commas) ─────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? "").trim(); });
    return row;
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ── Determine supplier type from form ────────────────────────────────────────
function supplierTypeFromIngredientRow(row) {
  // All form 1 rows are raw materials
  return "raw_material";
}

// ── Name matching: try to find existing supplier ──────────────────────────────
function nameMatch(csvName, dbName) {
  const n = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const a = n(csvName);
  const b = n(dbName);
  return a.includes(b) || b.includes(a) || a === b;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Typeform → Kernel SAQ import\n");

  // Fetch current question IDs
  await getQuestionIds();

  // Fetch existing suppliers
  const existingSuppliers = await db("suppliers?select=id,name,type");
  console.log(`\n✅ Found ${existingSuppliers.length} existing suppliers in DB`);

  // Read CSVs
  const { readFileSync } = await import("fs");
  const csv1 = parseCSV(readFileSync("/Users/thomaspalmer/Downloads/responses-ZJaZIalo-01KRXH019Q0ZVYVTN6CX478RQK-TAZ45D6923NN7V690RMQ3GYG.csv", "utf8"));
  const csv2 = parseCSV(readFileSync("/Users/thomaspalmer/Downloads/responses-OaBiSRaB-01KRXGZ7FYS5ZJKYFDB11C2VYD-HA9UJRN4QE75X7E54K78ZQFR.csv", "utf8"));

  console.log(`\n📥 CSV1: ${csv1.length} ingredient suppliers`);
  console.log(`📥 CSV2: ${csv2.length} packaging suppliers`);

  let created = 0, updated = 0, responsesInserted = 0;

  async function processRow(row, supplierType, buildResponses) {
    const companyName = row["What is the legal company name?"]?.trim();
    if (!companyName) return;

    const submitDate = row["Submit Date (UTC)"] || new Date().toISOString();
    const completedDate = row["Please enter the date this form was completed."] || submitDate;
    const tags = row["Tags"] || "";
    const isApproved = tags.toLowerCase().includes("approved");
    const cert = mapCert(row);

    // Try to find existing supplier
    let supplier = existingSuppliers.find(s => nameMatch(companyName, s.name));

    if (!supplier) {
      // Create new supplier
      const contactName = `${row["First name"] || ""} ${row["Last name"] || ""}`.trim();
      const [newSupplier] = await db("suppliers", "POST", {
        name: companyName,
        type: supplierType,
        supplies: "",
        contact_name: contactName || null,
        contact_email: row["Email"] || null,
        contact_phone: (row["Phone number"] || "").replace(/^'+/, "") || null,
        certification: cert || null,
        saq_completed: true,
        saq_date: submitDate,
        status: isApproved ? "approved" : "approved",
        notes: null,
      });
      supplier = newSupplier;
      existingSuppliers.push(supplier);
      console.log(`  ➕ Created: ${companyName}`);
      created++;
    } else {
      // Update existing supplier with contact info and SAQ completion
      const contactName = `${row["First name"] || ""} ${row["Last name"] || ""}`.trim();
      await db(`suppliers?id=eq.${supplier.id}`, "PATCH", {
        contact_name: contactName || null,
        contact_email: row["Email"] || null,
        contact_phone: (row["Phone number"] || "").replace(/^'+/, "") || null,
        certification: cert || null,
        saq_completed: true,
        saq_date: submitDate,
        status: isApproved ? "approved" : "approved",
      });
      console.log(`  ✏️  Updated: ${companyName}`);
      updated++;
    }

    // Insert SAQ response
    const responses = buildResponses(row);

    // Delete any existing response then insert fresh
    await db(`saq_responses?supplier_id=eq.${supplier.id}`, "DELETE");
    await db("saq_responses", "POST", {
      supplier_id: supplier.id,
      responses,
      submitted_at: submitDate,
    });
    console.log(`     ✓ Response inserted for ${companyName}`);
    responsesInserted++;
  }

  console.log("\n── Ingredient suppliers ────────────────────────────────────────");
  for (const row of csv1) {
    await processRow(row, "raw_material", buildIngredientResponses);
  }

  console.log("\n── Packaging suppliers ─────────────────────────────────────────");
  for (const row of csv2) {
    await processRow(row, "packaging", buildPackagingResponses);
  }

  console.log(`\n🎉 Done! Created: ${created}, Updated: ${updated}, Responses: ${responsesInserted}`);
}

main().catch(err => { console.error("❌", err); process.exit(1); });
