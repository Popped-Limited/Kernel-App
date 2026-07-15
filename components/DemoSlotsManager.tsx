"use client";

import { useState, useEffect } from "react";

interface Slot {
  id: string;
  starts_at: string;
  duration_mins: number;
  booked_by_org: string | null;
  booked_by_name: string | null;
  booked_by_email: string | null;
  booked_note: string | null;
  booked_at: string | null;
}

function fullLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
  });
}

// datetime-local → ISO instant (interpreted in the browser's timezone, i.e. UK for Tom).
function localToISO(value: string): string {
  return new Date(value).toISOString();
}

export default function DemoSlotsManager() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState(30);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/demo-slots?admin=1");
    const data = await res.json();
    setSlots(data.slots ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!when) return;
    setAdding(true);
    setError("");
    const res = await fetch("/api/demo-slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starts_at: localToISO(when), duration_mins: duration }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Couldn't add that slot");
      setAdding(false);
      return;
    }
    setWhen("");
    setAdding(false);
    load();
  }

  async function removeSlot(slot: Slot) {
    const msg = slot.booked_at
      ? `This slot is booked by ${slot.booked_by_name || slot.booked_by_email}. Remove it anyway? They won't be told automatically.`
      : "Remove this slot?";
    if (!confirm(msg)) return;
    const res = await fetch(`/api/demo-slots?id=${slot.id}`, { method: "DELETE" });
    if (res.ok) setSlots(s => s.filter(x => x.id !== slot.id));
  }

  const available = slots.filter(s => !s.booked_at);
  const booked = slots.filter(s => s.booked_at);

  return (
    <div className="space-y-8">
      {/* Add slot */}
      <form onSubmit={addSlot} className="card p-5 space-y-4">
        <h2 className="font-semibold text-brown">Open a new demo time</h2>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Date &amp; time</label>
            <input
              type="datetime-local"
              value={when}
              onChange={e => setWhen(e.target.value)}
              className="input"
              required
            />
          </div>
          <div className="w-full sm:w-32">
            <label className="block text-sm font-medium text-gray-700 mb-1">Length (min)</label>
            <input
              type="number"
              min={5}
              max={480}
              step={5}
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              className="input"
            />
          </div>
          <button type="submit" disabled={adding || !when} className="btn-primary px-5 py-2 disabled:opacity-50">
            {adding ? "Adding…" : "Add slot"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-xs text-gray-400">Times are UK time. Customers only see slots that aren&apos;t booked yet.</p>
      </form>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          {/* Available */}
          <div>
            <h2 className="font-semibold text-brown mb-3">Available slots ({available.length})</h2>
            {available.length === 0 ? (
              <p className="text-sm text-gray-400">No open slots. Add some above so customers can book.</p>
            ) : (
              <ul className="space-y-2">
                {available.map(s => (
                  <li key={s.id} className="card px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-brown">{fullLabel(s.starts_at)} · {s.duration_mins} min</span>
                    <button onClick={() => removeSlot(s)} className="text-sm text-red-600 hover:underline">Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Booked */}
          <div>
            <h2 className="font-semibold text-brown mb-3">Booked demos ({booked.length})</h2>
            {booked.length === 0 ? (
              <p className="text-sm text-gray-400">No demos booked yet.</p>
            ) : (
              <ul className="space-y-2">
                {booked.map(s => (
                  <li key={s.id} className="card px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-brown">{fullLabel(s.starts_at)} · {s.duration_mins} min</p>
                        <p className="text-sm text-brown/70">{s.booked_by_name} &lt;{s.booked_by_email}&gt;</p>
                        {s.booked_note && <p className="text-sm text-brown/60 mt-1 whitespace-pre-wrap">“{s.booked_note}”</p>}
                      </div>
                      <button onClick={() => removeSlot(s)} className="text-sm text-red-600 hover:underline shrink-0">Cancel</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
