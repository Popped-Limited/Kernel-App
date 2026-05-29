"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

/**
 * Client-side auth callback — handles both auth flows Supabase may use:
 *
 *  1. PKCE flow  — Supabase appends ?code=xxx to the URL.
 *     We call exchangeCodeForSession(code).
 *
 *  2. Implicit / invite flow — Supabase appends #access_token=...&refresh_token=...
 *     The @supabase/ssr browser client defaults to PKCE mode and does NOT
 *     automatically process hash fragments, so we parse and call setSession()
 *     explicitly. This also handles the case where an existing (different) session
 *     is in cookies — setSession() replaces it with the invite session.
 */
function AuthCallbackContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const next = searchParams.get("next") ?? "/home";
    let done = false;

    function redirect() {
      if (!done) {
        done = true;
        router.replace(next);
      }
    }

    // --- PKCE flow: ?code=xxx ---
    const code = searchParams.get("code");
    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error }) => {
          if (!error) redirect();
          else setFailed(true);
        });
      return;
    }

    // --- Implicit / invite flow: #access_token=...&refresh_token=... ---
    // The SSR browser client won't auto-process these, so we do it manually.
    const hash = typeof window !== "undefined" ? window.location.hash.substring(1) : "";
    if (hash) {
      const params  = new URLSearchParams(hash);
      const access  = params.get("access_token");
      const refresh = params.get("refresh_token");

      if (access && refresh) {
        supabase.auth
          .setSession({ access_token: access, refresh_token: refresh })
          .then(({ error }) => {
            if (!error) redirect();
            else setFailed(true);
          });
        return;
      }

      // Hash present but no tokens — might be an error response from Supabase
      const errDesc = params.get("error_description");
      if (errDesc) {
        console.error("Auth error from Supabase:", errDesc);
        setFailed(true);
        return;
      }
    }

    // --- No code, no hash — fall back to any existing session ---
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) redirect();
      else setFailed(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) {
    return (
      <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <p className="font-serif text-5xl text-brown mb-8">Kernel</p>
          <div className="card p-8">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <svg className="h-7 w-7 text-red-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="10" cy="10" r="8"/>
                <path d="M10 6v4M10 14h.01" strokeLinecap="round"/>
              </svg>
            </div>
            <h2 className="text-lg font-serif text-brown mb-2">Link expired</h2>
            <p className="text-sm text-brown/60 mb-6">
              This link is invalid or has expired. Ask your admin to send a fresh invite.
            </p>
            <Link href="/login" className="btn-primary inline-block px-6 py-2 text-sm">
              Go to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-brown/20 border-t-brown rounded-full animate-spin" />
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-brand-cream flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-brown/20 border-t-brown rounded-full animate-spin" />
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
