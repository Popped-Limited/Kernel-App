"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import type { Question, IngredientLot } from "@/lib/types";
import { todayJulianCode } from "@/lib/utils";

/** Local-state input for litres — lets the user type freely, converts to grams only on blur */
function LitresInput({ weightG, density, onChange }: { weightG: string; density: number; onChange: (g: string) => void }) {
  const [display, setDisplay] = useState(weightG ? (Number(weightG) / density).toFixed(2) : "");

  // Reset display if parent clears the value
  useEffect(() => {
    if (!weightG) setDisplay("");
  }, [weightG]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={(e) => setDisplay(e.target.value)}
      onBlur={(e) => {
        const litres = parseFloat(e.target.value);
        if (!isNaN(litres) && litres > 0) {
          onChange(String(Math.round(litres * density)));
          setDisplay(litres.toFixed(2));
        } else {
          onChange("");
          setDisplay("");
        }
      }}
      className="input w-24 shrink-0 text-sm py-1.5"
      placeholder="Litres"
    />
  );
}

interface Props {
  question: Question;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  ingredientLots?: Record<string, IngredientLot[]>; // ingredient name → available lots
  densityByName?: Record<string, number>; // ingredient name → g/L
}

function findLots(ingredientLots: Record<string, IngredientLot[]>, name: string): IngredientLot[] {
  if (ingredientLots[name]) return ingredientLots[name];
  const lc = name.toLowerCase();
  const match = Object.entries(ingredientLots).find(([key]) =>
    key.toLowerCase().includes(lc) || lc.includes(key.toLowerCase())
  );
  return match?.[1] ?? [];
}

function findDensity(densityByName: Record<string, number>, name: string): number | null {
  if (densityByName[name] != null) return densityByName[name];
  const lc = name.toLowerCase();
  const match = Object.entries(densityByName).find(([key]) =>
    key.toLowerCase().includes(lc) || lc.includes(key.toLowerCase())
  );
  return match?.[1] ?? null;
}

