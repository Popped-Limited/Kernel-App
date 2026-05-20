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
  | "packing_runs";

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
  created_at: string;
}

export interface Submission {
  id: string;
  checklist_id: string;
  submitted_by: string;
  submitted_at: string;
  signed_off_by: string | null;
  signed_off_at: string | null;
  notes: string | null;
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

export interface Ingredient {
  id: string;
  name: string;
  type: "ingredient" | "packaging" | "supplies";
  unit: "g" | "units";
  price_per_kg: number | null;
  supplier_id: string | null;
  density_g_per_l: number | null;
  allergens: string[] | null;
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

