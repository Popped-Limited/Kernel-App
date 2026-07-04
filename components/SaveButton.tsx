"use client";
import { useEffect, useState } from "react";

/**
 * Save button whose own face reports progress: idle label → spinner + "Saving…"
 * → green "✓ Saved" → back to idle. All three states render inside the button
 * (never as text beside it), and the button keeps the width of its widest
 * state so the layout doesn't jump.
 *
 * Parents drive it with two booleans: set `saved` false when a save starts and
 * true on success — the button reverts to idle by itself after a moment.
 */
export default function SaveButton({
  saving,
  saved = false,
  savingLabel = "Saving…",
  savedLabel = "Saved",
  className = "btn-primary",
  disabled,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  saving: boolean;
  saved?: boolean;
  savingLabel?: string;
  savedLabel?: string;
}) {
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (saving) { setShowSaved(false); return; }
  }, [saving]);

  useEffect(() => {
    if (!saved) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2500);
    return () => clearTimeout(t);
  }, [saved]);

  const state = saving ? "saving" : showSaved ? "saved" : "idle";

  return (
    <button
      {...rest}
      disabled={disabled || saving}
      className={`${className} ${
        state === "saved" ? "bg-green-600 text-white hover:bg-green-600" : ""
      } ${state === "saving" ? "disabled:opacity-80" : ""}`}
    >
      <span className="grid place-items-center" aria-live="polite">
        <span className={`col-start-1 row-start-1 flex items-center gap-2 ${state === "idle" ? "" : "invisible"}`}>
          {children}
        </span>
        <span className={`col-start-1 row-start-1 flex items-center gap-2 ${state === "saving" ? "" : "invisible"}`}>
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {savingLabel}
        </span>
        <span className={`col-start-1 row-start-1 flex items-center gap-1.5 ${state === "saved" ? "" : "invisible"}`}>
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.414l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 111.414-1.414l2.793 2.793 6.793-6.793a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          {savedLabel}
        </span>
      </span>
    </button>
  );
}
