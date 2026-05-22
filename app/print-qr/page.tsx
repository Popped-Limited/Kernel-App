"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Checklist } from "@/lib/types";
import { frequencyLabel } from "@/lib/utils";
import QRCode from "qrcode";
import Link from "next/link";
import PortalShell from "@/components/PortalShell";

export default function PrintQRPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-sm text-gray-500">Loading…</div>}>
      <PrintQRContent />
    </Suspense>
  );
}

function PrintQRContent() {
  const searchParams = useSearchParams();
  const filterId = searchParams.get("id");

  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const appUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL ?? "https://kernelapp.co.uk";

  useEffect(() => {
    async function load() {
      let query = supabase.from("checklists").select("*").eq("active", true).order("name");
      if (filterId) query = query.eq("id", filterId);
      const { data } = await query;
      if (data) setChecklists(data);
      setLoading(false);
    }
    load();
  }, [filterId]);

  // Single-QR A4 print view
  if (filterId) {
    return (
      <SinglePrintView
        checklist={checklists[0] ?? null}
        loading={loading}
        appUrl={appUrl}
      />
    );
  }

  // Grid view — click any card to open its A4 print view
  return (
    <PortalShell>
      <div className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/home" className="btn-ghost text-xs px-2">← Dashboard</Link>
          <span className="text-sm font-semibold text-gray-900">Print QR Codes</span>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <p className="text-sm text-gray-500 mb-6">
          Click any checklist to open a print-ready A4 sheet. Print or save as PDF from your browser.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-500">Loading…</div>
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {checklists.map((cl) => (
              <GridCard key={cl.id} checklist={cl} baseUrl={appUrl} />
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}

function GridCard({ checklist, baseUrl }: { checklist: Checklist; baseUrl: string }) {
  const [qrSrc, setQrSrc] = useState<string>("");
  const url = checklist.public_token
    ? `${baseUrl}/c/${checklist.public_token}`
    : `${baseUrl}/checklist/${checklist.id}`;

  useEffect(() => {
    QRCode.toDataURL(url, {
      width: 180,
      margin: 2,
      color: { dark: "#111827", light: "#ffffff" },
    }).then(setQrSrc).catch(console.error);
  }, [url]);

  function openPrintView() {
    window.open(`/print-qr?id=${checklist.id}`, "_blank");
  }

  return (
    <button
      onClick={openPrintView}
      className="group flex flex-col items-center rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-brand transition-all text-left w-full"
    >
      {qrSrc
        ? /* eslint-disable-next-line @next/next/no-img-element */
          <img src={qrSrc} alt={`QR for ${checklist.name}`} className="w-[140px] h-[140px] rounded" />
        : <div className="w-[140px] h-[140px] rounded bg-gray-100 animate-pulse" />
      }
      <p className="mt-3 text-center text-sm font-bold text-gray-900 leading-tight group-hover:text-brand transition-colors">
        {checklist.name}
      </p>
      <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 uppercase tracking-wide">
        {frequencyLabel(checklist.frequency as never)}
      </span>
      <p className="mt-3 text-[10px] text-brand font-medium opacity-0 group-hover:opacity-100 transition-opacity">
        Click to print A4 →
      </p>
    </button>
  );
}

function SinglePrintView({
  checklist,
  loading,
  appUrl,
}: {
  checklist: Checklist | null;
  loading: boolean;
  appUrl: string;
}) {
  const [qrSrc, setQrSrc] = useState<string>("");
  const hasPrinted = useRef(false);

  const url = checklist
    ? checklist.public_token
      ? `${appUrl}/c/${checklist.public_token}`
      : `${appUrl}/checklist/${checklist.id}`
    : "";

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, {
      width: 600,
      margin: 2,
      color: { dark: "#111827", light: "#ffffff" },
    }).then(setQrSrc).catch(console.error);
  }, [url]);

  // Auto-open print dialog once QR has rendered
  useEffect(() => {
    if (qrSrc && !hasPrinted.current) {
      hasPrinted.current = true;
      setTimeout(() => window.print(), 300);
    }
  }, [qrSrc]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-sm text-gray-500">Loading…</div>;
  }

  if (!checklist) {
    return <div className="flex items-center justify-center min-h-screen text-sm text-red-500">Checklist not found.</div>;
  }

  const freq = frequencyLabel(checklist.frequency as never);

  return (
    <>
      {/* Screen toolbar — hidden when printing */}
      <div className="print:hidden border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => window.close()} className="btn-ghost text-xs px-2">← Back</button>
          <span className="text-sm font-semibold text-gray-900">{checklist.name}</span>
        </div>
        <button onClick={() => window.print()} className="btn-primary">
          Print / Save PDF
        </button>
      </div>

      {/* A4 print sheet */}
      <div
        className="mx-auto bg-white flex flex-col items-center justify-between text-center print:fixed print:inset-0 print:m-0"
        style={{
          width: "210mm",
          height: "297mm",
          padding: "14mm 16mm 12mm",
          boxSizing: "border-box",
        }}
      >
        {/* Top: wordmark */}
        <p style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "42px", color: "#5C4A1E", letterSpacing: "-0.5px", lineHeight: 1, margin: 0 }}>Kernel</p>

        {/* Middle: title + frequency */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6mm" }}>
          {/* Frequency */}
          <div
            style={{
              display: "inline-block",
              background: "#111827",
              borderRadius: "999px",
              padding: "6px 22px",
              fontSize: "18px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#ffffff",
            }}
          >
            {freq}
          </div>

          {/* Checklist name */}
          <h1
            style={{
              fontSize: "52px",
              fontWeight: 900,
              color: "#111827",
              lineHeight: 1.1,
              maxWidth: "170mm",
              margin: 0,
            }}
          >
            {checklist.name}
          </h1>
        </div>

        {/* Bottom: QR + instruction */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5mm" }}>
          {qrSrc ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={qrSrc}
              alt={`QR code for ${checklist.name}`}
              style={{ width: "130mm", height: "130mm", display: "block" }}
            />
          ) : (
            <div style={{ width: "130mm", height: "130mm", background: "#f3f4f6", borderRadius: "8px" }} />
          )}
          <p style={{ fontSize: "16px", color: "#6b7280", margin: 0 }}>
            Scan to complete this checklist
          </p>
        </div>
      </div>

      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }
          body { margin: 0; }
        }
      `}</style>
    </>
  );
}
