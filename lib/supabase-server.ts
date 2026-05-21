import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client using the anon key.
// Used in API routes where the service role key is not available.
// Relies on permissive RLS INSERT policies for public operations.
export const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
