// Beacon-style "Finished Product Specification" PDF, rendered with
// @react-pdf/renderer. This module is ONLY ever loaded via dynamic import()
// from ProductSpecSheetPanel (react-pdf is heavy) — never import it statically.
//
// The document is deliberately dumb: every value arrives preformatted in
// props. All derivation (declaration, QUID, nutrition formatting, allergen
// mapping) happens in the panel so this file is pure layout.

import React from "react";
import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";

// No auto-hyphenation — long labels must wrap whole ("Including", not "Includ-ing")
Font.registerHyphenationCallback(word => [word]);
import type { CompanyDetails, SpecData } from "@/lib/spec-sheet";
import {
  SPEC_ALLERGENS, SUITABILITY_ROWS, IN_GENERAL_TEXT, WARRANTY_TEXT, APPROVAL_NOTE,
} from "@/lib/spec-sheet";

export interface DeclarationPart {
  name: string;
  bold: boolean;          // allergen-bearing → bold on the sheet
  quidPercent: string;    // e.g. "60%" — "" when no QUID required
}

export interface NutritionRow { label: string; value: string }

export interface SpecSheetPdfProps {
  productName: string;
  company: CompanyDetails;
  spec: SpecData;
  declarationParts: DeclarationPart[];
  nutritionRows: NutritionRow[];   // empty when the calc is incomplete
  packShotUrl: string | null;
}

const BORDER = "#4b4b4b";
const BAND = "#e9e6dd";

const s = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 30,
    paddingHorizontal: 30,
    fontSize: 8.5,
    fontFamily: "Helvetica",
    color: "#111",
    // NB no page-level lineHeight: it silently blanks any Text using a
    // render prop (the "Page: x of y" counter) — react-pdf bug, verified.
  },
  bold: { fontFamily: "Helvetica-Bold" },
  // Repeating document header
  header: { flexDirection: "row", borderWidth: 1, borderColor: BORDER, marginBottom: 8 },
  headerLeft: { flex: 2.1, borderRightWidth: 1, borderColor: BORDER, justifyContent: "space-between" },
  headerTitleBox: { flexGrow: 1, justifyContent: "center" },
  headerTitle: { fontFamily: "Helvetica-Bold", fontSize: 12.5, textAlign: "center", paddingVertical: 6 },
  headerSpecRow: { flexDirection: "row", borderTopWidth: 1, borderColor: BORDER },
  headerRight: { flex: 1 },
  hMetaRow: { flexDirection: "row", alignItems: "center", flexGrow: 1, borderBottomWidth: 1, borderColor: BORDER },
  hMetaRowLast: { flexDirection: "row", alignItems: "center", flexGrow: 1 },
  hMetaLabel: { flex: 1.1, fontFamily: "Helvetica-Bold", fontSize: 7, paddingVertical: 1.5, paddingHorizontal: 3, textAlign: "right" },
  hMetaValue: { flex: 1, fontSize: 7, paddingVertical: 1.5, paddingHorizontal: 3 },
  // Tables
  table: { borderWidth: 1, borderColor: BORDER, marginBottom: 8 },
  band: { backgroundColor: BAND, borderBottomWidth: 1, borderColor: BORDER, paddingVertical: 2.5 },
  bandText: { fontFamily: "Helvetica-Bold", fontSize: 9.5, textAlign: "center" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderColor: BORDER },
  rowLast: { flexDirection: "row" },
  cell: { paddingVertical: 3, paddingHorizontal: 4, borderRightWidth: 1, borderColor: BORDER },
  cellLast: { paddingVertical: 3, paddingHorizontal: 4 },
  label: { fontFamily: "Helvetica-Bold" },
  para: { paddingVertical: 3, paddingHorizontal: 5 },
  photoBox: { height: 300, alignItems: "center", justifyContent: "center", padding: 6 },
});

function Band({ children }: { children: string }) {
  return (
    <View style={s.band}>
      <Text style={s.bandText}>{children}</Text>
    </View>
  );
}

