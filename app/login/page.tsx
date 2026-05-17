"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/";

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [popState, setPopState] = useState<"idle" | "popping" | "popped">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, from }),
    });

    const data = await res.json();

    if (!res.ok) {
      setLoading(false);
      setError("Incorrect password — please try again.");
      setPassword("");
      return;
    }

    // Trigger pop animation, then navigate
    setPopState("popping");
    setTimeout(() => setPopState("popped"), 550);
    setTimeout(() => {
      router.push(data.redirect ?? "/dashboard");
      router.refresh();
    }, 1400);
  }

  return (
    <>
      {/* Kernel → Popcorn animation */}
      <div className="flex justify-center mb-2" style={{ height: 288 }}>
        {popState === "popped" ? (
          <img
            src="/popcorn.png"
            alt="Popcorn"
            className="w-72 h-72 object-contain"
            style={{ animation: "popcornBurst 0.7s cubic-bezier(0.34,1.56,0.64,1) forwards" }}
          />
        ) : (
          <img
            src="/kernel.png"
            alt="Kernel"
            className="w-72 h-72 object-contain drop-shadow-2xl"
            style={popState === "popping" ? { animation: "kernelPop 0.6s cubic-bezier(0.36,0.07,0.19,0.97) forwards" } : {}}
          />
        )}
      </div>

      <style>{`
        @keyframes kernelPop {
          0%   { transform: scale(1) rotate(0deg); opacity: 1; }
          20%  { transform: scale(1.1) rotate(-8deg); opacity: 1; }
          40%  { transform: scale(1.15) rotate(8deg); opacity: 1; }
          65%  { transform: scale(1.25) rotate(-4deg); opacity: 1; }
          85%  { transform: scale(0.4) rotate(15deg); opacity: 0; }
          100% { transform: scale(0); opacity: 0; }
        }
        @keyframes popcornBurst {
          0%   { transform: scale(0) rotate(-20deg); opacity: 0; }
          55%  { transform: scale(1.12) rotate(6deg); opacity: 1; }
          75%  { transform: scale(0.96) rotate(-3deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
      `}</style>

      <p className="font-serif text-8xl text-brown leading-none tracking-tight text-center">Kernel</p>
      <p className="text-base text-brown/60 mt-3 text-center">Sign in to continue</p>

      <div className="card p-6 mt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input"
              placeholder="Enter password"
              autoFocus
              autoComplete="current-password"
              disabled={loading || popState !== "idle"}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password || popState !== "idle"}
            className="btn-primary w-full"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
