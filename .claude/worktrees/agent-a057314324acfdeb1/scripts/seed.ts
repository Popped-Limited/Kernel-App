/**
 * Seed script — run once to populate checklists and questions.
 * Usage: npm run seed
 *
 * Safe to re-run: upserts by name so won't duplicate.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

type Q = {
  label: string;
  type:
    | "checkbox"
    | "number"
    | "text"
    | "date"
    | "datetime"
    | "dropdown"
    | "photo"
    | "signature"
    | "multiple_choice";
  required?: boolean;
  options?: string[];
  hint?: string;
};

type ChecklistDef = {
  name: string;
  frequency: string;
  description: string;
  questions: Q[];
};

const checklists: ChecklistDef[] = [
  {
    name: "Opening Checks",
    frequency: "per_shift_am",
    description: "AM shift opening checks — complete before production begins.",
    questions: [
      { label: "Date", type: "date", required: true },
      { label: "Completed by", type: "text", required: true, hint: "Full name" },
      { label: "All staff wearing correct PPE (hairnet, apron, gloves)?", type: "checkbox", required: true },
      { label: "Handwashing facilities stocked (soap, paper towels)?", type: "checkbox", required: true },
      { label: "Production area clean and tidy from last shift?", type: "checkbox", required: true },
      { label: "All equipment visually inspected and in good working order?", type: "checkbox", required: true },
      { label: "Refrigerators at correct temperature (1–5°C)?", type: "checkbox", required: true },
      { label: "Fridge 1 temperature (°C)", type: "number", required: true },
      { label: "Fridge 2 temperature (°C)", type: "number", required: false },
      { label: "Freezer temperature (°C)", type: "number", required: false },
      { label: "Pest control — no signs of pest activity?", type: "checkbox", required: true },
      { label: "Any maintenance issues to report?", type: "checkbox", required: true, hint: "Tick if YES" },
      { label: "If yes, describe maintenance issue", type: "text", required: false },
      { label: "Any allergen-relevant changes to note today?", type: "checkbox", required: false, hint: "Tick if YES" },
      { label: "Notes / anything unusual", type: "text", required: false },
      { label: "Signature", type: "signature", required: true },
    ],
  },
  {
    name: "Closing Checks",
    frequency: "per_shift_pm",
    description: "PM shift closing checks — complete at end of production.",
    questions: [
      { label: "Date", type: "date", required: true },
      { label: "Completed by", type: "text", required: true, hint: "Full name" },
      { label: "All products correctly labelled and stored?", type: "checkbox", required: true },
      { label: "All raw materials returned to correct storage?", type: "checkbox", required: true },
      { label: "Waste disposed of correctly?", type: "checkbox", required: true },
      { label: "Equipment cleaned and sanitised?", type: "checkbox", required: true },
      { label: "Surfaces cleaned and sanitised?", type: "checkbox", required: true },
      { label: "Floors swept and mopped?", type: "checkbox", required: true },
      { label: "Refrigerators checked and doors closed?", type: "checkbox", required: true },
      { label: "Fridge 1 end-of-day temperature (°C)", type: "number", required: true },
      { label: "Fridge 2 end-of-day temperature (°C)", type: "number", required: false },
      { label: "Windows and doors secured?", type: "checkbox", required: true },
      { label: "Any equipment faults to report?", type: "checkbox", required: false, hint: "Tick if YES" },
      { label: "If yes, describe fault", type: "text", required: false },
      { label: "Notes / anything to hand over to next shift", type: "text", required: false },
      { label: "Signature", type: "signature", required: true },
    ],
  },
  {
    name: "Goods In Record",
    frequency: "per_delivery",
    description: "Record every delivery received — one form per delivery.",
    questions: [
      { label: "Date received", type: "date", required: true },
      { label: "Time received", type: "text", required: true, hint: "e.g. 09:30" },
      { label: "Received by", type: "text", required: true, hint: "Full name" },
      { label: "Supplier name", type: "text", required: true },
      { label: "Product / ingredient name", type: "text", required: true },
      { label: "Batch / lot number", type: "text", required: true },
      { label: "Best before / use by date", type: "date", required: true },
      { label: "Quantity received", type: "text", required: true, hint: "Include units e.g. 10 kg" },
      { label: "Delivery temperature (°C) — chilled/frozen goods only", type: "number", required: false },
      { label: "Packaging integrity — undamaged?", type: "checkbox", required: true },
      { label: "Product within date?", type: "checkbox", required: true },
      { label: "Any allergen information matches spec?", type: "checkbox", required: true },
      { label: "Goods accepted?", type: "dropdown", required: true, options: ["Yes — accepted", "Partially accepted", "Rejected"] },
      { label: "Reason if rejected or partially accepted", type: "text", required: false },
      { label: "Photo of delivery / label", type: "photo", required: true },
      { label: "Signature", type: "signature", required: true },
    ],
  },
  {
    name: "Goods Out Record",
    frequency: "per_dispatch",
    description: "Record every dispatch — one form per dispatch.",
    questions: [
      { label: "Date dispatched", type: "date", required: true },
      { label: "Time dispatched", type: "text", required: true, hint: "e.g. 14:00" },
      { label: "Dispatched by", type: "text", required: true, hint: "Full name" },
      { label: "Customer / destination", type: "text", required: true },
      { label: "Product name", type: "text", required: true },
      { label: "Batch number", type: "text", required: true },
      { label: "Best before / use by date", type: "date", required: true },
      { label: "Quantity dispatched", type: "text", required: true, hint: "Include units" },
      { label: "Vehicle / courier", type: "text", required: false },
      { label: "Vehicle temperature (°C) — chilled / frozen only", type: "number", required: false },
      { label: "All products correctly labelled?", type: "checkbox", required: true },
      { label: "Allergen info on label correct?", type: "checkbox", required: true },
      { label: "Photo of product / dispatch label", type: "photo", required: true },
      { label: "Signature", type: "signature", required: true },
    ],
  },
  {
    name: "Daily Cleaning",
    frequency: "per_shift_eod",
    description: "End-of-day cleaning record — complete after each production day.",
    questions: [
      { label: "Date", type: "date", required: true },
      { label: "Completed by", type: "text", required: true },
      { label: "Cleaning chemical used", type: "text", required: true, hint: "Product name and dilution rate" },
      { label: "Surfaces / worktops wiped down and sanitised?", type: "checkbox", required: true },
      { label: "All equipment wiped down and sanitised?", type: "checkbox", required: true },
      { label: "Sinks cleaned?", type: "checkbox", required: true },
      { label: "Floors swept?", type: "checkbox", required: true },
      { label: "Floors mopped?", type: "checkbox", required: true },
      { label: "Bins emptied and relined?", type: "checkbox", required: true },
      { label: "Handwashing area restocked?", type: "checkbox", required: true },
      { label: "Drains cleaned?", type: "checkbox", required: false },
      { label: "Any areas that could not be cleaned — reason", type: "text", required: false },
      { label: "Signature", type: "signature", required: true },
    ],
  },
  {
    name: "Weekly Cleaning",
    frequency: "weekly",
    description: "Weekly deep clean record.",
    questions: [
      { label: "Week commencing (date)", type: "date", required: true },
      { label: "Completed by", type: "text", required: true },
      { label: "Deep clean of all equipment (disassembled where possible)?", type: "checkbox", required: true },
      { label: "Wall tiles / splashbacks cleaned?", type: "checkbox", required: true },
      { label: "Ceilings / overhead fixtures dusted / wiped?", type: "checkbox", required: true },
      { label: "Ventilation grilles cleaned?", type: "checkbox", required: false },
      { label: "Cold storage units fully cleaned and defrosted (if applicable)?", type: "checkbox", required: true },
      { label: "Shelving units and racking wiped down?", type: "checkbox", required: true },
      { label: "Dry store area cleaned and organised?", type: "checkbox", required: true },
      { label: "External waste area cleaned?", type: "checkbox", required: true },
      { label: "Laundry sent / collected this week?", type: "checkbox", required: false },
      { label: "Notes", type: "text", required: false },
      { label: "Signature", type: "signature", required: true },
    ],
  },
  {
    name: "Monthly Cleaning",
    frequency: "monthly",
    description: "Monthly deep clean and maintenance check.",
    questions: [
      { label: "Month / year", type: "text", required: true, hint: "e.g. June 2025" },
      { label: "Completed by", type: "text", required: true },
      { label: "Light fittings cleaned?", type: "checkbox", required: true },
      { label: "Door seals and hinges checked and cleaned?", type: "checkbox", required: true },
      { label: "Behind and under large equipment cleaned?", type: "checkbox", required: true },
      { label: "Pipe work and ducting inspected?", type: "checkbox", required: false },
      { label: "Fire extinguishers checked (in date, no damage)?", type: "checkbox", required: true },
      { label: "First aid kit checked and restocked?", type: "checkbox", required: true },
      { label: "Pest control bait stations checked?", type: "checkbox", required: true },
      { label: "External drains checked and clear?", type: "checkbox", required: true },
      { label: "Any building fabric issues noted (cracks, damage)?", type: "checkbox", required: true, hint: "Tick if YES — add to maintenance report" },
      { label: "Notes", type: "text", required: false },
      { label: "Signature", type: "signature", required: true },
    ],
  },
  {
    name: "Hygiene Swab",
    frequency: "weekly",
    description: "Environmental hygiene swab results record.",
    questions: [
      { label: "Date swabbed", type: "date", required: true },
      { label: "Completed by", type: "text", required: true },
      { label: "Swab kit / brand used", type: "text", required: true },
      { label: "Area swabbed 1", type: "text", required: true, hint: "e.g. chopping board surface" },
      { label: "Result 1", type: "dropdown", required: true, options: ["Pass", "Fail", "Borderline"] },
      { label: "Area swabbed 2", type: "text", required: false },
      { label: "Result 2", type: "dropdown", required: false, options: ["Pass", "Fail", "Borderline"] },
      { label: "Area swabbed 3", type: "text", required: false },
      { label: "Result 3", type: "dropdown", required: false, options: ["Pass", "Fail", "Borderline"] },
      { label: "Any fails — corrective action taken?", type: "text", required: false },
      { label: "Photo of swab results", type: "photo", required: true },
      { label: "Signature", type: "signature", required: true },
    ],
  },
  {
    name: "Scale Calibration",
    frequency: "weekly",
    description: "Weighing scale accuracy check.",
    questions: [
      { label: "Date", type: "date", required: true },
      { label: "Completed by", type: "text", required: true },
      { label: "Scale ID / location", type: "text", required: true },
      { label: "Calibration weight used (g)", type: "number", required: true },
      { label: "Reading displayed (g)", type: "number", required: true },
      { label: "Within tolerance? (±0.5 g)", type: "checkbox", required: true },
      { label: "Scale 2 ID / location", type: "text", required: false },
      { label: "Scale 2 calibration weight (g)", type: "number", required: false },
      { label: "Scale 2 reading (g)", type: "number", required: false },
      { label: "Scale 2 within tolerance?", type: "checkbox", required: false },
      { label: "Any scales out of tolerance — action taken", type: "text", required: false },
      { label: "Signature", type: "signature", required: true },
    ],
  },
  {
    name: "Probe Calibration",
    frequency: "weekly",
    description: "Temperature probe calibration check.",
    questions: [
      { label: "Date", type: "date", required: true },
      { label: "Completed by", type: "text", required: true },
      { label: "Probe ID", type: "text", required: true },
      { label: "Calibration method", type: "dropdown", required: true, options: ["Ice slurry (0°C)", "Boiling water (100°C)", "Reference thermometer"] },
      { label: "Expected reading (°C)", type: "number", required: true },
      { label: "Actual probe reading (°C)", type: "number", required: true },
      { label: "Within tolerance? (±1°C)", type: "checkbox", required: true },
      { label: "If out of tolerance — action taken", type: "text", required: false },
      { label: "Probe 2 ID", type: "text", required: false },
      { label: "Probe 2 expected reading (°C)", type: "number", required: false },
      { label: "Probe 2 actual reading (°C)", type: "number", required: false },
      { label: "Probe 2 within tolerance?", type: "checkbox", required: false },
      { label: "Signature", type: "signature", required: true },
    ],
  },
  {
    name: "Complaint Form",
    frequency: "per_complaint",
    description: "Customer or internal complaint record — one form per complaint.",
    questions: [
      { label: "Date complaint received", type: "date", required: true },
      { label: "Recorded by", type: "text", required: true },
      { label: "Complainant name", type: "text", required: false },
      { label: "Complainant contact details", type: "text", required: false },
      { label: "Nature of complaint", type: "dropdown", required: true, options: ["Foreign body", "Packaging fault", "Quality / taste / appearance", "Labelling error", "Allergen concern", "Illness / food safety", "Short fill / weight", "Other"] },
      { label: "Product name and batch number", type: "text", required: true },
      { label: "Full description of complaint", type: "text", required: true },
      { label: "Date product purchased / received", type: "date", required: false },
      { label: "Product returned?", type: "checkbox", required: false },
      { label: "Immediate action taken", type: "text", required: true },
      { label: "Root cause identified", type: "text", required: false },
      { label: "Corrective action raised?", type: "checkbox", required: false, hint: "Tick if a corrective action report has been raised" },
      { label: "Response sent to customer?", type: "checkbox", required: false },
      { label: "Closed out — date", type: "date", required: false },
      { label: "Manager sign-off", type: "signature", required: true },
    ],
  },
  {
    name: "Corrective Action Report",
    frequency: "per_corrective_action",
    description: "Non-conformance and corrective action record.",
    questions: [
      { label: "Date raised", type: "date", required: true },
      { label: "Raised by", type: "text", required: true },
      { label: "Reference number (e.g. CAR-001)", type: "text", required: true },
      { label: "Non-conformance category", type: "dropdown", required: true, options: ["Product quality", "Food safety", "Process deviation", "Supplier issue", "Equipment failure", "Allergen risk", "Labelling error", "Pest activity", "Personnel / hygiene", "Other"] },
      { label: "Description of non-conformance", type: "text", required: true },
      { label: "Products / batches affected", type: "text", required: false },
      { label: "Immediate containment action", type: "text", required: true },
      { label: "Root cause analysis", type: "text", required: true },
      { label: "Corrective action to prevent recurrence", type: "text", required: true },
      { label: "Responsible person", type: "text", required: true },
      { label: "Target completion date", type: "date", required: true },
      { label: "Photo evidence", type: "photo", required: false },
      { label: "Effectiveness review date", type: "date", required: false },
      { label: "Closed out?", type: "checkbox", required: false },
      { label: "Manager sign-off", type: "signature", required: true },
    ],
  },
  {
    name: "Employee Induction Checklist",
    frequency: "per_new_start",
    description: "Complete for every new employee on their first day.",
    questions: [
      { label: "Employee name", type: "text", required: true },
      { label: "Start date", type: "date", required: true },
      { label: "Job title / role", type: "text", required: true },
      { label: "Induction completed by", type: "text", required: true },
      { label: "Personal hygiene policy explained?", type: "checkbox", required: true },
      { label: "Handwashing procedure demonstrated?", type: "checkbox", required: true },
      { label: "PPE requirements explained and issued?", type: "checkbox", required: true },
      { label: "Allergen awareness training given?", type: "checkbox", required: true },
      { label: "HACCP / food safety basics explained?", type: "checkbox", required: true },
      { label: "Cleaning procedures explained?", type: "checkbox", required: true },
      { label: "Emergency procedures (fire exits, first aid) covered?", type: "checkbox", required: true },
      { label: "Reporting illness / return to work policy explained?", type: "checkbox", required: true },
      { label: "Site tour completed?", type: "checkbox", required: true },
      { label: "Employee has read and signed food safety booklet?", type: "checkbox", required: true },
      { label: "Next review / probation date", type: "date", required: false },
      { label: "Employee signature", type: "signature", required: true },
      { label: "Manager signature", type: "signature", required: true },
    ],
  },
  {
    name: "Food Safety Booklet Questionnaire",
    frequency: "per_new_start",
    description: "Knowledge check to confirm new starters understand food safety basics.",
    questions: [
      { label: "Employee name", type: "text", required: true },
      { label: "Date", type: "date", required: true },
      { label: "What temperature should chilled food be stored at?", type: "dropdown", required: true, options: ["Below 5°C", "Below 8°C", "Below 10°C", "Any cool temperature"] },
      { label: "What should you do if you have symptoms of a stomach illness?", type: "dropdown", required: true, options: ["Report to manager and stay away from work", "Come in but wear extra gloves", "Take medicine and carry on", "Only come in if feeling better by lunchtime"] },
      { label: "Which of these is NOT a major food allergen?", type: "dropdown", required: true, options: ["Black pepper", "Peanuts", "Gluten (wheat)", "Milk"] },
      { label: "How long should you wash your hands for?", type: "dropdown", required: true, options: ["At least 20 seconds", "A quick rinse is fine", "5 seconds", "Only when visibly dirty"] },
      { label: "What does cross-contamination mean?", type: "text", required: true, hint: "Write your answer in your own words" },
      { label: "Name two things you must do before handling food", type: "text", required: true },
      { label: "What should you do if you find a foreign body in a product?", type: "text", required: true },
      { label: "Where is the first aid kit located?", type: "text", required: true },
      { label: "Employee signature", type: "signature", required: true },
      { label: "Assessed by", type: "text", required: true },
      { label: "Pass / Fail", type: "dropdown", required: true, options: ["Pass", "Fail — retrain required"] },
    ],
  },
  {
    name: "Laundry Checklist",
    frequency: "weekly",
    description: "Weekly laundry and PPE condition record.",
    questions: [
      { label: "Week commencing (date)", type: "date", required: true },
      { label: "Completed by", type: "text", required: true },
      { label: "All aprons sent for laundry?", type: "checkbox", required: true },
      { label: "Number of aprons sent", type: "number", required: true },
      { label: "Cloths / towels sent for laundry?", type: "checkbox", required: true },
      { label: "Number of cloths / towels sent", type: "number", required: true },
      { label: "Any PPE items worn, torn, or needing replacement?", type: "checkbox", required: true, hint: "Tick if YES" },
      { label: "If yes — items to replace", type: "text", required: false },
      { label: "Clean laundry returned and stored correctly?", type: "checkbox", required: false },
      { label: "Laundry supplier / collection company", type: "text", required: false },
      { label: "Notes", type: "text", required: false },
      { label: "Signature", type: "signature", required: true },
    ],
  },
  {
    name: "Maintenance Report",
    frequency: "adhoc",
    description: "Log any equipment faults, building issues, or repairs needed.",
    questions: [
      { label: "Date reported", type: "date", required: true },
      { label: "Reported by", type: "text", required: true },
      { label: "Equipment / area affected", type: "text", required: true },
      { label: "Description of fault / issue", type: "text", required: true },
      { label: "Is the fault a food safety risk?", type: "checkbox", required: true, hint: "Tick if YES — action immediately" },
      { label: "Immediate action taken", type: "text", required: false },
      { label: "Equipment taken out of service?", type: "checkbox", required: false },
      { label: "Photo of fault", type: "photo", required: true },
      { label: "Contractor / engineer required?", type: "checkbox", required: false },
      { label: "Contractor name (if booked)", type: "text", required: false },
      { label: "Estimated repair date", type: "date", required: false },
      { label: "Repair completed date", type: "date", required: false },
      { label: "Repair confirmed satisfactory?", type: "checkbox", required: false },
      { label: "Manager sign-off", type: "signature", required: true },
    ],
  },
  {
    name: "Return to Work Approval",
    frequency: "adhoc",
    description: "Manager approval before a staff member returns after illness.",
    questions: [
      { label: "Date", type: "date", required: true },
      { label: "Employee name", type: "text", required: true },
      { label: "Date absent from", type: "date", required: true },
      { label: "Date returning", type: "date", required: true },
      { label: "Reason for absence (general, no medical detail required)", type: "text", required: true },
      { label: "Did employee have diarrhoea or vomiting during absence?", type: "dropdown", required: true, options: ["No", "Yes", "Unsure"] },
      { label: "If yes — employee must be symptom-free for 48 hours before return — confirmed?", type: "checkbox", required: false },
      { label: "Employee completed self-assessment form?", type: "checkbox", required: true },
      { label: "Cleared to return to full duties?", type: "dropdown", required: true, options: ["Yes — cleared for full duties", "Yes — light duties only (no direct food contact)", "No — not cleared to return"] },
      { label: "Notes", type: "text", required: false },
      { label: "Manager signature", type: "signature", required: true },
    ],
  },
  {
    name: "Return to Work Self Assessment",
    frequency: "adhoc",
    description: "Employee self-assessment to complete before returning after illness.",
    questions: [
      { label: "Date", type: "date", required: true },
      { label: "Employee name", type: "text", required: true },
      { label: "I have been absent since (date)", type: "date", required: true },
      { label: "My symptoms have fully resolved", type: "checkbox", required: true },
      { label: "I have been symptom-free for at least 48 hours", type: "checkbox", required: true },
      { label: "I did not have diarrhoea or vomiting (or I have been symptom-free for 48+ hours)", type: "checkbox", required: true },
      { label: "I do not have any open cuts or sores on my hands (or they are fully covered with a blue plaster)", type: "checkbox", required: true },
      { label: "I have washed my hands before completing this form", type: "checkbox", required: true },
      { label: "I confirm the above statements are true", type: "checkbox", required: true },
      { label: "Employee signature", type: "signature", required: true },
    ],
  },
  {
    name: "Visitor Sign In & Health Questionnaire",
    frequency: "adhoc",
    description: "All visitors to the production area must complete this form.",
    questions: [
      { label: "Date of visit", type: "date", required: true },
      { label: "Time of arrival", type: "text", required: true, hint: "e.g. 10:30" },
      { label: "Visitor full name", type: "text", required: true },
      { label: "Company / organisation", type: "text", required: false },
      { label: "Purpose of visit", type: "text", required: true },
      { label: "Host / person visiting", type: "text", required: true },
      { label: "Do you have any symptoms of illness (diarrhoea, vomiting, nausea)?", type: "dropdown", required: true, options: ["No", "Yes"] },
      { label: "Have you had a stomach illness in the last 48 hours?", type: "dropdown", required: true, options: ["No", "Yes"] },
      { label: "Do you have any open cuts or sores on your hands?", type: "dropdown", required: true, options: ["No", "Yes — covered with blue plaster"] },
      { label: "Are you wearing appropriate PPE (hairnet, apron)?", type: "checkbox", required: true },
      { label: "Visitor has been briefed on site rules and hygiene requirements?", type: "checkbox", required: true },
      { label: "Time of departure", type: "text", required: false },
      { label: "Visitor signature", type: "signature", required: true },
      { label: "Host signature", type: "signature", required: true },
    ],
  },
];

async function seed() {
  console.log("Starting seed…\n");

  for (const cl of checklists) {
    console.log(`Upserting checklist: ${cl.name}`);

    // Upsert checklist by name
    const { data: existing, error: fetchErr } = await supabase
      .from("checklists")
      .select("id")
      .eq("name", cl.name)
      .single();

    let checklistId: string;

    if (fetchErr && fetchErr.code !== "PGRST116") {
      console.error("  Error fetching:", fetchErr.message);
      continue;
    }

    if (existing) {
      checklistId = existing.id;
      const { error } = await supabase
        .from("checklists")
        .update({ frequency: cl.frequency, description: cl.description, active: true })
        .eq("id", checklistId);
      if (error) { console.error("  Update error:", error.message); continue; }
    } else {
      const { data, error } = await supabase
        .from("checklists")
        .insert({ name: cl.name, frequency: cl.frequency, description: cl.description, active: true })
        .select("id")
        .single();
      if (error || !data) { console.error("  Insert error:", error?.message); continue; }
      checklistId = data.id;
    }

    // Delete existing questions then re-insert (keeps order clean)
    await supabase.from("questions").delete().eq("checklist_id", checklistId);

    const questionsToInsert = cl.questions.map((q, i) => ({
      checklist_id: checklistId,
      label: q.label,
      type: q.type,
      required: q.required ?? true,
      order_index: i,
      options: q.options ?? null,
      hint: q.hint ?? null,
    }));

    const { error: qErr } = await supabase.from("questions").insert(questionsToInsert);
    if (qErr) {
      console.error(`  Question insert error: ${qErr.message}`);
    } else {
      console.log(`  ✓ ${questionsToInsert.length} questions`);
    }
  }

  // Seed the founder as first team member
  const { data: existingMember } = await supabase
    .from("team_members")
    .select("id")
    .eq("email", "tom@yepkitchen.com")
    .single();

  if (!existingMember) {
    await supabase.from("team_members").insert({
      name: "Tom Palmer",
      email: "tom@yepkitchen.com",
      role: "admin",
      active: true,
    });
    console.log("\n✓ Added Tom Palmer as admin");
  }

  console.log("\n✅ Seed complete!");
}

seed().catch(console.error);
