export type QuestionType =
  | "checkbox"
  | "number"
  | "multi_number"
  | "text"
  | "date"
  | "datetime"
  | "dropdown"
  | "photo"
  | "signature"
  | "multiple_choice"
  | "ingredient_table"
  | "packing_runs"
  | "batch_link"
  | "document";

export type ChecklistFrequency =
  | "per_shift_am"
  | "per_shift_pm"
  | "per_delivery"
  | "per_dispatch"
  | "per_shift_eod"
  | "weekly"
  | "monthly"
  | "adhoc"
  | "per_new_start"
  | "per_complaint"
  | "per_corrective_action"
  | "per_batch";

export interface Checklist {
  id: string;
  name: string;
  frequency: ChecklistFrequency;
  description: string | null;
  category: string | null;
  active: boolean;
  created_at: string;
  public_token: string | null;
  organisation_id: string | null;
  color: string | null;
}

export type ReminderFrequency = "daily" | "weekly" | "monthly" | "quarterly";

export interface ChecklistReminder {
  id: string;
  checklist_id: string;
  organisation_id: string;
  recipient_email: string;
  recipient_name: string | null;
  frequency: ReminderFrequency;
  send_hour: number;             // 0-23, UK local time
  days: number[];                // 0=Sun .. 6=Sat — used when frequency = "daily" | "weekly"
  day_of_month: number | null;   // 1-28 — used when frequency = "monthly" | "quarterly"
  start_month: number | null;    // 0=Jan .. 11=Dec — quarterly anchor month
  active: boolean;
  last_sent_on: string | null;
  created_at: string;
}

export interface Question {
  id: string;
  checklist_id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  order_index: number;
  options: string[] | null; // for dropdown / multiple_choice
  hint: string | null;
  follow_up: { trigger: string; label: string } | null; // conditional follow-up when a specific option is chosen
  created_at: string;
  document_path: string | null;
  document_required: boolean;
}

export interface Submission {
  id: string;
  checklist_id: string;
  submitted_by: string;
  submitted_at: string;
  signed_off_by: string | null;
  signed_off_at: string | null;
  notes: string | null;
  batch_notes: string | null;
  checklist?: Checklist;
  answers?: Answer[];
}

export interface Answer {
  id: string;
  submission_id: string;
  question_id: string;
  value: string | null; // JSON string for complex values
  question?: Question;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "staff";
  active: boolean;
  created_at: string;
}

// Per-100g FIC by-weight values. null = not available (never treat as 0).
export interface NutritionPer100g {
  energy_kcal: number | null;
  energy_kj: number | null;
  fat_g: number | null;
  saturates_g: number | null;
  carbohydrate_g: number | null;
  sugars_g: number | null;
  fibre_g: number | null;
  protein_g: number | null;
  salt_g: number | null;
}

export interface Ingredient {
  id: string;
  name: string;
  type: "ingredient" | "packaging" | "supplies";
  unit: "g" | "units";
  price_per_kg: number | null;
  supplier_id: string | null;
  density_g_per_l: number | null;
  allergens: string[] | null;
  may_contain_allergens: string[] | null;
  is_primary_packaging: boolean | null;
  spec_sheet_review_frequency_years: number | null;
  spec_sheet_next_review_due: string | null;
  nutrition_per_100g?: NutritionPer100g | null;
  nutrition_source?: "cofid" | "spec_sheet" | "manual" | null;
  nutrition_cofid_code?: string | null;
  nutrition_basis?: "per_100g" | "per_100ml" | null;
  nutrition_updated_at?: string | null;
  created_at: string;
}

export interface IngredientLot {
  id: string;
  ingredient_id: string;
  julian_code: string;
  quantity_received_g: number;
  quantity_remaining_g: number;
  received_date: string;
  supplier: string | null;
  best_before_date: string | null;
  created_by: string;
  created_at: string;
  ingredient?: Ingredient;
}

export interface Dispatch {
  id: string;
  dispatch_date: string;
  product: string;
  customer: string;
  cases_of_6: number;
  cases_of_3: number;
  singles: number;
  total_units: number;
  reference: string | null;
  dispatched_by: string;
  notes: string | null;
  batch_submission_id: string | null;
  created_at: string;
  batch_submission?: Submission;
}

export interface AlertLog {
  id: string;
  checklist_id: string;
  sent_at: string;
  recipient: string;
  message: string;
}

export interface SOP {
  id: string;
  organisation_id: string;
  title: string;
  category: string | null;
  description: string | null;
  status: "draft" | "published";
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SOPStep {
  id: string;
  sop_id: string;
  order_index: number;
  title: string | null;
  body: string | null;
  image_url: string | null;
  created_at: string;
}

export interface GoodsReturn {
  id: string;
  organisation_id: string;
  return_date: string;
  product: string;
  customer: string;
  quantity: number;
  dispatch_id: string | null;
  batch_submission_id: string | null;
  returned_by: string;
  notes: string | null;
  created_at: string;
}

export interface FinishedGoodsAdjustment {
  id: string;
  organisation_id: string;
  product: string;
  quantity: number;
  reason: string;
  notes: string | null;
  batch_code: string | null;
  created_by: string;
  created_at: string;
}

