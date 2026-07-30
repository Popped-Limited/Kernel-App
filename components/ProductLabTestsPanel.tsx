"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { fetchAll } from "@/lib/fetchAll";
import { useOrganisation } from "@/contexts/OrganisationContext";

interface LabTest {
  id: string;
  product_name: string;
  test_date: string;
  test_type: string;
  lab_name: string;
  batch_code: string;
  result: string;
  notes: string;
  file_name: string | null;
  file_path: string | null;
  uploaded_by: string;
  created_at: string;
}

const TEST_TYPE_SUGGESTIONS = [
  "Microbiological",
  "Nutritional analysis",
  "Shelf life",
  "Water activity",
  "Allergen",
  "pH",
];

const RESULT_OPTIONS = [
  ["", "See report"],
  ["satisfactory", "Satisfactory"],
  ["borderline", "Borderline"],
  ["unsatisfactory", "Unsatisfactory"],
] as const;

const ACCEPTED = /\.(pdf|png|jpe?g)$/i;

function publicUrl(path: string) {
  return supabase.storage.from("compliance-docs").getPublicUrl(path).data.publicUrl;
}

function formatTestDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ResultBadge({ result }: { result: string }) {
  if (result === "satisfactory") {
    return <span className="badge bg-green-100 text-green-700">Satisfactory</span>;
  }
  if (result === "borderline") {
    return <span className="badge bg-amber-100 text-amber-700">Borderline</span>;
  }
  if (result === "unsatisfactory") {
    return <span className="badge bg-red-100 text-red-600">Unsatisfactory</span>;
  }
  return null;
}

const EMPTY_FORM = {
  test_date: "",
  test_type: "",
  lab_name: "",
  batch_code: "",
  result: "",
  notes: "",
};

