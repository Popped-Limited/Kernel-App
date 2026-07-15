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

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London",
  });
}
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
  });
}

export default function BookDemoModal({ open, onClose }: Props) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [booking, setBooking] = useState(false);
  const [done, setDone] = useState<string | null>(null); // "when" label on success
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setNote("");
    setDone(null);
    setError("");
    setLoading(true);
    fetch("/api/demo-slots")
      .then(r => r.json())
      .then(d => setSlots(d.slots ?? []))
      .catch(() => setError("Couldn't load available times"))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function book() {
    if (!selected) return;
    setBooking(true);
    setError("");
    const res = await fetch("/api/demo-slots/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: selected, note }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to book — please try again");
      setBooking(false);
      // If the slot was taken, refresh the list so they can re-pick.
      if (res.status === 409) {
        setSelected(null);
        fetch("/api/demo-slots").then(r => r.json()).then(d => setSlots(d.slots ?? []));
      }
    } else {
      setDone(data.when ?? "your chosen time");
      setBooking(false);
    }
  }

  if (!open) return null;

  // Group slots by day for a clean picker.
  const byDay = new Map<string, Slot[]>();
  for (const s of slots) {
    const key = dayLabel(s.starts_at);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
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
            <div className="px-6 py-4 overflow-y-auto space-y-4">
              <p className="text-sm text-brown/60">Pick a time that suits you — the demo runs over a video call.</p>
              {[...byDay.entries()].map(([day, daySlots]) => (
                <div key={day}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brown/50 mb-2">{day}</p>
                  <div className="flex flex-wrap gap-2">
                    {daySlots.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSelected(s.id)}
                        className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                          selected === s.id
                            ? "bg-brand border-brand text-brown font-semibold"
                            : "border-brown/20 text-brown hover:bg-brand/20"
                        }`}
                      >
                        {timeLabel(s.starts_at)} · {s.duration_mins} min
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div>
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

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button
                onClick={book}
                disabled={!selected || booking}
                className="btn-primary px-5 py-2 flex-1 disabled:opacity-50"
              >
                {booking ? "Booking…" : "Confirm booking"}
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-lg border border-brown/20 text-sm text-brown hover:bg-brown/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
