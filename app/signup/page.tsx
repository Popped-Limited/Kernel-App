"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function SignUpForm() {
  const searchParams   = useSearchParams();
  const referralSource = searchParams.get("ref") === "beacon" ? "beacon" : null;

  const [orgName, setOrgName]                 = useState("");
  const [fullName, setFullName]               = useState("");
  const [email, setEmail]                     = useState("");
  const [password, setPassword]               = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) { setError("Passwords don't match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }

    setLoading(true);

    try {
      // Step 1: Create account + organisation on the server
      const signupRes = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name:        orgName.trim(),
          user_name:       fullName.trim(),
          email:           email.trim(),
          password,
          referral_source: referralSource,
        }),
      });

      const signupData = await signupRes.json();
      if (!signupRes.ok) {
        setError(signupData.error ?? "Failed to create account");
        setLoading(false);
        return;
      }

      // Step 2: Sign in to establish a proper session (stored in cookies by createBrowserClient)
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        setError("Account created but sign-in failed — please sign in manually");
        setLoading(false);
        return;
      }

      // Step 3: Create Stripe checkout session (session is now in cookies)
      const checkoutRes = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referral_source: referralSource }),
      });
      const checkoutData = await checkoutRes.json();

      if (checkoutData.url) {
        window.location.href = checkoutData.url;
      } else {
        setError("Failed to start billing setup: " + (checkoutData.error ?? "Unknown error"));
        setLoading(false);
      }

    } catch (err) {
      console.error("Signup error:", err);
      setError("Something went wrong — please try again");
      setLoading(false);
    }
  }

  const ready = orgName.trim() && fullName.trim() && email.trim() && password && confirmPassword;

  const trialLabel = referralSource === "beacon"
    ? "Your first month is on us — referred by Beacon Compliance"
    : "7-day free trial · No charge until day 8 · Cancel any time";

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">

        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kernel.png" alt="Kernel" className="h-20 w-auto mx-auto mb-3 drop-shadow-lg" />
          <p className="font-serif text-5xl text-brown leading-none tracking-tight">Kernel</p>
          <p className="text-sm text-brown/60 mt-2">
            {referralSource === "beacon" ? "Create your account" : "Start your 7-day free trial"}
          </p>
        </div>

        {referralSource === "beacon" && (
          <div className="mb-4 rounded-lg bg-brand/20 border border-brand px-4 py-3 text-sm text-brown text-center">
            Referred by <span className="font-semibold">Beacon Compliance</span> — your first month is completely free.
          </div>
        )}

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business name *</label>
              <input
                type="text" value={orgName} onChange={e => setOrgName(e.target.value)}
                className="input" placeholder="e.g. Acme Bakery"
                autoFocus autoComplete="organization" disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your name *</label>
              <input
                type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                className="input" placeholder="e.g. Jane Smith"
                autoComplete="name" disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="input" placeholder="you@yourbusiness.com"
                autoComplete="email" disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="input" placeholder="Min. 8 characters"
                autoComplete="new-password" disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password *</label>
              <input
                type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                className="input" placeholder="Repeat password"
                autoComplete="new-password" disabled={loading}
              />
            </div>

            {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

            <button type="submit" disabled={loading || !ready} className="btn-primary w-full py-2.5">
              {loading ? "Creating your account…" : "Start free trial"}
            </button>
          </form>

          {!referralSource && (
            <p className="mt-4 text-center text-xs text-gray-400">{trialLabel}</p>
          )}
        </div>

        <p className="mt-4 text-center text-sm text-brown/60">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brown hover:underline">Sign in</Link>
        </p>
        <p className="mt-3 text-center text-xs text-gray-400">
          By signing up you agree to our{" "}
          <Link href="/terms" className="underline hover:text-gray-600">Terms</Link>{" "}and{" "}
          <Link href="/privacy" className="underline hover:text-gray-600">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
