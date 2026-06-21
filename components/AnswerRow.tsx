"use client";

/**
 * Renders a single submitted answer (label + formatted value). Shared by the
 * submission detail page and the inline batch-record view in the Mock Recall
 * trace, so the two render answers identically.
 *
 * Typed loosely so it accepts both the full `Answer` shape and the lighter
 * answer rows fetched by the traceability engine.
 */
export interface AnswerRowData {
  value: string | null;
  question?: { type?: string | null; label?: string | null } | null;
}

export default function AnswerRow({ answer }: { answer: AnswerRowData }) {
  const q = answer.question;
  const val = answer.value;

  let display: React.ReactNode;

  if (!val || val === "null") {
    display = <span className="text-gray-400 text-sm italic">Not answered</span>;
  } else if (q?.type === "checkbox") {
    display = (
      <span className={`badge ${val === "true" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
        {val === "true" ? "✓ Yes / Pass" : "✗ No / Fail"}
      </span>
    );
  } else if (q?.type === "photo") {
    display = val.startsWith("http") ? (
      <a href={val} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={val} alt="Photo" className="mt-1 h-32 rounded-lg object-cover border border-gray-200 hover:opacity-90 transition" />
      </a>
    ) : <span className="text-gray-400 text-sm italic">Photo not available</span>;
  } else if (q?.type === "signature") {
    display = val.startsWith("data:") ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={val} alt="Signature" className="mt-1 h-16 rounded border border-gray-200 bg-white" />
    ) : <span className="text-gray-400 text-sm italic">No signature</span>;
  } else if (q?.type === "multiple_choice") {
    try {
      const parsed = JSON.parse(val);
      const items: string[] = Array.isArray(parsed) ? parsed : (parsed.selected ?? []);
      const followUpText: string = Array.isArray(parsed) ? "" : (parsed.followUp ?? "");
      display = (
        <div className="mt-1 space-y-1">
          <div className="flex flex-wrap gap-1">
            {items.map((i) => <span key={i} className="badge bg-brand-cream text-brown">{i}</span>)}
          </div>
          {followUpText && (
            <p className="text-sm text-gray-700 pl-1 italic">&quot;{followUpText}&quot;</p>
          )}
        </div>
      );
    } catch { display = <p className="text-sm text-gray-900">{val}</p>; }
  } else if (q?.type === "multi_number") {
    try {
      const nums: string[] = JSON.parse(val);
      const parsed = nums.map(Number).filter(n => !isNaN(n));
      const min = parsed.length ? Math.min(...parsed) : null;
      const avg = parsed.length ? parsed.reduce((a, b) => a + b, 0) / parsed.length : null;
      display = (
        <div>
          <div className="flex flex-wrap gap-2 mt-1">
            {nums.map((n, i) => (
              <span key={i} className="inline-block bg-gray-100 rounded px-2 py-0.5 text-sm font-mono font-medium text-gray-900">{n}</span>
            ))}
          </div>
          {min !== null && (
            <p className="text-xs text-gray-500 mt-1">Min: <strong>{min}</strong> · Avg: <strong>{avg?.toFixed(1)}</strong></p>
          )}
        </div>
      );
    } catch { display = <p className="text-sm text-gray-900">{val}</p>; }
  } else if (q?.type === "ingredient_table") {
    try {
      const parsedVal = JSON.parse(val);
      const rows: Array<{ name: string; lots: Array<{ julian_code: string; weight_g: string }> }> =
        Array.isArray(parsedVal) ? parsedVal : (parsedVal?.rows ?? []);
      display = (
        <div className="mt-1 rounded-lg border border-gray-200 overflow-hidden text-xs">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Ingredient</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Julian code</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">Weight (g)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.flatMap(row =>
                (row.lots ?? []).map((lot, i) => (
                  <tr key={`${row.name}-${i}`}>
                    <td className="px-3 py-1.5 text-gray-900 font-medium">{i === 0 ? row.name : ""}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-700">{lot.julian_code}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-900">{Number(lot.weight_g).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      );
    } catch { display = <p className="text-sm text-gray-900">{val}</p>; }
  } else if (q?.type === "packing_runs") {
    try {
      const runs: Array<{ pack_weight: string; jars_used: string; jar_batch: string; lids_count: string; lids_batch: string; packed_by: string }> = JSON.parse(val);
      display = (
        <div className="mt-1 rounded-lg border border-gray-200 overflow-hidden text-xs">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Pack weight</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Jars</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Jar batch</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Lids</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Lid batch</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Packed by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.filter(r => r.pack_weight || r.jars_used).map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 tabular-nums font-medium text-gray-900">{r.pack_weight}g</td>
                  <td className="px-3 py-1.5 tabular-nums text-gray-700">{r.jars_used}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-600">{r.jar_batch || "—"}</td>
                  <td className="px-3 py-1.5 tabular-nums text-gray-700">{r.lids_count || "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-600">{r.lids_batch || "—"}</td>
                  <td className="px-3 py-1.5 text-gray-700">{r.packed_by || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } catch { display = <p className="text-sm text-gray-900">{val}</p>; }
  } else {
    display = <p className="text-sm text-gray-900">{val}</p>;
  }

  return (
    <div className="px-5 py-3">
      <p className="text-xs text-gray-500 font-medium mb-0.5">{q?.label ?? "Question"}</p>
      {display}
    </div>
  );
}