interface CellDef {
  text?: string;
  flex?: number;
  bold?: boolean;
  center?: boolean;
  children?: React.ReactNode;
}

function TRow({ cells, last }: { cells: CellDef[]; last?: boolean }) {
  return (
    <View style={last ? s.rowLast : s.row}>
      {cells.map((c, i) => (
        <View
          key={i}
          style={[
            i === cells.length - 1 ? s.cellLast : s.cell,
            { flex: c.flex ?? 1 },
          ]}
        >
          {c.children ?? (
            <Text style={[
              ...(c.bold ? [s.bold] : []),
              ...(c.center ? [{ textAlign: "center" as const }] : []),
            ]}>
              {c.text ?? ""}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

/** The doc-control header repeated at the top of every page. */
function DocHeader({ spec, productName }: { spec: SpecData; productName: string }) {
  const meta: [string, string][] = [
    ["Reference:", spec.reference],
    ["Updated By:", spec.updatedBy],
    ["Authorised By:", spec.authorisedBy],
    ["Version:", spec.version],
    ["Date:", spec.versionDate],
  ];
  return (
    <View style={s.header} fixed>
      <View style={s.headerLeft}>
        <View style={s.headerTitleBox}>
          <Text style={s.headerTitle}>Finished Product Specification</Text>
        </View>
        <View style={s.headerSpecRow}>
          <View style={[s.cell, { flex: 0.8 }]}><Text style={s.bold}>Spec Ref:</Text></View>
          <View style={[s.cell, { flex: 1.2 }]}><Text>{spec.productCode || productName}</Text></View>
          <View style={[s.cell, { flex: 0.8 }]}><Text style={s.bold}>Version:</Text></View>
          <View style={[s.cell, { flex: 0.5 }]}><Text>{spec.version}</Text></View>
          <View style={[s.cell, { flex: 0.9 }]}><Text style={s.bold}>Issue Date:</Text></View>
          <View style={[s.cellLast, { flex: 1 }]}><Text>{spec.issueDate}</Text></View>
        </View>
      </View>

      <View style={s.headerRight}>
        {meta.map(([label, value], i) => (
          <View key={label} style={s.hMetaRow}>
            <Text style={s.hMetaLabel}>{label}</Text>
            <Text style={s.hMetaValue}>{value}</Text>
          </View>
        ))}
        <View style={s.hMetaRowLast}>
          <Text style={s.hMetaLabel}>Page:</Text>
          <Text
            style={s.hMetaValue}
            fixed
            render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`}
          />
        </View>
      </View>
    </View>
  );
}

export function SpecSheetDocument(props: SpecSheetPdfProps) {
  const { productName, company, spec, declarationParts, nutritionRows, packShotUrl } = props;
  const contains = new Set(spec.allergenContains);
  const mayContain = new Set(spec.allergenMayContain);

  return (
    <Document title={`Product Spec — ${productName}`} author={company.supplierName}>
      <Page size="A4" style={s.page}>
        <DocHeader spec={spec} productName={productName} />

        {/* ── Company Information ─────────────────────────────────────── */}
        <View style={s.table} wrap={false}>
          <Band>Company Information</Band>
          <TRow cells={[{ text: "Supplier Name:", bold: true }, { text: company.supplierName, flex: 2.5 }]} />
          <TRow cells={[{ text: "Supplier Address:", bold: true }, { text: company.address, flex: 2.5 }]} />
          <TRow cells={[{ text: "Telephone Number:", bold: true }, { text: company.telephone, flex: 2.5 }]} />
          <TRow cells={[{ text: "Email:", bold: true }, { text: company.email, flex: 2.5 }]} />
          <TRow cells={[
            { text: "Contact Details:", bold: true },
            { text: "Commercial", bold: true, center: true, flex: 1.25 },
            { text: "Technical", bold: true, center: true, flex: 1.25 },
          ]} />
          <TRow cells={[
            { text: "Name:", bold: true },
            { text: company.commercial.name, center: true, flex: 1.25 },
            { text: company.technical.name, center: true, flex: 1.25 },
          ]} />
          <TRow cells={[
            { text: "Telephone:", bold: true },
            { text: company.commercial.phone, center: true, flex: 1.25 },
            { text: company.technical.phone, center: true, flex: 1.25 },
          ]} />
          <TRow last cells={[
            { text: "Email:", bold: true },
            { text: company.commercial.email, center: true, flex: 1.25 },
            { text: company.technical.email, center: true, flex: 1.25 },
          ]} />
        </View>

        {/* ── Product Information ─────────────────────────────────────── */}
        <View style={s.table}>
          <Band>Product Information</Band>
          <TRow cells={[
            { text: "Product Name:", bold: true },
            { text: productName, flex: 1.5 },
            { text: "Product Code:", bold: true, flex: 0.8 },
            { text: spec.productCode, flex: 0.7 },
          ]} />
          <TRow cells={[{ text: "Legal Name:", bold: true }, { text: spec.legalName, flex: 3 }]} />
          <TRow cells={[{ text: "Product Description:", bold: true }, { text: spec.description, flex: 3 }]} />
          <TRow cells={[{ text: "Net Quantity:", bold: true }, { text: spec.netQuantity, flex: 3 }]} />
          <TRow cells={[
            { text: "Ingredient Declaration (Including QUID & Allergens):", bold: true },
            {
              flex: 3,
              children: declarationParts.length ? (
                <Text>
                  {declarationParts.map((p, i) => (
                    <React.Fragment key={i}>
                      <Text style={p.bold ? s.bold : undefined}>{p.name}</Text>
                      {p.quidPercent ? <Text>{` (${p.quidPercent})`}</Text> : null}
                      <Text>{i < declarationParts.length - 1 ? ", " : "."}</Text>
                    </React.Fragment>
                  ))}
                </Text>
              ) : <Text /> ,
            },
          ]} />
          {nutritionRows.length > 0 && (
            <>
              <TRow cells={[
                { text: "Nutritional Information:", bold: true },
                { text: "Per 100g", bold: true, center: true, flex: 1.5 },
                { text: "Methodology (Analysis / Calculated)", bold: true, center: true, flex: 1.5 },
              ]} />
              {nutritionRows.map((r) => (
                <TRow key={r.label} cells={[
                  { text: r.label, center: true },
                  { text: r.value, center: true, flex: 1.5 },
                  { text: spec.methodology, center: true, flex: 1.5 },
                ]} />
              ))}
            </>
          )}
          <TRow cells={[
            { text: "Best Before / Use By:", bold: true },
            { text: spec.bbeText, flex: 1.5 },
            { text: "Format:", bold: true, flex: 0.8 },
            { text: spec.bbeFormat, flex: 0.7 },
          ]} />
          <TRow cells={[{ text: "Storage Conditions:", bold: true }, { text: spec.storage, flex: 3 }]} />
          <TRow last cells={[{ text: "Usage / Cooking Instructions:", bold: true }, { text: spec.usage, flex: 3 }]} />
        </View>

        {/* ── Allergen Information ──────────────────────────────────────
            Three mutually-exclusive states per allergen: an ingredient
            ("Contains"), a cross-contact risk from being handled on site
            ("May Contain"), or neither ("Free From"). */}
        <View style={s.table} wrap={false}>
          <Band>Allergen Information</Band>
          <TRow cells={[
            { text: "", flex: 3 },
            { text: "Free From", bold: true, center: true, flex: 0.7 },
            { text: "Contains", bold: true, center: true, flex: 0.7 },
            { text: "May Contain", bold: true, center: true, flex: 0.8 },
          ]} />
          {SPEC_ALLERGENS.map((a, i) => {
            const has = contains.has(a.key);
            // "Contains" wins: an ingredient is never also a may-contain.
            const may = !has && mayContain.has(a.key);
            return (
              <TRow key={a.key} last={i === SPEC_ALLERGENS.length - 1} cells={[
                { text: a.legal, flex: 3 },
                { text: !has && !may ? "X" : "", center: true, flex: 0.7 },
                { text: has ? "X" : "", center: true, flex: 0.7 },
                { text: may ? "X" : "", center: true, flex: 0.8 },
              ]} />
            );
          })}
        </View>

        {/* ── Product Suitability ─────────────────────────────────────── */}
        <View style={s.table} wrap={false}>
          <Band>Product Suitability</Band>
          <TRow cells={[
            { text: "Suitability Data", bold: true, center: true, flex: 3 },
            { text: "Yes", bold: true, center: true, flex: 0.7 },
            { text: "No", bold: true, center: true, flex: 0.7 },
            { text: "Certification", bold: true, center: true, flex: 0.7 },
          ]} />
          {SUITABILITY_ROWS.map((r, i) => {
            const v = spec.suitability[r.key] ?? { value: "", certification: "" };
            return (
              <TRow key={r.key} last={i === SUITABILITY_ROWS.length - 1} cells={[
                { text: r.label, flex: 3 },
                { text: v.value === "yes" ? "X" : "", center: true, flex: 0.7 },
                { text: v.value === "no" ? "X" : "", center: true, flex: 0.7 },
                { text: v.certification, center: true, flex: 0.7 },
              ]} />
            );
          })}
        </View>

        {/* ── Microbiological Analysis ──────────────────────────────────
            Omitted entirely when no targets are set — an empty table on a
            customer-facing spec looks like missing paperwork. */}
        {spec.micro.length > 0 && (
        <View style={s.table} wrap={false}>
          <Band>Microbiological Analysis</Band>
          <TRow cells={[
            { text: "Test", bold: true, center: true },
            { text: "Target", bold: true, center: true },
            { text: "Test", bold: true, center: true },
            { text: "Target", bold: true, center: true },
          ]} />
          {Array.from({ length: Math.ceil(spec.micro.length / 2) }, (_, i) => {
            const a = spec.micro[i * 2];
            const b = spec.micro[i * 2 + 1];
            return (
              <TRow key={i} last={i === Math.ceil(spec.micro.length / 2) - 1} cells={[
                { text: a?.test ?? "" },
                { text: a?.target ?? "", center: true },
                { text: b?.test ?? "" },
                { text: b?.target ?? "", center: true },
              ]} />
            );
          })}
        </View>
        )}

        {/* ── Organoleptic Attributes ─────────────────────────────────── */}
        <View style={s.table} wrap={false}>
          <Band>Organoleptic Attributes</Band>
          <TRow cells={[{ text: "Appearance:", bold: true }, { text: spec.organoleptic.appearance, flex: 3 }]} />
          <TRow cells={[{ text: "Aroma:", bold: true }, { text: spec.organoleptic.aroma, flex: 3 }]} />
          <TRow cells={[{ text: "Texture:", bold: true }, { text: spec.organoleptic.texture, flex: 3 }]} />
          <TRow last cells={[{ text: "Flavour:", bold: true }, { text: spec.organoleptic.flavour, flex: 3 }]} />
        </View>

        {/* ── Packaging Information ───────────────────────────────────── */}
        <View style={s.table} wrap={false}>
          <Band>Packaging Information</Band>
          <TRow cells={[
            { text: "", flex: 0.8 },
            { text: "Material", bold: true, center: true, flex: 1.4 },
            { text: "Dimensions", bold: true, center: true, flex: 1 },
            { text: "Weight", bold: true, center: true, flex: 0.8 },
          ]} />
          {spec.packaging.map((p, i) => (
            <TRow key={i} last={i === spec.packaging.length - 1} cells={[
              { text: p.level, bold: true, center: true, flex: 0.8 },
              { text: p.material, center: true, flex: 1.4 },
              { text: p.dimensions, center: true, flex: 1 },
              { text: p.weight, center: true, flex: 0.8 },
            ]} />
          ))}
        </View>

        {/* ── Product Photo ───────────────────────────────────────────── */}
        <View style={s.table} wrap={false}>
          <Band>Product Photo</Band>
          <View style={s.photoBox}>
            {packShotUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={packShotUrl} style={{ maxWidth: 280, maxHeight: 288, objectFit: "contain" }} />
            ) : (
              <Text style={{ color: "#999" }}>No pack shot uploaded</Text>
            )}
          </View>
        </View>

        {/* ── In General / Warranty ───────────────────────────────────── */}
        <View style={s.table} wrap={false}>
          <Band>In General</Band>
          <Text style={s.para}>{IN_GENERAL_TEXT}</Text>
        </View>
        <View style={s.table} wrap={false}>
          <Band>Warranty</Band>
          <Text style={s.para}>{WARRANTY_TEXT}</Text>
        </View>

        {/* ── Completed By ────────────────────────────────────────────── */}
        <View style={s.table} wrap={false}>
          <Band>Completed By</Band>
          <TRow cells={[{ text: "Completed By (Name):", bold: true }, { text: spec.completedBy.name, flex: 2.5 }]} />
          <TRow cells={[{ text: "On Behalf of (Company):", bold: true }, { text: spec.completedBy.company, flex: 2.5 }]} />
          <TRow cells={[{ text: "Position in Company:", bold: true }, { text: spec.completedBy.position, flex: 2.5 }]} />
          <TRow cells={[{ text: "Signature:", bold: true }, { text: spec.completedBy.signature, flex: 2.5 }]} />
          <TRow last cells={[{ text: "Date:", bold: true }, { text: spec.completedBy.date, flex: 2.5 }]} />
        </View>

        {/* ── Customer Approval ───────────────────────────────────────── */}
        <View style={s.table} wrap={false}>
          <Band>Customer Approval</Band>
          <Text style={[s.para, { textAlign: "center", fontSize: 7.5, color: "#333" }]}>{APPROVAL_NOTE}</Text>
          <TRow cells={[
            { text: "Specification Approved?", bold: true },
            { text: "Yes", center: true, flex: 1.25 },
            { text: "No", center: true, flex: 1.25 },
          ]} />
          <TRow cells={[{ text: "Approved By (Name):", bold: true }, { text: "", flex: 2.5 }]} />
          <TRow cells={[{ text: "On Behalf of (Company):", bold: true }, { text: "", flex: 2.5 }]} />
          <TRow cells={[{ text: "Position in Company:", bold: true }, { text: "", flex: 2.5 }]} />
          <TRow cells={[{ text: "Signature:", bold: true }, { text: "", flex: 2.5 }]} />
          <TRow last cells={[{ text: "Date:", bold: true }, { text: "", flex: 2.5 }]} />
        </View>

        {/* ── Amendment Log ───────────────────────────────────────────── */}
        <View style={s.table} wrap={false}>
          <Band>Amendment Log — Spec Information</Band>
          <TRow cells={[
            { text: "Date", bold: true, center: true, flex: 0.8 },
            { text: "Reason for Change", bold: true, center: true, flex: 2.2 },
            { text: "New Version", bold: true, center: true, flex: 0.7 },
            { text: "Updated By", bold: true, center: true, flex: 1 },
          ]} />
          {spec.amendments.map((a, i) => (
            <TRow key={i} last={i === spec.amendments.length - 1} cells={[
              { text: a.date, center: true, flex: 0.8 },
              { text: a.reason, flex: 2.2 },
              { text: a.version, center: true, flex: 0.7 },
              { text: a.updatedBy, center: true, flex: 1 },
            ]} />
          ))}
        </View>
      </Page>
    </Document>
  );
}
