// Minimal iCalendar (.ics) builder for demo bookings.
// Attached to booking emails so the event can be added to Google Calendar
// (or any calendar) with one click — no Google API / OAuth needed.

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// iCalendar UTC timestamp: 20260715T140000Z
function toICSDate(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// Escape per RFC 5545 (backslash, semicolon, comma, newlines).
function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

interface DemoICSOptions {
  uid: string;
  start: Date;
  durationMins: number;
  organiserEmail: string;
  attendeeEmail: string;
  attendeeName?: string;
  summary: string;
  description?: string;
}

export function buildDemoICS(opts: DemoICSOptions): string {
  const end = new Date(opts.start.getTime() + opts.durationMins * 60000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kernel//Demo Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(opts.start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${esc(opts.summary)}`,
    opts.description ? `DESCRIPTION:${esc(opts.description)}` : "",
    `ORGANIZER;CN=Kernel:mailto:${opts.organiserEmail}`,
    `ATTENDEE;CN=${esc(opts.attendeeName || opts.attendeeEmail)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${opts.attendeeEmail}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  // RFC 5545 requires CRLF line endings.
  return lines.join("\r\n");
}
