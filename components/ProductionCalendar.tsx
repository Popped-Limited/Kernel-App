"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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

// ── Colour palette — 16 distinct muted tones ──────────────────────────────────

const PALETTE = [
  "#F5C65A", // Amber (brand default)
  "#7FBA9A", // Sage
  "#E8916A", // Terracotta
  "#7BA8D4", // Cornflower
  "#B09FD4", // Lavender
  "#D49B9B", // Dusty rose
  "#6BB8A8", // Teal
  "#A0B06A", // Olive
  "#E87F7F", // Coral
  "#6A90BA", // Steel blue
  "#9A8AC0", // Purple
  "#6AAB80", // Forest
  "#D4B86A", // Warm gold
  "#C090BA", // Mauve
  "#8AAABA", // Slate
  "#BA9870", // Warm brown
];

/** Readable text colour (dark brown vs white) based on background luminance */
function textFor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#4A3728" : "#FFFFFF";
}

// ── Date helpers ──────────────────────────────────────────────────────────────

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

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Colour picker popover ─────────────────────────────────────────────────────

function ColourPicker({
  current,
  onSelect,
  onClose,
}: {
  current: string;
  onSelect: (hex: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-50 mt-1 rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
      style={{ minWidth: 196 }}
    >
      <div className="grid grid-cols-8 gap-1.5 mb-2">
        {PALETTE.map(hex => (
          <button
            key={hex}
            onClick={() => { onSelect(hex); onClose(); }}
            className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
            style={{
              backgroundColor: hex,
              borderColor: hex === current ? "#4A3728" : "transparent",
            }}
            title={hex}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <span className="text-xs text-gray-400">Custom</span>
        <input
          type="color"
          value={current.length === 7 ? current : "#F5C65A"}
          onChange={e => onSelect(e.target.value)}
          className="h-6 w-10 cursor-pointer rounded border border-gray-200 p-0.5"
        />
        <span className="text-xs text-gray-400 font-mono">{current}</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProductionCalendar({ checklists }: { checklists: Checklist[] }) {
  const { orgId } = useOrganisation();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [saving, setSaving] = useState(false);

  // Local colour map: checklist id → hex (seeded from DB, updated on pick)
  const [colours, setColours] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState<string | null>(null);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayStr = toDateStr(new Date());
  const currentWeekStart = toDateStr(getMonday(new Date()));

  const productionChecklists = checklists.filter(cl => cl.category === "Production");

  // Seed colour map from DB values; auto-assign palette colour for any without one
  useEffect(() => {
    const map: Record<string, string> = {};
    productionChecklists.forEach((cl, i) => {
      map[cl.id] = cl.color ?? PALETTE[i % PALETTE.length];
    });
    setColours(map);
  }, [checklists]); // eslint-disable-line react-hooks/exhaustive-deps

  function getColour(checklistId: string | null): string {
    if (!checklistId) return "#6B7280";
    return colours[checklistId] ?? "#6B7280";
  }

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
  useEffect(() => { setSelectedDay(null); setAddingCustom(false); }, [weekStart]);

  async function saveColour(checklistId: string, hex: string) {
    // Update locally immediately for instant feedback
    setColours(prev => ({ ...prev, [checklistId]: hex }));
    // Persist to DB
    await supabase.from("checklists").update({ color: hex }).eq("id", checklistId);
  }

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
          >‹</button>
          <span className="text-sm font-semibold text-gray-700">{weekLabel}</span>
          <button
            onClick={() => setWeekStart(d => addDays(d, 7))}
            className="rounded-md p-1.5 hover:bg-gray-200 transition text-gray-500 text-base leading-none"
            aria-label="Next week"
          >›</button>
        </div>
        <div className="flex items-center gap-3">
          {toDateStr(weekStart) !== currentWeekStart && (
            <button
              onClick={() => setWeekStart(getMonday(new Date()))}
              className="text-xs text-brown/70 hover:text-brown transition underline"
            >Today</button>
          )}
          <span className="text-xs text-gray-400">Production calendar</span>
        </div>
      </div>

      {/* 7-day grid — fixed height container so the day panel never drifts */}
      <div className="grid grid-cols-7 divide-x divide-gray-100 border-b border-gray-100 h-[90px] overflow-hidden">
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
              className={`text-left p-2 h-full transition-colors w-full ${
                isSelected ? "bg-brand/20" : isToday ? "bg-brand/10" : "hover:bg-gray-50"
              } ${isPast && !isToday ? "opacity-55" : ""}`}
            >
              <div className="flex items-baseline gap-1 mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{DAY_LABELS[i]}</span>
                <span className={`text-xs font-bold ${isToday ? "text-brown" : "text-gray-700"}`}>
                  {day.getDate()}
                </span>
              </div>
              <div className="space-y-0.5 overflow-hidden">
                {!loading && dayEvents.slice(0, 2).map(ev => {
                  const bg = ev.type === "production" ? getColour(ev.checklist_id) : "#6B7280";
                  const fg = ev.type === "production" ? textFor(bg) : "#FFFFFF";
                  return (
                    <div
                      key={ev.id}
                      className="text-[10px] font-medium rounded px-1.5 py-0.5 truncate leading-tight"
                      style={{ backgroundColor: bg, color: fg }}
                    >
                      {ev.title}
                    </div>
                  );
                })}
                {!loading && dayEvents.length > 2 && (
                  <span className="text-[10px] text-gray-400 font-medium">+{dayEvents.length - 2} more</span>
                )}
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
        <div className="border-t border-brand/20 bg-brand/5">
          {/* Pinned date header — always visible regardless of content below */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-brand/10">
            <p className="text-sm font-semibold text-gray-900">
              {new Date(selectedDay + "T12:00:00").toLocaleDateString("en-GB", {
                weekday: "long", day: "numeric", month: "long",
              })}
            </p>
            <button
              onClick={() => { setSelectedDay(null); setAddingCustom(false); setCustomTitle(""); }}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            >×</button>
          </div>
          {/* Scrollable content — capped height so date header never drifts */}
          <div className="p-4 space-y-3 max-h-72 overflow-y-auto">

          {/* Existing events */}
          {selectedDayEvents.length > 0 && (
            <div className="space-y-1.5">
              {selectedDayEvents.map(ev => {
                const bg = ev.type === "production" ? getColour(ev.checklist_id) : "#6B7280";
                return (
                  <div key={ev.id} className="flex items-center justify-between rounded-lg bg-white border border-gray-200 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: bg }} />
                      <p className="text-sm font-medium text-gray-900 truncate">{ev.title}</p>
                    </div>
                    <button
                      onClick={() => deleteEvent(ev.id)}
                      className="text-xs text-gray-300 hover:text-red-400 transition ml-2 shrink-0"
                    >Remove</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Production quick-add */}
          {productionChecklists.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-1.5">Production runs</p>
              <div className="flex flex-wrap gap-2">
                {productionChecklists.map((cl, i) => {
                  const name = cl.name.replace(/\s*[—–-]+\s*Production Record\s*$/i, "").trim();
                  const bg = colours[cl.id] ?? PALETTE[i % PALETTE.length];
                  const fg = textFor(bg);
                  return (
                    <div key={cl.id} className="relative flex items-center">
                      {/* Colour swatch — opens/closes picker */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setPickerOpen(pickerOpen === cl.id ? null : cl.id);
                        }}
                        className="h-4 w-4 rounded-full border-2 border-white shadow shrink-0 -mr-1 z-10 hover:scale-110 transition-transform"
                        style={{ backgroundColor: bg }}
                        title="Change colour"
                      />
                      {/* Add-to-calendar pill */}
                      <button
                        onClick={() => addEvent(name, "production", cl.id)}
                        disabled={saving}
                        className="text-xs rounded-full pl-4 pr-3 py-1 font-medium transition disabled:opacity-40 hover:opacity-80"
                        style={{ backgroundColor: bg, color: fg }}
                      >
                        {name}
                      </button>
                      {/* Colour picker popover */}
                      {pickerOpen === cl.id && (
                        <div className="absolute top-full left-0 pt-1">
                          <ColourPicker
                            current={bg}
                            onSelect={hex => saveColour(cl.id, hex)}
                            onClose={() => setPickerOpen(null)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">Tap the colour dot on any pill to change its colour.</p>
            </div>
          )}

          {/* Custom entry */}
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1.5">Custom entry</p>
            {!addingCustom ? (
              <button
                onClick={() => setAddingCustom(true)}
                className="text-xs rounded-full px-3 py-1 bg-white border border-gray-300 text-gray-600 hover:border-gray-400 transition"
              >+ Add custom (prep day, packing…)</button>
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
                >{saving ? "…" : "Add"}</button>
                <button
                  onClick={() => { setAddingCustom(false); setCustomTitle(""); }}
                  className="text-xs text-gray-400 hover:text-gray-600 transition"
                >Cancel</button>
              </div>
            )}
          </div>
          </div>{/* end scrollable content */}
        </div>
      )}
    </section>
  );
}
