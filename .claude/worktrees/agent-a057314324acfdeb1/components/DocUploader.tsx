"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

interface Doc {
  id: string;
  file_name: string;
  file_path: string;
  doc_type: string;
  uploaded_at: string;
}

interface Props {
  entityType: "supplier" | "ingredient" | "supply" | "packaging";
  entityId: string;
  docType: "spec_sheet" | "coshh" | "accreditation" | "other";
  label: string;
}

function PdfIcon() {
  return (
    <svg className="h-4 w-4 text-red-400 shrink-0" viewBox="0 0 16 20" fill="none">
      <path d="M10 0H2a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V6l-6-6z" fill="#fee2e2" stroke="#f87171" strokeWidth="1"/>
      <path d="M10 0v6h6" stroke="#f87171" strokeWidth="1" fill="none"/>
      <text x="2" y="15" fontSize="5" fill="#ef4444" fontWeight="bold" fontFamily="sans-serif">PDF</text>
    </svg>
  );
}

export default function DocUploader({ entityType, entityId, docType, label }: Props) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (entityId) loadDocs();
  }, [entityId, docType]);

  async function loadDocs() {
    const { data } = await supabase
      .from("documents")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("doc_type", docType)
      .order("uploaded_at", { ascending: false });
    if (data) setDocs(data as Doc[]);
  }

  function getPublicUrl(path: string) {
    return supabase.storage.from("compliance-docs").getPublicUrl(path).data.publicUrl;
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      alert("Please upload a PDF file.");
      return;
    }

    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${entityType}/${entityId}/${docType}/${Date.now()}_${safeName}`;

    const { error: storageError } = await supabase.storage
      .from("compliance-docs")
      .upload(path, file, { contentType: "application/pdf" });

    if (storageError) {
      alert("Upload failed: " + storageError.message);
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const { error: dbError } = await supabase.from("documents").insert({
      entity_type: entityType,
      entity_id: entityId,
      doc_type: docType,
      file_name: file.name,
      file_path: path,
    });

    if (dbError) {
      alert("Saved to storage but failed to record: " + dbError.message);
    }

    await loadDocs();
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function deleteDoc(doc: Doc) {
    if (!confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return;
    await supabase.storage.from("compliance-docs").remove([doc.file_path]);
    await supabase.from("documents").delete().eq("id", doc.id);
    setDocs(prev => prev.filter(d => d.id !== doc.id));
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{label}</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 text-xs font-medium text-brown hover:underline disabled:opacity-50"
        >
          {uploading ? (
            <span className="animate-pulse">Uploading…</span>
          ) : (
            <>
              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M6 1v7M3 5l3-4 3 4M1 9v1a1 1 0 001 1h8a1 1 0 001-1V9"/>
              </svg>
              Upload PDF
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {docs.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No documents yet — upload a PDF above.</p>
      ) : (
        <ul className="space-y-1.5">
          {docs.map(doc => (
            <li key={doc.id} className="flex items-center gap-2 rounded bg-white border border-gray-200 px-2.5 py-1.5">
              <PdfIcon />
              <a
                href={getPublicUrl(doc.file_path)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-xs text-gray-800 hover:text-brown hover:underline truncate font-medium"
              >
                {doc.file_name}
              </a>
              <span className="text-[10px] text-gray-400 shrink-0">
                {new Date(doc.uploaded_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              <button
                onClick={() => deleteDoc(doc)}
                className="text-gray-300 hover:text-red-500 transition leading-none shrink-0 text-base"
                title="Delete"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
