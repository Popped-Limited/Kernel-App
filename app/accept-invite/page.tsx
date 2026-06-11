"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type State = "loading" | "accepting" | "set-password" | "saving-password" | "success" | "error" | "no-token";

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [state, setState]     = useState<State>("loading");
  const [message, setMessage] = useState("");
  const [fullName, setFullName]             = useState("");
  const [password, setPassword]             = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError]   = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) { setState("no-token"); return; }
    const timer = setTimeout(() => acceptInvite(token), 800);
    return () => clearTimeout(timer);
  }, [searchParams]);

  async function acceptInvite(token: string) {
    setState("accepting");

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

    // Invite accepted — now ask them to set a password so they can log in later
    setState("set-password");
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");

    if (!fullName.trim()) { setPasswordError("Please enter your name"); return; }
    if (password.length < 8) { setPasswordError("Password must be at least 8 characters"); return; }
    if (password !== confirmPassword) { setPasswordError("Passwords don't match"); return; }

    setState("saving-password");

    const { error } = await supabase.auth.updateUser({ password, data: { full_name: fullName.trim() } });
    if (error) {
      setPasswordError(error.message);
      setState("set-password");
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

          {(state === "set-password" || state === "saving-password") && (
            <>
              <div className="w-12 h-12 rounded-full bg-brand/30 flex items-center justify-center mx-auto mb-4">
                <svg className="h-6 w-6 text-brown" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="5" y="9" width="10" height="8" rx="1.5"/>
                  <path d="M7 9V6.5a3 3 0 016 0V9" strokeLinecap="round"/>
                </svg>
              </div>
              <h2 className="text-lg font-serif text-brown mb-1">Set your password</h2>
              <p className="text-sm text-brown/60 mb-6">Choose a password so you can sign in next time.</p>
              <form onSubmit={handleSetPassword} className="space-y-3 text-left">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="input"
                    placeholder="e.g. Jane Smith"
                    autoFocus
                    disabled={state === "saving-password"}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input"
                    placeholder="Min. 8 characters"
                    disabled={state === "saving-password"}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="input"
                    placeholder="Repeat password"
                    disabled={state === "saving-password"}
                  />
                </div>
                {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
                <button
                  type="submit"
                  disabled={state === "saving-password" || !fullName.trim() || !password || !confirmPassword}
                  className="btn-primary w-full py-2.5 mt-2"
                >
                  {state === "saving-password" ? "Saving…" : "Set password & continue"}
                </button>
              </form>
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

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-brand-cream flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-brown/20 border-t-brown rounded-full animate-spin" />
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  );
}
