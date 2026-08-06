// Product spec sheets — shared types, defaults and boilerplate for the
// Beacon-style "Finished Product Specification" PDF. The editable, spec-only
// fields live in product_spec_sheets.data (jsonb); everything derivable
// (ingredient declaration, QUID, allergens, nutrition, net quantity) is
// computed at render time from the recipe + product settings and NEVER stored
// here, so the PDF can't drift out of date with the recipe.

export interface SpecContact {
  name: string;
  phone: string;
  email: string;
}

/** Org-level Company Information block (spec_company_details.data). */
export interface CompanyDetails {
  supplierName: string;
  address: string;
  telephone: string;
  email: string;
  commercial: SpecContact;
  technical: SpecContact;
}

export interface MicroRow { test: string; target: string }
export interface PackagingRow { level: string; material: string; dimensions: string; weight: string }
export interface AmendmentRow { date: string; reason: string; version: string; updatedBy: string }
export interface SuitabilityValue { value: "yes" | "no" | ""; certification: string }

/** Per-product editable spec fields (product_spec_sheets.data). */
export interface SpecData {
  // Document control (top-right header block)
  reference: string;
  updatedBy: string;
  authorisedBy: string;
  version: string;
  versionDate: string;
  // Spec ref row
  productCode: string;
  issueDate: string;
  // Product information
  legalName: string;
  description: string;
  netQuantity: string;
  methodology: string;       // nutrition methodology: Calculated / Analysis
  bbeText: string;           // e.g. "12 months from manufacture"
  bbeFormat: string;         // e.g. "DD/MM/YYYY"
  storage: string;
  usage: string;
  // Allergens — two independent answers per allergen, both short names from the
  // raw-materials list. These are different declarations and must not be merged:
  //   allergenContains  = present as an ingredient, declared "Contains"
  //   allergenMayContain = not an ingredient, but a cross-contact risk from
  //                        being handled on site, declared "May contain"
  // An allergen in neither list is Free From.
  allergenContains: string[];
  allergenMayContain: string[];
  suitability: Record<string, SuitabilityValue>;
  micro: MicroRow[];
  organoleptic: { appearance: string; aroma: string; texture: string; flavour: string };
  packaging: PackagingRow[];
  completedBy: { name: string; company: string; position: string; signature: string; date: string };
  amendments: AmendmentRow[];
}

/** The 14 UK/EU allergens: short name (as stored on raw materials) → the
 *  legal wording used on the spec sheet's allergen table. Order matches the
 *  Beacon template. */
export const SPEC_ALLERGENS: { key: string; legal: string }[] = [
  { key: "Gluten",      legal: "Cereals containing gluten (wheat, rye, barley, oats, spelt, kamut or their hybridised strains) and products thereof" },
  { key: "Crustaceans", legal: "Crustaceans and products thereof" },
  { key: "Eggs",        legal: "Eggs and products thereof" },
  { key: "Fish",        legal: "Fish and products thereof" },
  { key: "Peanuts",     legal: "Peanuts and products thereof" },
  { key: "Soya",        legal: "Soybeans and products thereof" },
  { key: "Milk",        legal: "Milk and products thereof (including lactose)" },
  { key: "Tree nuts",   legal: "Nuts: almond, hazelnut, walnut, cashew, pecan, Brazil, pistachio, macadamia and Queensland and products thereof" },
  { key: "Celery",      legal: "Celery and products thereof" },
  { key: "Mustard",     legal: "Mustard and products thereof" },
  { key: "Sesame",      legal: "Sesame seeds and products thereof" },
  { key: "Sulphites",   legal: "Sulphur dioxide and sulphites at concentrations of more than 10 mg/kg or 10 mg/litre expressed as SO2" },
  { key: "Lupin",       legal: "Lupin and products thereof" },
  { key: "Molluscs",    legal: "Molluscs and products thereof" },
];

export const SUITABILITY_ROWS: { key: string; label: string }[] = [
  { key: "vegetarians",  label: "Suitable for Vegetarians" },
  { key: "vegans",       label: "Suitable for Vegans" },
  { key: "coeliacs",     label: "Suitable for Coeliacs" },
  { key: "gmFree",       label: "Free from genetically modified material" },
  { key: "geneTechFree", label: "Free from products of gene technology" },
  { key: "enzymeFree",   label: "Free from enzymes of gene technology" },
  { key: "siteGmFree",   label: "Manufacturing site free from GM ingredients" },
];

// Micro targets are DELIBERATELY not seeded. A limit on a customer-facing
// specification is a commitment about a specific product, so it has to come
// from that product's own lab reports (or be typed knowingly) — never from a
// built-in list that would quietly put the same numbers on every product in
// every org. Write limits in plain text: the PDF's built-in Helvetica has no
// superscript glyphs, so "<1,000 cfu/g", never "10³".

export const IN_GENERAL_TEXT =
  "The final pack will be aesthetically presentable, and to an agreed standard. All materials used shall be " +
  "of approved quality and handled under clean, hygienic conditions. Adequate process control and quality " +
  "assurance procedures are employed. Records of these are available for inspection.";

export const WARRANTY_TEXT =
  "All products shall fully comply with the Food Safety Act 1990; Regulation (EC) No 852/2004 on the hygiene " +
  "of foodstuffs (as retained in UK law and amended); Regulation (EU) No 1169/2011 on the provision of food " +
  "information to consumers (as implemented in the UK by the Food Information Regulations 2014, as amended); " +
  "the Consumer Protection Act 1987; the Weights and Measures Act 1985; and all other applicable UK food legislation.";

