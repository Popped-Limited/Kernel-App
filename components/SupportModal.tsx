"use client";

import { useState, useEffect, useRef } from "react";

const SUBJECTS = [
  "I've found a bug",
  "I need help with a feature",
  "I have a billing question",
  "I'd like to request a feature",
  "Something else",
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SupportModal({ open, onClose }: Props) {
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [message, setMessage] = useState("");
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setSent(false);
      setError("");
      setMessage("");
      setSubject(SUBJECTS[0]);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");

    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, message }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Failed to send — please try again");
      setSending(false);
    } else {
      setSent(true);
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-brown">Contact support</h2>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {sent ? (
          <div className="px-6 py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <svg className="h-6 w-6 text-green-600" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 10l5 5 7-7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="font-medium text-brown mb-1">Message sent!</p>
            <p className="text-sm text-brown/60 mb-6">We&apos;ll get back to you as soon as possible.</p>
            <button onClick={onClose} className="btn-primary px-6 py-2 text-sm">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">What can we help with?</label>
              <select
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="input"
                disabled={sending}
              >
                {SUBJECTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea
                ref={textareaRef}
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="input resize-none"
                rows={5}
                placeholder="Describe what's happening…"
                required
                disabled={sending}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={sending || !message.trim()} className="btn-primary px-5 py-2 flex-1">
                {sending ? "Sending…" : "Send message"}
              </button>
              <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg border border-brown/20 text-sm text-brown hover:bg-brown/5 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
