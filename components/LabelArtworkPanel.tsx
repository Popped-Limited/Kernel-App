"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { fetchAll } from "@/lib/fetchAll";
import { useOrganisation } from "@/contexts/OrganisationContext";

/** One FIC mandatory particular's result from the AI check */
interface Particular {
  key: string;
  status: "included" | "mismatch" | "not_found" | "unclear";
  evidence: string;
}

interface CheckResult {
  particulars: Particular[];
  overall_notes: string[];
}

interface LabelArtwork {
  id: string;
  product_name: string;
  version: number;
  file_name: string;
  file_path: string;
  uploaded_by: string;
  uploaded_at: string;
  check_result: CheckResult | null;
  check_run_at: string | null;
}

const PARTICULAR_LABELS: Record<string, string> = {
  name_of_food: "Name of the food",
  ingredients_list: "Ingredients list",
  allergen_emphasis: "Allergens emphasised in ingredients",
  quid: "QUID percentages",
  net_quantity: "Net quantity",
  date_marking: "Date marking",
  storage_conditions: "Storage & instructions for use",
  business_name_address: "Business name & address",
};

const ACCEPTED = /\.(pdf|png|jpe?g)$/i;

function isImage(fileName: string) {
  return /\.(png|jpe?g)$/i.test(fileName);
}

function publicUrl(path: string) {
  return supabase.storage.from("compliance-docs").getPublicUrl(path).data.publicUrl;
}

function formatUploadDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function StatusMark({ status }: { status: Particular["status"] }) {
  if (status === "included") {
    return <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-bold shrink-0">✓</span>;
  }
  if (status === "not_found" || status === "mismatch") {
    return <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600 text-xs font-bold shrink-0">✕</span>;
  }
  return <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-bold shrink-0">?</span>;
}

function statusLabel(status: Particular["status"]) {
  if (status === "included") return "Included";
  if (status === "mismatch") return "Doesn't match";
  if (status === "not_found") return "Not found";
  return "Unclear";
}

/** The check is presence + consistency with your recipe data — never a legal opinion. Shown wherever results render. */
function Disclaimer() {
  return (
    <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
      This checks each section is present and matches this product&apos;s recipe data in Kernel — it is not a legal compliance review.
      Verify everything before print.
    </p>
  );
}

function CheckResults({ artwork }: { artwork: LabelArtwork }) {
  if (!artwork.check_result) return null;
  const { particulars, overall_notes } = artwork.check_result;
  return (
    <div className="space-y-2">
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {particulars.map(p => (
          <div key={p.key} className="flex items-start gap-3 px-3 py-2.5">
            <StatusMark status={p.status} />
            <div className="min-w-0">
              <p className="text-sm text-gray-900">
                {PARTICULAR_LABELS[p.key] ?? p.key}
                <span className={`ml-2 text-xs font-semibold ${
                  p.status === "included" ? "text-green-700"
                    : p.status === "not_found" || p.status === "mismatch" ? "text-red-600"
                    : "text-amber-700"
                }`}>{statusLabel(p.status)}</span>
              </p>
              {p.evidence && <p className="text-xs text-gray-500 mt-0.5">{p.evidence}</p>}
            </div>
          </div>
        ))}
      </div>
      {overall_notes.length > 0 && (
        <ul className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
          {overall_notes.map((note, i) => (
            <li key={i} className="text-xs text-amber-800">{note}</li>
          ))}
        </ul>
      )}
      {artwork.check_run_at && (
        <p className="text-[11px] text-gray-400">
          Checked {formatUploadDate(artwork.check_run_at)} · v{artwork.version}
        </p>
      )}
    </div>
  );
}

