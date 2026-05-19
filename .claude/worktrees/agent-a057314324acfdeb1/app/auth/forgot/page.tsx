"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://kernelapp.co.uk/auth/confirm?next=/auth/reset-password",
    });

    if (resetError) {
      setLoading(false);
      setError("Something went wrong — please try again.");
      return;
    }

    setLoading(false);
    setSent(true);
  }

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kernel.png" alt="Kernel" className="w-24 h-24 object-contain drop-shadow-lg" />
        </div>

        <p className="font-serif text-5xl text-brown leading-none tracking-tight text-center mb-2">Kernel</p>
        <p className="text-base text-brown/60 mt-2 text-center">Reset your password</p>

        <div className="card p-6 mt-6">
          {sent ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-gray-700">
                Check your email — we&apos;ve sent a reset link to{" "}
                <span className="font-medium text-brown">{email}</span>.
              </p>
              <Link
                href="/login"
                className="block text-sm text-brown/60 hover:text-brown transition-colors mt-4"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@example.com"
                  autoFocus
                  autoComplete="email"
                  disabled={loading}
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 font-medium">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="btn-primary w-full"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>

              <div className="text-center">
                <Link
                  href="/login"
                  className="text-sm text-brown/60 hover:text-brown transition-colors"
                >
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
