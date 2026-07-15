import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cookies } from "next/headers";

const SUPPORT_EMAIL = "support@kernelapp.co.uk";

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// GET — customer: available upcoming slots.  ?admin=1 (support only): all slots incl. bookings.
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const isAdmin = req.nextUrl.searchParams.get("admin") === "1";

  if (isAdmin) {
    if (user.email !== SUPPORT_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const params = req.nextUrl.searchParams;
    const from = params.get("from");
    const to = params.get("to");
    let query = supabaseAdmin.from("demo_slots").select("*").order("starts_at", { ascending: true });
    if (from && to) {
      // Calendar view: just the visible date range.
      query = query.gte("starts_at", from).lt("starts_at", to);
    } else {
      // Default: everything from a day ago onwards, so recently-passed booked demos stay visible.
      query = query.gte("starts_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    }
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ slots: data ?? [] });
  }

  // Customer view: only unbooked slots in the future.
  const { data, error } = await supabaseAdmin
    .from("demo_slots")
    .select("id, starts_at, duration_mins")
    .is("booked_at", null)
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ slots: data ?? [] });
}

// POST — support only: add slots.
//   Bulk: { slots: string[] (ISO), duration_mins }  — generated from a day's window.
//   Single: { starts_at (ISO), duration_mins }.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.email !== SUPPORT_EMAIL) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const duration = Number(body.duration_mins);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 480) {
    return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
  }

  // Normalise to a list of ISO instants (single-add is just a list of one).
  const raw: unknown[] = Array.isArray(body.slots) ? body.slots : [body.starts_at];
  const now = Date.now();
  const rows = raw
    .map((s) => new Date(s as string))
    .filter((d) => !isNaN(d.getTime()) && d.getTime() > now)
    .map((d) => ({ starts_at: d.toISOString(), duration_mins: duration, created_by: user.id }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid future times" }, { status: 400 });
  }

  // Ignore any slots that already exist at that instant (unique index on starts_at).
  const { data, error } = await supabaseAdmin
    .from("demo_slots")
    .upsert(rows, { onConflict: "starts_at", ignoreDuplicates: true })
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const created = data?.length ?? 0;
  return NextResponse.json({ created, skipped: rows.length - created });
}

// DELETE — support only.
//   ?id=            remove one slot (any state).
//   ?from=&to=      clear all UNBOOKED slots in a range (e.g. a whole day). Booked ones are kept.
export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.email !== SUPPORT_EMAIL) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const id = params.get("id");
  if (id) {
    const { error } = await supabaseAdmin.from("demo_slots").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const from = params.get("from");
  const to = params.get("to");
  if (from && to) {
    const { error } = await supabaseAdmin
      .from("demo_slots")
      .delete()
      .is("booked_at", null)
      .gte("starts_at", from)
      .lt("starts_at", to);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Missing id or range" }, { status: 400 });
}
