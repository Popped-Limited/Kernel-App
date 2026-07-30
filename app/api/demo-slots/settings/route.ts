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

// GET — support only: current demo meeting link.
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.email !== SUPPORT_EMAIL) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("demo_settings")
    .select("meeting_url")
    .eq("id", 1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ meeting_url: data?.meeting_url ?? "" });
}

// POST — support only: save the demo meeting link. Body { meeting_url }.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.email !== SUPPORT_EMAIL) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { meeting_url } = await req.json();
  const url = typeof meeting_url === "string" ? meeting_url.trim() : "";
  if (url && !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Enter a full link starting with https://" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("demo_settings")
    .upsert({ id: 1, meeting_url: url || null, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ meeting_url: url });
}
