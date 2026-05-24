"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type State = "loading" | "accepting" | "success" | "error" | "no-token";

export default function AcceptInvitePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) { setState("no-token"); return; }

    // Wait briefly for Supabase to process the magic link and set the session
    const timer = setTimeout(() => acceptInvite(token), 800);
    return () => clearTimeout(timer);
  }, [searchParams]);

  async function acceptInvite(token: string) {
    setState("accepting");

    // Ensure the user is signed in (Supabase should have set the session from the magic link)
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setMessage("We couldn't verify your account. Please try clicking the invite link again.");
      setState("error");
      return;
    }

    const res = await fetch("/api/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error ?? "Failed to accept invite");
      setState("error");
      return;
    }

    setState("success");
    setTimeout(() => router.push("/home"), 2000);
  }

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <p className="font-serif text-5xl text-brown mb-8">Kernel</p>

        <div className="card p-8">
          {(state === "loading" || state === "accepting") && (
            <>
              <div className="w-10 h-10 border-2 border-brown/20 border-t-brown rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-brown/60">
                {state === "loading" ? "Verifying your invite…" : "Joining your team…"}
              </p>
            </>
          )}

          {state === "success" && (
            <>
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="h-7 w-7 text-green-600" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 10l5 5 7-7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2 className="text-lg font-serif text-brown mb-2">You&apos;re in!</h2>
              <p className="text-sm text-brown/60">Taking you to Kernel…</p>
            </>
          )}

          {state === "error" && (
            <>
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <svg className="h-7 w-7 text-red-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="10" cy="10" r="8"/>
                  <path d="M10 6v4M10 14h.01" strokeLinecap="round"/>
                </svg>
              </div>
              <h2 className="text-lg font-serif text-brown mb-2">Something went wrong</h2>
              <p className="text-sm text-brown/60 mb-6">{message}</p>
              <Link href="/login" className="btn-primary inline-block px-6 py-2 text-sm">
                Go to sign in
              </Link>
            </>
          )}

          {state === "no-token" && (
            <>
              <p className="text-sm text-brown/60 mb-4">This invite link is invalid or has expired.</p>
              <Link href="/login" className="btn-primary inline-block px-6 py-2 text-sm">
                Go to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
