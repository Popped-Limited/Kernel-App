"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

/**
 * Client-side auth callback — handles both auth flows that Supabase may use:
 *
 *  1. PKCE flow  — Supabase appends ?code=xxx to the redirectTo URL.
 *     We call exchangeCodeForSession(code) to turn it into a cookie session.
 *
 *  2. Implicit / invite flow — Supabase appends #access_token=...&refresh_token=...
 *     to the redirectTo URL. The @supabase/ssr browser client detects these hash
 *     fragments automatically on init and stores the session in cookies.
 *     We just wait for the SIGNED_IN event (or a populated getSession() result).
 *
 * Once a session is confirmed, we redirect to the `next` query param (default /home).
 */
function AuthCallbackContent() {
  const router     = useRouter();
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

    // --- Implicit / invite flow: #access_token=... ---
    // The browser client processes the hash automatically on init.
    // Subscribe to catch the SIGNED_IN event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => { if (session) redirect(); }
    );

    // Also check immediately — the event may have already fired before
    // our useEffect ran (the client initialised when the module was imported).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) redirect();
    });

    // Safety net: if nothing has resolved after 5 s, show an error.
    const timer = setTimeout(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) redirect();
        else if (!done) setFailed(true);
      });
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
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
