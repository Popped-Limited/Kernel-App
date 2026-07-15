"use client";

import { useState, useEffect, useCallback } from "react";

interface Slot {
  id: string;
  starts_at: string;
  duration_mins: number;
  booked_at: string | null;
  booked_by_name: string | null;
  booked_by_email: string | null;
  booked_note: string | null;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function dayKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function slotDayKey(iso: string) { return dayKey(new Date(iso)); }

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
  });
}
function longDate(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// The 6-week (42-day) grid starting on the Monday on/before the 1st of the month.
function gridStart(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7; // Sun=0 → 6, Mon=1 → 0 …
  const start = new Date(first);
  start.setDate(1 - mondayOffset);
  start.setHours(0, 0, 0, 0);
  return start;
}

export default function DemoSlotsManager() {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null); // dayKey

  const [fromTime, setFromTime] = useState("15:00");
  const [toTime, setToTime] = useState("17:00");
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (m: Date) => {
    setLoading(true);
    const start = gridStart(m);
    const end = new Date(start); end.setDate(start.getDate() + 42);
    const res = await fetch(`/api/demo-slots?admin=1&from=${start.toISOString()}&to=${end.toISOString()}`);
    const data = await res.json();
    setSlots(data.slots ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(month); }, [month, load]);

  // Bucket slots by day for calendar badges + the day panel.
  const byDay = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = slotDayKey(s.starts_at);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(s);
  }

  const todayKey = dayKey(new Date());
  const start = gridStart(month);
  const cells: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i); return d;
  });

  const selectedSlots = selected ? (byDay.get(selected) ?? []).slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)) : [];
  const selectedDate = selected ? new Date(`${selected}T00:00:00`) : null;

  // Preview of how many slots the current window+length would create.
  const previewCount = (() => {
    const [fh, fm] = fromTime.split(":").map(Number);
    const [th, tm] = toTime.split(":").map(Number);
    const s = fh * 60 + fm, e = th * 60 + tm;
    if (!Number.isFinite(s) || !Number.isFinite(e) || duration <= 0 || e <= s) return 0;
    return Math.floor((e - s) / duration);
  })();

  async function createSlots() {
    if (!selected || previewCount === 0) return;
    setBusy(true); setError(""); setMsg("");
    const [y, mo, d] = selected.split("-").map(Number);
    const [fh, fm] = fromTime.split(":").map(Number);
    const [th, tm] = toTime.split(":").map(Number);
    const s = fh * 60 + fm, e = th * 60 + tm;
    const iso: string[] = [];
    for (let t = s; t + duration <= e; t += duration) {
      iso.push(new Date(y, mo - 1, d, Math.floor(t / 60), t % 60, 0, 0).toISOString());
    }
    const res = await fetch("/api/demo-slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slots: iso, duration_mins: duration }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Couldn't create slots"); setBusy(false); return; }
    setMsg(
      data.created === 0
        ? "Those times were already open."
        : `Added ${data.created} slot${data.created !== 1 ? "s" : ""}${data.skipped ? ` (${data.skipped} already existed)` : ""}.`
    );
    setBusy(false);
    load(month);
  }

  async function removeSlot(slot: Slot) {
    if (slot.booked_at && !confirm(`This slot is booked by ${slot.booked_by_name || slot.booked_by_email}. Remove it anyway? They won't be told automatically.`)) return;
    const res = await fetch(`/api/demo-slots?id=${slot.id}`, { method: "DELETE" });
    if (res.ok) setSlots(prev => prev.filter(x => x.id !== slot.id));
  }

  async function clearDay() {
    if (!selected) return;
    const openCount = selectedSlots.filter(s => !s.booked_at).length;
    if (openCount === 0) return;
    if (!confirm(`Remove all ${openCount} open (unbooked) slot${openCount !== 1 ? "s" : ""} on this day?`)) return;
    const [y, mo, d] = selected.split("-").map(Number);
    const from = new Date(y, mo - 1, d, 0, 0, 0, 0).toISOString();
    const to = new Date(y, mo - 1, d + 1, 0, 0, 0, 0).toISOString();
    setBusy(true);
    const res = await fetch(`/api/demo-slots?from=${from}&to=${to}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) load(month);
  }

  function shiftMonth(delta: number) {
    setSelected(null); setMsg(""); setError("");
    setMonth(m => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  return (
    <div className="space-y-6">
      {/* Calendar */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => shiftMonth(-1)} className="p-2 rounded-md hover:bg-brand/20 text-brown" aria-label="Previous month">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <h2 className="font-serif text-lg text-brown">{MONTHS[month.getMonth()]} {month.getFullYear()}</h2>
          <button onClick={() => shiftMonth(1)} className="p-2 rounded-md hover:bg-brand/20 text-brown" aria-label="Next month">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map(w => <div key={w} className="text-center text-xs font-semibold text-brown/50 py-1">{w}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            const k = dayKey(d);
            const inMonth = d.getMonth() === month.getMonth();
            const isPast = k < todayKey;
            const daySlots = byDay.get(k) ?? [];
            const open = daySlots.filter(s => !s.booked_at).length;
            const booked = daySlots.filter(s => s.booked_at).length;
            const isSelected = selected === k;
            return (
              <button
                key={i}
                onClick={() => { setSelected(k); setMsg(""); setError(""); }}
                disabled={isPast}
                className={`min-h-[62px] rounded-lg border p-1.5 text-left transition-colors flex flex-col ${
                  isSelected ? "border-brand ring-2 ring-brand bg-brand/10"
                    : "border-brown/10 hover:border-brand/60 hover:bg-brand/5"
                } ${!inMonth ? "opacity-40" : ""} ${isPast ? "opacity-30 cursor-not-allowed hover:bg-transparent hover:border-brown/10" : ""}`}
              >
                <span className={`text-xs font-semibold ${k === todayKey ? "text-brand-dark" : "text-brown"}`}>{d.getDate()}</span>
                <span className="mt-auto flex flex-wrap gap-1">
                  {open > 0 && <span className="text-[10px] leading-none px-1 py-0.5 rounded bg-green-100 text-green-800">{open} open</span>}
                  {booked > 0 && <span className="text-[10px] leading-none px-1 py-0.5 rounded bg-amber-100 text-amber-900">{booked} booked</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day panel */}
      {selectedDate && (
        <div className="card p-5 space-y-5">
          <h3 className="font-semibold text-brown">{longDate(selectedDate)}</h3>

          {/* Set an availability window */}
          <div className="rounded-lg bg-brand-cream/60 p-4 space-y-3">
            <p className="text-sm font-medium text-brown">Open an availability window</p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                <input type="time" value={fromTime} onChange={e => setFromTime(e.target.value)} className="input w-32" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                <input type="time" value={toTime} onChange={e => setToTime(e.target.value)} className="input w-32" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Demo length (min)</label>
                <input type="number" min={5} max={480} step={5} value={duration} onChange={e => setDuration(Number(e.target.value))} className="input w-28" />
              </div>
              <button onClick={createSlots} disabled={busy || previewCount === 0} className="btn-primary px-5 py-2 disabled:opacity-50">
                {busy ? "Saving…" : `Add ${previewCount} slot${previewCount !== 1 ? "s" : ""}`}
              </button>
            </div>
            {previewCount === 0
              ? <p className="text-xs text-red-600">Choose an end time later than the start (needs room for at least one {duration}-min demo).</p>
              : <p className="text-xs text-gray-500">Creates {previewCount} bookable slot{previewCount !== 1 ? "s" : ""} of {duration} min each. Times are UK time.</p>}
            {msg && <p className="text-xs text-green-700">{msg}</p>}
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          {/* Existing slots this day */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-brown">Slots on this day</p>
              {selectedSlots.some(s => !s.booked_at) && (
                <button onClick={clearDay} disabled={busy} className="text-xs text-red-600 hover:underline disabled:opacity-50">Clear open slots</button>
              )}
            </div>
            {selectedSlots.length === 0 ? (
              <p className="text-sm text-gray-400">No slots yet — open a window above.</p>
            ) : (
              <ul className="space-y-1.5">
                {selectedSlots.map(s => (
                  <li key={s.id} className={`flex items-start justify-between gap-3 px-3 py-2 rounded-lg border ${s.booked_at ? "border-amber-200 bg-amber-50" : "border-brown/10"}`}>
                    <div className="text-sm">
                      <span className="font-medium text-brown">{timeLabel(s.starts_at)}</span>
                      <span className="text-brown/50"> · {s.duration_mins} min</span>
                      {s.booked_at && (
                        <div className="text-brown/70 mt-0.5">
                          Booked by {s.booked_by_name} &lt;{s.booked_by_email}&gt;
                          {s.booked_note && <span className="block text-brown/60 mt-0.5 whitespace-pre-wrap">“{s.booked_note}”</span>}
                        </div>
                      )}
                    </div>
                    <button onClick={() => removeSlot(s)} className="text-xs text-red-600 hover:underline shrink-0 mt-0.5">
                      {s.booked_at ? "Cancel" : "Remove"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {!selectedDate && !loading && (
        <p className="text-sm text-gray-500">Click a day to open availability. Green = open slots customers can book, amber = booked demos.</p>
      )}
    </div>
  );
}
