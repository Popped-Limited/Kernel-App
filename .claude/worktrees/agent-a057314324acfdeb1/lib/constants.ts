import type { ChecklistFrequency, QuestionType } from "./types";

export const FREQUENCIES: { value: ChecklistFrequency; label: string }[] = [
  { value: "per_shift_am", label: "Per shift (AM)" },
  { value: "per_shift_pm", label: "Per shift (PM)" },
  { value: "per_shift_eod", label: "End of day" },
  { value: "per_delivery", label: "Per delivery" },
  { value: "per_dispatch", label: "Per dispatch" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "per_new_start", label: "Per new start" },
  { value: "per_complaint", label: "Per complaint" },
  { value: "per_corrective_action", label: "Per corrective action" },
  { value: "adhoc", label: "Adhoc" },
  { value: "per_batch", label: "Per batch" },
];

export const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "checkbox", label: "Tick box (yes/no)" },
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & time" },
  { value: "dropdown", label: "Dropdown" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "photo", label: "Photo upload" },
  { value: "signature", label: "Signature" },
];
