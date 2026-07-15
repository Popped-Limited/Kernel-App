"use client";

import { useState, useEffect } from "react";

interface Slot {
  id: string;
  starts_at: string;
  duration_mins: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function dayKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function slotDayKey(iso: string) { return dayKey(new Date(iso)); }
function monthKey(d: Date) { return d.getFullYear() * 12 + d.getMonth(); }

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
  });
}
function longDate(dk: string) {
  return new Date(`${dk}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });
}

// 6-week grid starting on the Monday on/before the 1st of the month.
function gridStart(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(1 - mondayOffset);
  start.setHours(0, 0, 0, 0);
  return start;
}

export default function BookDemoModal({ open, onClose }: Props) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [booking, setBooking] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");

  function loadSlots(auto = true) {
    setLoading(true);
    return fetch("/api/demo-slots")
      .then(r => r.json())
      .then(d => {
        const list: Slot[] = d.slots ?? [];
        setSlots(list);
        if (auto && list.length) {
          // Land on the first day that has availability.
          const first = new Date(list[0].starts_at);
          setMonth(new Date(first.getFullYear(), first.getMonth(), 1));
          setSelectedDay(slotDayKey(list[0].starts_at));
        }
      })
      .catch(() => setError("Couldn't load available times"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!open) return;
    setSelectedDay(null);
    setSelectedSlot(null);
    setNote("");
    setDone(null);
    setError("");
    loadSlots();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function book() {
    if (!selectedSlot) return;
    setBooking(true);
    setError("");
    const res = await fetch("/api/demo-slots/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: selectedSlot, note }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to book — please try again");
      setBooking(false);
      if (res.status === 409) { // taken — refresh, keep them on the same day if possible
        setSelectedSlot(null);
        loadSlots(false);
      }
    } else {
      setDone(data.when ?? "your chosen time");
      setBooking(false);
    }
  }

  if (!open) return null;

  const byDay = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = slotDayKey(s.starts_at);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(s);
  }

  const nowMonthKey = monthKey(new Date());
  const canGoBack = monthKey(month) > nowMonthKey;
  const start = gridStart(month);
  const cells: Date[] = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const daySlots = selectedDay ? (byDay.get(selectedDay) ?? []).slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)) : [];

  function shiftMonth(delta: number) {
    setMonth(m => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-brown">Book a demo</h2>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {done ? (
          <div className="px-6 py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <svg className="h-6 w-6 text-green-600" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 10l5 5 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="font-medium text-brown mb-1">You&apos;re booked in!</p>
            <p className="text-sm text-brown/60 mb-1">{done}</p>
            <p className="text-sm text-brown/60 mb-6">A confirmation with a calendar invite is on its way to your inbox.</p>
            <button onClick={onClose} className="btn-primary px-6 py-2 text-sm">Close</button>
          </div>
        ) : loading ? (
          <div className="px-6 py-12 text-center text-sm text-brown/50">Loading available times…</div>
        ) : slots.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="font-medium text-brown mb-1">No times available right now</p>
            <p className="text-sm text-brown/60 mb-6">We haven&apos;t opened any demo slots yet. Use Contact support and we&apos;ll arrange a time with you directly.</p>
            <button onClick={onClose} className="btn-primary px-6 py-2 text-sm">Close</button>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 overflow-y-auto">
              <p className="text-sm text-brown/70 mb-4">
                Book a session with our tech team to explore everything Kernel can do and make sure you&apos;re getting the most out of it.
              </p>

              {/* Month calendar */}
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => shiftMonth(-1)} disabled={!canGoBack} className="p-1.5 rounded-md text-brown hover:bg-brand/20 disabled:opacity-30 disabled:hover:bg-transparent" aria-label="Previous month">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                <p className="font-serif text-base text-brown">{MONTHS[month.getMonth()]} {month.getFullYear()}</p>
                <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-md text-brown hover:bg-brand/20" aria-label="Next month">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAYS.map(w => <div key={w} className="text-center text-[11px] font-semibold text-brown/40 py-0.5">{w}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((d, i) => {
                  const k = dayKey(d);
                  const inMonth = d.getMonth() === month.getMonth();
                  const available = byDay.has(k);
                  const isSelected = selectedDay === k;
                  return (
                    <button
                      key={i}
                      onClick={() => { if (available) { setSelectedDay(k); setSelectedSlot(null); } }}
                      disabled={!available}
                      className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm transition-colors ${
                        isSelected ? "bg-brand text-brown font-semibold"
                          : available ? "text-brown font-medium hover:bg-brand/25 cursor-pointer"
                          : "text-brown/25 cursor-default"
                      } ${!inMonth ? "opacity-50" : ""}`}
                    >
                      {d.getDate()}
                      {available && !isSelected && <span className="mt-0.5 h-1 w-1 rounded-full bg-brand-dark" />}
                    </button>
                  );
                })}
              </div>

              {/* Times for the selected day */}
              {selectedDay && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brown/50 mb-2">{longDate(selectedDay)}</p>
                  <div className="flex flex-wrap gap-2">
                    {daySlots.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedSlot(s.id)}
                        className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                          selectedSlot === s.id
                            ? "bg-brand border-brand text-brown font-semibold"
                            : "border-brown/20 text-brown hover:bg-brand/20"
                        }`}
                      >
                        {timeLabel(s.starts_at)} · {s.duration_mins} min
                      </button>
                    ))}
                  </div>

                  {selectedSlot && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Anything you&apos;d like us to cover? (optional)</label>
                      <textarea
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        className="input resize-none"
                        rows={3}
                        placeholder="e.g. traceability, stock, or getting my team set up…"
                        disabled={booking}
                      />
                    </div>
                  )}
                </div>
              )}

              {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button onClick={book} disabled={!selectedSlot || booking} className="btn-primary px-5 py-2 flex-1 disabled:opacity-50">
                {booking ? "Booking…" : "Confirm booking"}
              </button>
              <button onClick={onClose} className="px-5 py-2 rounded-lg border border-brown/20 text-sm text-brown hover:bg-brown/5 transition-colors">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