export default function LabelArtworkPanel({ productName }: { productName: string }) {
  const { orgId } = useOrganisation();
  const [artworks, setArtworks] = useState<LabelArtwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    // Exact case-insensitive name match — escape ilike wildcards so a product
    // name containing % or _ can't turn into a pattern match.
    const escaped = productName.replace(/[\\%_]/g, m => "\\" + m);
    try {
      const rows = await fetchAll<LabelArtwork>((from, to) => supabase
        .from("label_artworks")
        .select("*")
        .eq("organisation_id", orgId)
        .ilike("product_name", escaped)
        .order("version", { ascending: false })
        .range(from, to));
      setArtworks(rows);
    } catch {
      setArtworks([]);
    }
    setLoading(false);
  }, [orgId, productName]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;
    if (!ACCEPTED.test(file.name)) {
      alert("Please upload the label as a PDF, PNG or JPEG.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const safeProduct = productName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `label-artwork/${orgId}/${safeProduct}/${Date.now()}_${safeName}`;

    const { error: storageError } = await supabase.storage
      .from("compliance-docs")
      .upload(path, file, { contentType: file.type || undefined });

    if (storageError) {
      alert("Upload failed: " + storageError.message);
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const uploadedBy = (user?.user_metadata?.full_name as string | undefined)?.trim() || user?.email || "";

    const { error: dbError } = await supabase.from("label_artworks").insert({
      organisation_id: orgId,
      product_name: productName,
      version: (artworks[0]?.version ?? 0) + 1,
      file_name: file.name,
      file_path: path,
      uploaded_by: uploadedBy,
    });

    if (dbError) {
      alert("Saved to storage but failed to record: " + dbError.message);
    }

    setCheckError("");
    await load();
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function deleteArtwork(art: LabelArtwork) {
    if (!confirm(`Delete "${art.file_name}" (v${art.version})? This cannot be undone.`)) return;
    await supabase.storage.from("compliance-docs").remove([art.file_path]);
    await supabase.from("label_artworks").delete().eq("id", art.id);
    setArtworks(prev => prev.filter(a => a.id !== art.id));
  }

  async function runCheck(artworkId: string) {
    setChecking(true);
    setCheckError("");
    try {
      const res = await fetch("/api/check-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artwork_id: artworkId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCheckError(json.error ?? "Check failed — try again in a moment.");
      } else {
        setArtworks(prev => prev.map(a =>
          a.id === artworkId ? { ...a, check_result: json.check_result, check_run_at: json.check_run_at } : a
        ));
      }
    } catch {
      setCheckError("Check failed — try again in a moment.");
    }
    setChecking(false);
  }

  const current = artworks[0] ?? null;
  const history = artworks.slice(1);

  return (
    <div className="space-y-6">

      {/* Current artwork */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Label artwork</h2>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || !orgId}
            className="inline-flex items-center gap-1 text-xs font-medium text-brown hover:underline disabled:opacity-50"
          >
            {uploading ? (
              <span className="animate-pulse">Uploading…</span>
            ) : (
              <>
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M6 1v7M3 5l3-4 3 4M1 9v1a1 1 0 001 1h8a1 1 0 001-1V9"/>
                </svg>
                {current ? "Upload new version" : "Upload artwork"}
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
            className="hidden"
            onChange={handleUpload}
          />
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : !current ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No label artwork yet — upload the label as a PDF, PNG or JPEG.
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              {isImage(current.file_name) && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={publicUrl(current.file_path)}
                  alt={`Label artwork v${current.version}`}
                  className="h-24 w-24 object-contain rounded border border-gray-200 bg-white shrink-0"
                />
              )}
              <div className="min-w-0">
                <a
                  href={publicUrl(current.file_path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-gray-900 hover:text-brown hover:underline break-all"
                >
                  {current.file_name}
                </a>
                <p className="text-xs text-gray-500 mt-0.5">
                  v{current.version} · Current · {formatUploadDate(current.uploaded_at)}
                  {current.uploaded_by ? ` · ${current.uploaded_by}` : ""}
                </p>
              </div>
            </div>

            {/* Label check */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => runCheck(current.id)}
                  disabled={checking}
                  className="rounded-lg bg-brown px-3.5 py-2 text-sm font-medium text-white hover:bg-brown/90 disabled:opacity-50"
                >
                  {checking
                    ? "Checking label… (can take ~30s)"
                    : current.check_result ? "Re-run check" : "Run label check"}
                </button>
                {!current.check_result && !checking && (
                  <span className="text-xs text-gray-400">Not checked yet</span>
                )}
              </div>
              {checkError && <p className="text-sm text-red-500">{checkError}</p>}
              <Disclaimer />
              <CheckResults artwork={current} />
            </div>
          </div>
        )}
      </div>

      {/* Version history */}
      {history.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Version history</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {history.map(art => (
              <li key={art.id} className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-gray-400 shrink-0 w-8">v{art.version}</span>
                  <a
                    href={publicUrl(art.file_path)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-sm text-gray-800 hover:text-brown hover:underline truncate"
                  >
                    {art.file_name}
                  </a>
                  <span className="text-xs text-gray-400 shrink-0">
                    {formatUploadDate(art.uploaded_at)}{art.uploaded_by ? ` · ${art.uploaded_by}` : ""}
                  </span>
                  {art.check_result ? (
                    <button
                      type="button"
                      onClick={() => setExpandedId(expandedId === art.id ? null : art.id)}
                      className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 hover:bg-green-100 shrink-0"
                    >
                      Checked ✓{art.check_run_at ? ` ${formatUploadDate(art.check_run_at)}` : ""}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5 shrink-0">
                      Not checked
                    </span>
                  )}
                  <button
                    onClick={() => deleteArtwork(art)}
                    className="text-gray-300 hover:text-red-500 transition leading-none shrink-0 text-base"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
                {expandedId === art.id && art.check_result && (
                  <div className="mt-3 space-y-2">
                    <Disclaimer />
                    <CheckResults artwork={art} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