export const APPROVAL_NOTE =
  "(Where the specification is not signed and returned within 7 days, it is assumed the specification has " +
  "been approved and accepted by the company)";

export function todayUK(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function defaultCompanyDetails(orgName: string): CompanyDetails {
  return {
    supplierName: orgName,
    address: "",
    telephone: "",
    email: "",
    commercial: { name: "", phone: "", email: "" },
    technical: { name: "", phone: "", email: "" },
  };
}

export interface SpecDefaultsInput {
  productName: string;
  orgName: string;
  userName: string;
  netWeight: string;              // grams, from product settings ("" if unset)
  contains: string[];             // short allergen names from the recipe
  mayContain: string[];
  primaryPackaging: string[];     // mapped jar/closure raw-material names
}

export function defaultSpecData(input: SpecDefaultsInput): SpecData {
  const { contains, mayContain } = input;
  // Every suitability row starts UNSET. It's tempting to infer these from the
  // recipe's allergens, but allergen data can't answer them: beef, gelatine,
  // honey and rennet aren't allergens, so a meat product would default to
  // "Suitable for Vegans: Yes". The GM rows have no evidence behind them at
  // all. These are claims the business makes to its customer — Kernel shows
  // what it knows (see the gluten hint on the Spec sheet tab) and lets a human
  // answer.
  const suitability: Record<string, SuitabilityValue> = Object.fromEntries(
    SUITABILITY_ROWS.map(r => [r.key, { value: "" as const, certification: "" }]),
  );

  return {
    // NOT pre-filled: the document reference is the org's own QMS form number
    // (the example sheet's "F3.6a" is Beacon's, not every customer's), and
    // storage conditions are a claim about this specific product — an ambient
    // default would quietly mislabel a chilled or frozen one.
    reference: "",
    updatedBy: input.userName,
    // Blank on purpose: authorising is a sign-off, not a fact about who's
    // logged in. Pre-filling it would put someone's name against an approval
    // they haven't given, and it collapses the updated-by/authorised-by
    // separation the form exists to record (an auditor expects two people
    // once the business has two).
    authorisedBy: "",
    version: "1",
    versionDate: todayUK(),
    productCode: "",
    issueDate: todayUK(),
    legalName: input.productName,
    description: "",
    netQuantity: input.netWeight ? `${input.netWeight}g` : "",
    methodology: "Calculated",
    bbeText: "",
    bbeFormat: "DD/MM/YYYY",
    storage: "",
    usage: "",
    // Seeded from the recipe, which already knows both: `contains` from the
    // ingredients' own allergens, `mayContain` from their may-contain
    // declarations. Both stay editable — the recipe can't know about
    // cross-contact from other products sharing the kitchen.
    allergenContains: [...contains].sort(),
    allergenMayContain: mayContain.filter(a => !contains.includes(a)).sort(),
    suitability,
    micro: [],
    organoleptic: { appearance: "", aroma: "", texture: "", flavour: "" },
    packaging: [
      { level: "Primary",   material: input.primaryPackaging.join(" & "), dimensions: "", weight: "" },
      { level: "Secondary", material: "", dimensions: "", weight: "" },
      { level: "Tertiary",  material: "", dimensions: "", weight: "" },
    ],
    completedBy: { name: input.userName, company: input.orgName, position: "", signature: "", date: todayUK() },
    amendments: [{ date: todayUK(), reason: "New spec", version: "1", updatedBy: input.userName }],
  };
}

/** Overlay a saved jsonb blob onto fresh defaults so fields added after the
 *  row was saved still appear (saved wins wherever it has a value). */
export function mergeSpecData(defaults: SpecData, saved: Partial<SpecData> | null | undefined): SpecData {
  if (!saved || typeof saved !== "object") return defaults;
  // Rows saved before allergens were split carried one `handledOnSite` list.
  // That list meant "present on site", which is the may-contain question — so
  // it migrates there, minus anything the recipe says is an actual ingredient.
  const legacy = (saved as { handledOnSite?: unknown }).handledOnSite;
  const legacyOnSite = Array.isArray(legacy) ? (legacy as string[]) : null;
  const contains = Array.isArray(saved.allergenContains) ? saved.allergenContains : defaults.allergenContains;
  const mayContain = Array.isArray(saved.allergenMayContain)
    ? saved.allergenMayContain
    : legacyOnSite
      ? legacyOnSite.filter(a => !contains.includes(a))
      : defaults.allergenMayContain;

  const merged: SpecData = {
    ...defaults,
    ...saved,
    organoleptic: { ...defaults.organoleptic, ...(saved.organoleptic ?? {}) },
    completedBy: { ...defaults.completedBy, ...(saved.completedBy ?? {}) },
    suitability: { ...defaults.suitability, ...(saved.suitability ?? {}) },
    allergenContains: contains,
    allergenMayContain: mayContain,
    micro: Array.isArray(saved.micro) && saved.micro.length ? saved.micro : defaults.micro,
    packaging: Array.isArray(saved.packaging) && saved.packaging.length ? saved.packaging : defaults.packaging,
    amendments: Array.isArray(saved.amendments) && saved.amendments.length ? saved.amendments : defaults.amendments,
  };
  return merged;
}

export function mergeCompanyDetails(defaults: CompanyDetails, saved: Partial<CompanyDetails> | null | undefined): CompanyDetails {
  if (!saved || typeof saved !== "object") return defaults;
  return {
    ...defaults,
    ...saved,
    commercial: { ...defaults.commercial, ...(saved.commercial ?? {}) },
    technical: { ...defaults.technical, ...(saved.technical ?? {}) },
  };
}
