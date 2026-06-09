"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useOrganisation } from "@/contexts/OrganisationContext";
import type { Checklist } from "@/lib/types";

interface CalendarEvent {
  id: string;
  event_date: string;
  title: string;
  type: "production" | "custom";
  checklist_id: string | null;
  created_by: string;
  notes: string | null;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number): Date {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

/** Local date string YYYY-MM-DD — avoids UTC shift in BST/other timezones */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ProductionCalendar({ checklists }: { checklists: Checklist[] }) {
  const { orgId } = useOrganisation();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayStr = toDateStr(new Date());
  const currentWeekStart = toDateStr(getMonday(new Date()));

  const productionChecklists = checklists.filter(cl => cl.category === "Production");

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const weekEnd = addDays(weekStart, 6);
    const { data } = await supabase
      .from("production_calendar")
      .select("*")
      .gte("event_date", toDateStr(weekStart))
      .lte("event_date", toDateStr(weekEnd))
      .order("created_at", { ascending: true });
    setEvents((data ?? []) as CalendarEvent[]);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // Close panel when navigating weeks
  useEffect(() => { setSelectedDay(null); setAddingCustom(false); }, [weekStart]);

  async function addEvent(title: string, type: "production" | "custom", checklistId?: string) {
    if (!selectedDay) return;
    setSaving(true);
    await supabase.from("production_calendar").insert({
      event_date: selectedDay,
      title,
      type,
      checklist_id: checklistId ?? null,
      created_by: "",
      organisation_id: orgId ?? null,
    });
    setSaving(false);
    setCustomTitle("");
    setAddingCustom(false);
    await loadEvents();
  }

  async function deleteEvent(id: string) {
    await supabase.from("production_calendar").delete().eq("id", id);
    setEvents(prev => prev.filter(e => e.id !== id));
  }

  const selectedDayEvents = events.filter(e => e.event_date === selectedDay);

  const weekLabel = (() => {
    const s = days[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const e = days[6].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return `${s} – ${e}`;
  })();

  return (
    <section className="card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(d => addDays(d, -7))}
            className="rounded-md p-1.5 hover:bg-gray-200 transition text-gray-500 text-base leading-none"
            aria-label="Previous week"
          >
            ‹
          </button>
          <span className="text-sm font-semibold text-gray-700">{weekLabel}</span>
          <button
            onClick={() => setWeekStart(d => addDays(d, 7))}
            className="rounded-md p-1.5 hover:bg-gray-200 transition text-gray-500 text-base leading-none"
            aria-label="Next week"
          >
            ›
          </button>
        </div>
        <div className="flex items-center gap-3">
          {toDateStr(weekStart) !== currentWeekStart && (
            <button
              onClick={() => setWeekStart(getMonday(new Date()))}
              className="text-xs text-brown/70 hover:text-brown transition underline"
            >
              Today
            </button>
          )}
          <span className="text-xs text-gray-400">Production calendar</span>
        </div>
      </div>

      {/* 7-day grid */}
      <div className="grid grid-cols-7 divide-x divide-gray-100 border-b border-gray-100">
        {days.map((day, i) => {
          const dateStr = toDateStr(day);
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDay;
          const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));
          const dayEvents = events.filter(e => e.event_date === dateStr);

          return (
            <button
              key={dateStr}
              onClick={() => setSelectedDay(isSelected ? null : dateStr)}
              className={`text-left p-2 min-h-[90px] transition-colors w-full ${
                isSelected
                  ? "bg-brand/20"
                  : isToday
                  ? "bg-brand/10"
                  : "hover:bg-gray-50"
              } ${isPast && !isToday ? "opacity-55" : ""}`}
            >
              <div className="flex items-baseline gap-1 mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{DAY_LABELS[i]}</span>
                <span className={`text-xs font-bold ${isToday ? "text-brown" : "text-gray-700"}`}>
                  {day.getDate()}
                </span>
              </div>
              <div className="space-y-0.5">
                {!loading && dayEvents.map(ev => (
                  <div
                    key={ev.id}
                    className={`text-[10px] font-medium rounded px-1.5 py-0.5 truncate leading-tight ${
                      ev.type === "production"
                        ? "bg-brand text-brown"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {ev.title}
                  </div>
                ))}
                {!loading && dayEvents.length === 0 && (
                  <span className="text-[10px] text-gray-300">+ Add</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day panel */}
      {selectedDay && (
        <div className="border-t border-brand/20 bg-brand/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">
              {new Date(selectedDay + "T12:00:00").toLocaleDateString("en-GB", {
                weekday: "long", day: "numeric", month: "long",
              })}
            </p>
            <button
              onClick={() => { setSelectedDay(null); setAddingCustom(false); setCustomTitle(""); }}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            >
              ×
            </button>
          </div>

          {/* Existing events */}
          {selectedDayEvents.length > 0 && (
            <div className="space-y-1.5">
              {selectedDayEvents.map(ev => (
                <div key={ev.id} className="flex items-center justify-between rounded-lg bg-white border border-gray-200 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${ev.type === "production" ? "bg-brand" : "bg-gray-400"}`} />
                    <p className="text-sm font-medium text-gray-900 truncate">{ev.title}</p>
                  </div>
                  <button
                    onClick={() => deleteEvent(ev.id)}
                    className="text-xs text-gray-300 hover:text-red-400 transition ml-2 shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Production quick-add */}
          {productionChecklists.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-1.5">Production runs</p>
              <div className="flex flex-wrap gap-1.5">
                {productionChecklists.map(cl => {
                  const name = cl.name.replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim();
                  return (
                    <button
                      key={cl.id}
                      onClick={() => addEvent(name, "production", cl.id)}
                      disabled={saving}
                      className="text-xs rounded-full px-3 py-1 bg-brand text-brown font-medium hover:bg-brand/70 transition disabled:opacity-40"
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom entry */}
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1.5">Custom entry</p>
            {!addingCustom ? (
              <button
                onClick={() => setAddingCustom(true)}
                className="text-xs rounded-full px-3 py-1 bg-white border border-gray-300 text-gray-600 hover:border-gray-400 transition"
              >
                + Add custom (prep day, packing…)
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Prep day, Packing, Deep clean…"
                  value={customTitle}
                  onChange={e => setCustomTitle(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && customTitle.trim() && addEvent(customTitle.trim(), "custom")}
                  className="input text-sm flex-1"
                  autoFocus
                />
                <button
                  onClick={() => addEvent(customTitle.trim(), "custom")}
                  disabled={!customTitle.trim() || saving}
                  className="btn-primary text-xs shrink-0 disabled:opacity-40"
                >
                  {saving ? "…" : "Add"}
                </button>
                <button
                  onClick={() => { setAddingCustom(false); setCustomTitle(""); }}
                  className="text-xs text-gray-400 hover:text-gray-600 transition"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
