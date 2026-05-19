// Default category list — add more here as needed.
// These are suggestions in the admin UI; any free-text value also works.
export const DEFAULT_CATEGORIES = [
  "Daily Operations",
  "Cleaning",
  "Traceability",
  "Equipment",
  "HR",
  "Incidents & Reports",
];

// Pre-assigned categories for the 19 seeded checklists
export const CHECKLIST_CATEGORIES: Record<string, string> = {
  "Opening Checks": "Daily Operations",
  "Closing Checks": "Daily Operations",
  "Daily Cleaning": "Cleaning",
  "Weekly Cleaning": "Cleaning",
  "Monthly Cleaning": "Cleaning",
  "Laundry Checklist": "Cleaning",
  "Goods In Record": "Food Safety",
  "Goods Out Record": "Food Safety",
  "Hygiene Swab": "Food Safety",
  "Scale Calibration": "Equipment",
  "Probe Calibration": "Equipment",
  "Maintenance Report": "Equipment",
  "Employee Induction Checklist": "Team",
  "Food Safety Booklet Questionnaire": "Team",
  "Return to Work Approval": "Team",
  "Return to Work Self Assessment": "Team",
  "Complaint Form": "Incidents & Reports",
  "Corrective Action Report": "Incidents & Reports",
  "Visitor Sign In & Health Questionnaire": "Visitors",
};
