"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function SignUpPage() {
  const router = useRouter();

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

    // 1. Create auth user directly from client
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });

    if (authError || !authData.user) {
      setError(authError?.message ?? "Failed to create account");
      setLoading(false);
      return;
    }

    // 2. Create organisation via SECURITY DEFINER function
    const { error: orgError } = await supabase.rpc("create_organisation_for_user", {
      p_org_name: orgName.trim(),
      p_user_name: fullName.trim(),
    });

    if (orgError) {
      setError("Account created but org setup failed: " + orgError.message);
      setLoading(false);
      return;
    }

    // 3. Redirect to Stripe checkout
    const checkoutRes = await fetch("/api/create-checkout-session", { method: "POST" });
    const checkoutData = await checkoutRes.json();

    if (checkoutData.url) {
      window.location.href = checkoutData.url;
    } else {
      router.push("/home");
      router.refresh();
    }
  }

  const ready = orgName.trim() && fullName.trim() && email.trim() && password && confirmPassword;

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">

        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kernel.png" alt="Kernel" className="h-20 w-auto mx-auto mb-3 drop-shadow-lg" />
          <p className="font-serif text-5xl text-brown leading-none tracking-tight">Kernel</p>
          <p className="text-sm text-brown/60 mt-2">Start your 7-day free trial</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business name *</label>
              <input
                type="text" value={orgName} onChange={e => setOrgName(e.target.value)}
                className="input" placeholder="e.g. Yep Kitchen"
                autoFocus autoComplete="organization" disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your name *</label>
              <input
                type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                className="input" placeholder="e.g. Tom Palmer"
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

          <p className="mt-4 text-center text-xs text-gray-400">
            7-day free trial · No charge until day 8 · Cancel any time
          </p>
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