export default function QuestionField({ question, value, onChange, error, ingredientLots, densityByName }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  // Tracks raw litres text per lot input so users can type freely without the field snapping
  const [litresDisplay, setLitresDisplay] = useState<Record<string, string>>({});

  const base = (
    <div className="space-y-1">
      <label className="label">
        {question.label}
        {question.required && <span className="ml-1 text-brand">*</span>}
      </label>
      {question.hint && <p className="text-xs text-gray-500 -mt-0.5 mb-1">{question.hint}</p>}
    </div>
  );

  const errMsg = error ? (
    <p className="mt-1 text-xs text-red-600">{error}</p>
  ) : null;

  if (question.type === "checkbox") {
    const checked = value === "true";
    return (
      <div>
        <button
          type="button"
          onClick={() => onChange(checked ? "false" : "true")}
          className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${
            checked
              ? "border-brand/40 bg-brand/5"
              : "border-gray-200 bg-white hover:border-gray-300"
          } ${error ? "border-red-300" : ""}`}
        >
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${
              checked ? "border-brand bg-brand text-white" : "border-gray-300"
            }`}
          >
            {checked && (
              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <div className="flex-1">
            <span className="text-sm font-medium text-gray-900">{question.label}</span>
            {question.required && <span className="ml-1 text-brand text-xs">*</span>}
            {question.hint && <p className="mt-0.5 text-xs text-gray-500">{question.hint}</p>}
          </div>
        </button>
        {errMsg}
      </div>
    );
  }

  if (question.type === "dropdown") {
    return (
      <div>
        {base}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`input ${error ? "border-red-300" : ""}`}
        >
          <option value="">Select…</option>
          {question.options?.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {errMsg}
      </div>
    );
  }

  if (question.type === "multiple_choice") {
    const selected: string[] = value ? JSON.parse(value) : [];
    return (
      <div>
        {base}
        <div className="space-y-2">
          {question.options?.map((opt) => {
            const active = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  const next = active ? selected.filter((s) => s !== opt) : [...selected, opt];
                  onChange(JSON.stringify(next));
                }}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                  active ? "border-brand/40 bg-brand/5 text-brand-dark font-medium" : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${active ? "border-brand bg-brand" : "border-gray-300"}`}>
                  {active && <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
        {errMsg}
      </div>
    );
  }

  if (question.type === "number") {
    return (
      <div>
        {base}
        <input
          type="number"
          step="0.1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`input ${error ? "border-red-300" : ""}`}
          placeholder="Enter number"
          inputMode="decimal"
        />
        {errMsg}
      </div>
    );
  }

  if (question.type === "date") {
    return (
      <div>
        {base}
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`input ${error ? "border-red-300" : ""}`}
        />
        {errMsg}
      </div>
    );
  }

  if (question.type === "datetime") {
    return (
      <div>
        {base}
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`input ${error ? "border-red-300" : ""}`}
        />
        {errMsg}
      </div>
    );
  }

  if (question.type === "photo") {
    const hasPhoto = value && value.startsWith("http");
    return (
      <div>
        {base}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            // Store as base64 temporarily; the submit handler will upload to Supabase
            const reader = new FileReader();
            reader.onload = () => onChange(reader.result as string);
            reader.readAsDataURL(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-sm transition ${
            hasPhoto
              ? "border-green-400 bg-green-50 text-green-700"
              : error
              ? "border-red-300 bg-red-50 text-red-600"
              : "border-gray-300 bg-white text-gray-500 hover:border-brand hover:text-brand"
          }`}
        >
          {value && !value.startsWith("http") ? (
            <>
              {/* preview */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value} alt="Preview" className="h-32 w-full rounded-lg object-cover" />
              <span className="text-xs font-medium text-green-700">Photo captured — tap to retake</span>
            </>
          ) : hasPhoto ? (
            <span className="font-medium">Photo uploaded ✓</span>
          ) : (
            <>
              <CameraIcon />
              <span className="font-medium">Take photo or upload</span>
            </>
          )}
        </button>
        {errMsg}
      </div>
    );
  }

  if (question.type === "multi_number") {
    const count = parseInt(question.options?.[0] ?? "3");
    let vals: string[];
    try {
      vals = value ? JSON.parse(value) : Array(count).fill("");
    } catch { vals = Array(count).fill(""); }
    if (vals.length !== count) {
      vals = Array.from({ length: count }, (_, i) => vals[i] ?? "");
    }

    const updateVal = (idx: number, v: string) => {
      const next = [...vals];
      next[idx] = v;
      onChange(JSON.stringify(next));
    };

    const filled = vals.filter(v => v !== "" && !isNaN(Number(v)));
    const nums = filled.map(Number);
    const min = nums.length ? Math.min(...nums) : null;

    return (
      <div className="space-y-1">
        <label className="label">
          {question.label}
          {question.required && <span className="ml-1 text-brand">*</span>}
        </label>
        {question.hint && <p className="text-xs text-gray-500 -mt-0.5 mb-2">{question.hint}</p>}
        <div className={`grid gap-2 ${error ? "rounded-xl border border-red-300 p-2" : ""}`}
          style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}>
          {vals.map((v, i) => (
            <div key={i} className="space-y-0.5">
              <p className="text-xs text-gray-400 text-center">{i + 1}</p>
              <input
                type="number"
                value={v}
                onChange={e => updateVal(i, e.target.value)}
                className="input text-sm py-1.5 text-center w-full"
                placeholder="—"
                inputMode="decimal"
                step="0.1"
              />
            </div>
          ))}
        </div>
        {min !== null && (
          <p className="text-xs text-gray-500 pt-0.5">
            Min: <span className="font-semibold text-gray-700">{min}</span>
            {" · "}Avg: <span className="font-semibold text-gray-700">{(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1)}</span>
          </p>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  if (question.type === "ingredient_table") {
    type LotUse = { lot_id: string; julian_code: string; weight_g: string };
    type IngRow = { name: string; lots: LotUse[] };

    const ingredients = (question.options ?? []).map((opt) => {
      const [name, weight] = (opt as string).split("|");
      return { name: name ?? opt, intended: Number(weight ?? 0) };
    });

    let rows: IngRow[];
    try {
      const parsed = value ? JSON.parse(value) : [];
      // Support both old format {batch_code, actual_weight} and new {lots}
      rows = parsed.map((r: IngRow & { batch_code?: string; actual_weight?: string }, i: number) => ({
        name: r.name ?? ingredients[i]?.name ?? "",
        lots: r.lots ?? [{ lot_id: "", julian_code: r.batch_code ?? "", weight_g: r.actual_weight ?? "" }],
      }));
    } catch { rows = []; }

    if (rows.length !== ingredients.length) {
      rows = ingredients.map((ing, i) => ({
        name: ing.name,
        lots: rows[i]?.lots ?? [{ lot_id: "", julian_code: todayJulianCode(), weight_g: "" }],
      }));
    }

    const emptyLot: LotUse = { lot_id: "", julian_code: todayJulianCode(), weight_g: "" };

    const update = (newRows: IngRow[]) => onChange(JSON.stringify(newRows));

    const updateLot = (ingIdx: number, lotIdx: number, field: keyof LotUse, val: string) => {
      const newRows = rows.map((row, i) => {
        if (i !== ingIdx) return row;
        const newLots = row.lots.map((lot, j) => {
          if (j !== lotIdx) return lot;
          const updated = { ...lot, [field]: val };
          if (field === "lot_id") {
            const lots = findLots(ingredientLots ?? {}, ingredients[ingIdx].name);
            const lot = lots.find(l => l.id === val);
            if (lot) updated.julian_code = lot.julian_code;
          }
          return updated;
        });
        return { ...row, lots: newLots };
      });
      update(newRows);
    };

    const addLot = (ingIdx: number) => {
      const newRows = rows.map((row, i) =>
        i === ingIdx ? { ...row, lots: [...row.lots, emptyLot] } : row
      );
      update(newRows);
    };

    const removeLot = (ingIdx: number, lotIdx: number) => {
      const newRows = rows.map((row, i) => {
        if (i !== ingIdx) return row;
        const newLots = row.lots.filter((_, j) => j !== lotIdx);
        return { ...row, lots: newLots.length ? newLots : [emptyLot] };
      });
      update(newRows);
    };

    return (
      <div>
        <label className="label">
          {question.label}
          {question.required && <span className="ml-1 text-brand">*</span>}
        </label>
        {question.hint && <p className="text-xs text-gray-500 -mt-0.5 mb-2">{question.hint}</p>}
        <div className={`space-y-2 ${error ? "rounded-xl border border-red-300 p-2" : ""}`}>
          {ingredients.map((ing, ingIdx) => {
            const row = rows[ingIdx];
            const availableLots = findLots(ingredientLots ?? {}, ing.name);
            const density = findDensity(densityByName ?? {}, ing.name);
            const totalEntered = (row?.lots ?? []).reduce((sum, l) => sum + (Number(l.weight_g) || 0), 0);
            const diff = totalEntered - ing.intended;
            const targetLabel = density
              ? `${ing.intended.toLocaleString()}g (${(ing.intended / density).toFixed(2)}L)`
              : `${ing.intended.toLocaleString()}g`;
            return (
              <div key={ing.name} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">{ing.name}</p>
                  <span className="text-xs text-gray-500 tabular-nums">Target: {targetLabel}</span>
                </div>
                {(row?.lots ?? [emptyLot]).map((lotUse, lotIdx) => (
                  <div key={lotIdx} className="flex gap-2 items-center">
                    {availableLots.length > 0 ? (
                      <select
                        value={lotUse.lot_id}
                        onChange={(e) => updateLot(ingIdx, lotIdx, "lot_id", e.target.value)}
                        className="input flex-1 text-sm py-1.5 min-w-0"
                      >
                        <option value="">Select Julian code…</option>
                        {availableLots.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.julian_code} — {l.quantity_remaining_g.toLocaleString()}g left
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <div className="relative">
                          <input
                            type="text"
                            value={lotUse.julian_code}
                            onChange={(e) => updateLot(ingIdx, lotIdx, "julian_code", e.target.value)}
                            className="input w-full text-sm py-1.5 font-mono"
                            placeholder="Julian code"
                          />
                          {lotUse.julian_code === todayJulianCode() && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-brown bg-brand/40 rounded-full px-1.5 py-0.5 pointer-events-none">
                              today
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {density ? (
                      <>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={litresDisplay[`${ingIdx}-${lotIdx}`] ?? (lotUse.weight_g ? (Number(lotUse.weight_g) / density).toFixed(2) : "")}
                          onChange={(e) => setLitresDisplay(prev => ({ ...prev, [`${ingIdx}-${lotIdx}`]: e.target.value }))}
                          onBlur={(e) => {
                            const litres = parseFloat(e.target.value);
                            if (!isNaN(litres) && litres > 0) {
                              updateLot(ingIdx, lotIdx, "weight_g", String(Math.round(litres * density)));
                              setLitresDisplay(prev => ({ ...prev, [`${ingIdx}-${lotIdx}`]: litres.toFixed(2) }));
                            } else {
                              updateLot(ingIdx, lotIdx, "weight_g", "");
                              setLitresDisplay(prev => ({ ...prev, [`${ingIdx}-${lotIdx}`]: "" }));
                            }
                          }}
                          className="input w-24 shrink-0 text-sm py-1.5"
                          placeholder="Litres"
                        />
                        <input
                          type="text"
                          value={lotUse.weight_g ? `${Number(lotUse.weight_g).toLocaleString()}g` : ""}
                          readOnly
                          className="input w-24 shrink-0 text-sm py-1.5 bg-gray-50 text-gray-400 cursor-default"
                          placeholder="g (auto)"
                        />
                      </>
                    ) : (
                      <input
                        type="number"
                        value={lotUse.weight_g}
                        onChange={(e) => updateLot(ingIdx, lotIdx, "weight_g", e.target.value)}
                        className="input w-28 shrink-0 text-sm py-1.5"
                        placeholder="Weight (g)"
                        inputMode="decimal"
                        step="0.1"
                      />
                    )}
                    {(row?.lots.length ?? 1) > 1 && (
                      <button type="button" onClick={() => removeLot(ingIdx, lotIdx)}
                        className="text-lg text-gray-300 hover:text-red-400 transition leading-none shrink-0">×</button>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between pt-0.5">
                  <button type="button" onClick={() => addLot(ingIdx)}
                    className="text-xs text-brand hover:underline">
                    + Split across another lot
                  </button>
                  {totalEntered > 0 && (
                    <span className={`text-xs font-medium tabular-nums ${Math.abs(diff) <= 100 ? "text-green-600" : "text-amber-600"}`}>
                      {density
                        ? `${(totalEntered / density).toFixed(2)}L (${totalEntered.toLocaleString()}g) ${diff === 0 ? "✓" : `(${diff > 0 ? "+" : ""}${diff.toLocaleString()}g)`}`
                        : `${totalEntered.toLocaleString()}g total ${diff === 0 ? "✓" : `(${diff > 0 ? "+" : ""}${diff.toLocaleString()}g)`}`
                      }
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {errMsg}
      </div>
    );
  }

  if (question.type === "packing_runs") {
    type PackRun = {
      pack_weight: string;
      jars_used: string;
      jar_batch: string;
      lids_count: string;
      lids_batch: string;
      packed_by: string;
    };
    const emptyRun: PackRun = { pack_weight: "", jars_used: "", jar_batch: "", lids_count: "", lids_batch: "", packed_by: "" };
    let runs: PackRun[];
    try {
      runs = value ? JSON.parse(value) : [emptyRun];
    } catch {
      runs = [emptyRun];
    }
    if (runs.length === 0) runs = [emptyRun];
    const updateRun = (idx: number, field: keyof PackRun, val: string) => {
      const next = runs.map((r, i) => (i === idx ? { ...r, [field]: val } : r));
      onChange(JSON.stringify(next));
    };
    const addRun = () => onChange(JSON.stringify([...runs, emptyRun]));
    const removeRun = (idx: number) => {
      if (runs.length === 1) return;
      onChange(JSON.stringify(runs.filter((_, i) => i !== idx)));
    };
    return (
      <div>
        {base}
        <div className="space-y-3">
          {runs.map((run, idx) => (
            <div key={idx} className={`rounded-xl border p-3 space-y-2 ${error ? "border-red-300" : "border-gray-200"}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Run {idx + 1}</p>
                {runs.length > 1 && (
                  <button type="button" onClick={() => removeRun(idx)} className="text-xs text-gray-400 hover:text-red-500 transition">Remove</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { field: "pack_weight" as const, label: "Pack weight (g)", placeholder: "227", numeric: true },
                  { field: "jars_used" as const, label: "No. of jars", placeholder: "0", numeric: true },
                  { field: "jar_batch" as const, label: "Jar batch no.", placeholder: "JB001", numeric: false },
                  { field: "lids_count" as const, label: "No. of lids", placeholder: "0", numeric: true },
                  { field: "lids_batch" as const, label: "Lids batch no.", placeholder: "LB001", numeric: false },
                  { field: "packed_by" as const, label: "Packed by (initials)", placeholder: "SS", numeric: false },
                ].map(({ field, label, placeholder, numeric }) => (
                  <div key={field}>
                    <label className="text-xs text-gray-500 block mb-0.5">{label}</label>
                    <input
                      type={numeric ? "number" : "text"}
                      value={run[field]}
                      onChange={(e) => updateRun(idx, field, e.target.value)}
                      className="input text-sm py-1.5"
                      placeholder={placeholder}
                      inputMode={numeric ? "numeric" : "text"}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addRun}
            className="w-full rounded-xl border-2 border-dashed border-gray-200 py-2 text-sm text-gray-500 hover:border-brand hover:text-brand transition"
          >
            + Add another packing run
          </button>
        </div>
        {errMsg}
      </div>
    );
  }

  if (question.type === "signature") {
    return <SignatureField question={question} value={value} onChange={onChange} error={error} />;
  }

  // Default: text
  return (
    <div>
      {base}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={question.label.length > 60 ? 3 : 2}
        className={`input resize-none ${error ? "border-red-300" : ""}`}
        placeholder="Enter text…"
      />
      {errMsg}
    </div>
  );
}

function SignatureField({ question, value, onChange, error }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getPos = (e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawing.current = true;
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    lastPos.current = pos;
  };

  const endDraw = useCallback(() => {
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const data = canvas.toDataURL("image/png");
    onChange(data);
  }, [onChange]);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };

  return (
    <div>
      <label className="label">
        {question.label}
        {question.required && <span className="ml-1 text-brand">*</span>}
      </label>
      {question.hint && <p className="text-xs text-gray-500 mb-1">{question.hint}</p>}
      <div className={`rounded-xl border-2 overflow-hidden ${error ? "border-red-300" : value ? "border-brand/40" : "border-gray-200"}`}>
        <canvas
          ref={canvasRef}
          width={600}
          height={150}
          className="w-full touch-none bg-white cursor-crosshair"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-3 py-1.5">
          <span className="text-xs text-gray-400">Sign above</span>
          <button type="button" onClick={clear} className="text-xs text-gray-500 hover:text-red-600 transition">
            Clear
          </button>
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
