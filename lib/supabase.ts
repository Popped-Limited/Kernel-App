import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// We type our data via explicit state annotations in components rather than
// via Database generics, which require Supabase's CLI-generated types to work correctly.
export const supabase = createBrowserClient(url, anon);