export default function ProductLabTestsPanel({ productName }: { productName: string }) {
  const { orgId } = useOrganisation();
  const [tests, setTests] = useState<LabTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    // Exact case-insensitive name match — escape ilike wildcards so a product
    // name containing % or _ can't turn into a pattern match.
    const escaped = productName.replace(/[\\%_]/g, m => "\\" + m);
    try {
      const rows = await fetchAll<LabTest>((from, to) => supabase
        .from("lab_tests")
        .select("*")
        .eq("organisation_id", orgId)
        .ilike("product_name", escaped)
        .order("test_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to));
      setTests(rows);
    } catch {
      setTests([]);
    }
    setLoading(false);
  }, [orgId, productName]);

  useEffect(() => { load(); }, [load]);

  function openForm() {
    setForm({ ...EMPTY_FORM, test_date: todayISO() });
    setFile(null);
    setFormError("");
    setShowForm(true);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f && !ACCEPTED.test(f.name)) {
      setFormError("Please attach the report as a PDF, PNG or JPEG.");
      if (fileRef.current) fileRef.current.value = "";
      setFile(null);
      return;
    }
    setFormError("");
    setFile(f);
  }

  async function save() {
    if (!orgId) return;
    if (!form.test_date) { setFormError("Enter the test date."); return; }
    if (!form.test_type.trim()) { setFormError("Enter the test type."); return; }

    setSaving(true);
    setFormError("");

    // Upload the report first — an upload failure blocks the save so a record
    // never claims a report it doesn't have.
    let filePath: string | null = null;
    if (file) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const safeProduct = productName.replace(/[^a-zA-Z0-9._-]/g, "_");
      filePath = `lab-tests/${orgId}/${safeProduct}/${Date.now()}_${safeName}`;
      const { error: storageError } = await supabase.storage
        .from("compliance-docs")
        .upload(filePath, file, { contentType: file.type || undefined });
      if (storageError) {
        setFormError("Report upload failed: " + storageError.message);
        setSaving(false);
        return;
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    const uploadedBy = (user?.user_metadata?.full_name as string | undefined)?.trim() || user?.email || "";

    const { error: dbError } = await supabase.from("lab_tests").insert({
      organisation_id: orgId,
      product_name: productName,
      test_date: form.test_date,
      test_type: form.test_type.trim(),
      lab_name: form.lab_name.trim(),
      batch_code: form.batch_code.trim(),
      result: form.result,
      notes: form.notes.trim(),
      file_name: file ? file.name : null,
      file_path: filePath,
      uploaded_by: uploadedBy,
    });

    if (dbError) {
      setFormError("Failed to save: " + dbError.message);
      setSaving(false);
      return;
    }

    setShowForm(false);
    setSaving(false);
    await load();
  }

  async function deleteTest(t: LabTest) {
    if (!confirm(`Delete the ${t.test_type || "lab"} test from ${formatTestDate(t.test_date)}? This cannot be undone.`)) return;
    if (t.file_path) {
      await supabase.storage.from("compliance-docs").remove([t.file_path]);
    }
    await supabase.from("lab_tests").delete().eq("id", t.id);
    setTests(prev => prev.filter(x => x.id !== t.id));
  }

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Lab tests</h2>
          {!showForm && (
            <button
              type="button"
              onClick={openForm}
              disabled={!orgId}
              className="inline-flex items-center gap-1 text-xs font-medium text-brown hover:underline disabled:opacity-50"
            >
              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M6 1v10M1 6h10"/>
              </svg>
              Log a test
            </button>
          )}
        </div>

        {showForm && (
          <div className="p-4 border-b border-gray-200 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Test date</label>
                <input
                  type="date"
                  className="input"
                  value={form.test_date}
                  onChange={e => setForm(f => ({ ...f, test_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Test type</label>
                <input
                  type="text"
                  className="input"
                  list="lab-test-types"
                  placeholder="e.g. Microbiological"
                  value={form.test_type}
                  onChange={e => setForm(f => ({ ...f, test_type: e.target.value }))}
                />
                <datalist id="lab-test-types">
                  {TEST_TYPE_SUGGESTIONS.map(t => <option key={t} value={t} />)}
                </datalist>
              </div>
              <div>
                <label className="label">Lab</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Optional"
                  value={form.lab_name}
                  onChange={e => setForm(f => ({ ...f, lab_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Batch code tested</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Optional"
                  value={form.batch_code}
                  onChange={e => setForm(f => ({ ...f, batch_code: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Result</label>
                <select
                  className="input"
                  value={form.result}
                  onChange={e => setForm(f => ({ ...f, result: e.target.value }))}
                >
                  {RESULT_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Report</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
                  className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-cream file:px-3 file:py-2 file:text-sm file:font-medium file:text-brown hover:file:bg-brand-light"
                  onChange={handleFileChange}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Notes</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Optional"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            {formError && <p className="text-sm text-red-500">{formError}</p>}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-brown px-3.5 py-2 text-sm font-medium text-white hover:bg-brown/90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save test"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                disabled={saving}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : tests.length === 0 ? (
          !showForm && (
            <div className="p-8 text-center text-sm text-gray-400">
              No lab tests yet — log a test and attach the lab report.
            </div>
          )
        ) : (
          <ul className="divide-y divide-gray-100">
            {tests.map(t => (
              <li key={t.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">{t.test_type || "Lab test"}</span>
                      <span className="text-gray-400"> · {formatTestDate(t.test_date)}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {[
                        t.lab_name,
                        t.batch_code && `Batch ${t.batch_code}`,
                        t.uploaded_by,
                      ].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <ResultBadge result={t.result} />
                  {t.file_path ? (
                    <a
                      href={publicUrl(t.file_path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-brown hover:underline shrink-0"
                    >
                      Report →
                    </a>
                  ) : (
                    <span className="text-xs text-gray-300 shrink-0">No report</span>
                  )}
                  <button
                    onClick={() => deleteTest(t)}
                    className="text-gray-300 hover:text-red-500 transition leading-none shrink-0 text-base"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
                {t.notes && <p className="text-xs text-gray-500 mt-1.5 whitespace-pre-wrap">{t.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
