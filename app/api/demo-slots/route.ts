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
    // Everything from a day ago onwards, so recently-passed booked demos stay visible.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("demo_slots")
      .select("*")
      .gte("starts_at", since)
      .order("starts_at", { ascending: true });
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

// POST — support only: add a slot. Body { starts_at (ISO), duration_mins }.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.email !== SUPPORT_EMAIL) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { starts_at, duration_mins } = await req.json();
  const when = new Date(starts_at);
  if (isNaN(when.getTime())) {
    return NextResponse.json({ error: "Invalid date/time" }, { status: 400 });
  }
  const duration = Number(duration_mins);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 480) {
    return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("demo_slots")
    .insert({ starts_at: when.toISOString(), duration_mins: duration, created_by: user.id })
    .select("*")
    .single();

  if (error) {
    // Unique index on starts_at → duplicate slot
    if (error.code === "23505") {
      return NextResponse.json({ error: "There's already a slot at that time" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ slot: data });
}

// DELETE — support only: remove a slot by ?id=.
export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.email !== SUPPORT_EMAIL) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabaseAdmin.from("demo_slots").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
